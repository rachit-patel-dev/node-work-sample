/*external modules*/
import * as _ from 'lodash';
import { PoolClient } from 'pg';
import * as Sentry from '@sentry/node';
/*DB*/
import { sql } from '..';
import { HIDDEN_MATCHED_PRO_TABLE, ProjectMatchData } from '../types/project';
import { Role, UserRole, ROLE_TABLE } from '../types/role';
import { CONTRACT_TABLE } from '../types/contract';
import { COMPANY_TABLE } from '../types/company';
import {
  BUDGET_RANGES,
  PRO_PERSONALITY_MATRIX,
  PRO_TYPE_SCORES,
  PRIORITY_TYPES,
  SPECIALTY_SCORES,
  PRO_QUALITIES_SCORE,
  PRO_PERSONALITY_SCORE,
  PRO_TYPE_SCORE_MULTIPLIER,
  SPECIALTY_SCORE_MULTIPLIER,
  PERSONALITY_SCORE_MULTIPLIER,
  QUALITIES_SCORE_MULTIPLIER,
  MIN_SCORE
} from './matchConfig';
import { ADDRESS_TABLE } from '../types/address';
import { USER_TABLE } from '../types/user';
/*models*/
/*GQL*/
import { GraphQLError } from '../../gql';
/*other*/
import { getMatchData, MatchDataTableRow } from './syncMatchData';

export async function matchPros(
  project: { id: string; matchData: ProjectMatchData; omitPros?: string[] },
  client: PoolClient,
  options: { limit?: number } = { limit: 6 }
): Promise<MatchedPartner[]> {
  try {
    const matchDataTable = (await getMatchData()).table;
    const workTypes = matchDataTable[project.matchData.type];
    const { proTypes, proSpecialties } = transformMatchData(project, workTypes);

    const budgetValue = BUDGET_RANGES[project.matchData.budget];
    const budget = budgetValue ? sql`<= ${budgetValue}` : sql`>= 0`;
    const { rows: selectedPros } = await client.query<Role>(
      sql`
      SELECT roles.*
      FROM ${ROLE_TABLE} roles
        INNER JOIN ${USER_TABLE} users
          ON users."id" = roles."userId" AND NOT users."deleted"
        LEFT JOIN ${CONTRACT_TABLE} contracts
            ON (contracts."partnerId" = roles."id" AND contracts."projectId" = ${project.id})
        LEFT JOIN ${HIDDEN_MATCHED_PRO_TABLE} hidden_pros
            ON (hidden_pros."roleId" = roles."id" AND hidden_pros."projectId" = ${project.id})
        INNER JOIN ${COMPANY_TABLE} companies
            INNER JOIN ${ADDRESS_TABLE} addresses ON addresses."companyId" = companies."id"
          ON companies."roleId" = roles."id"
      WHERE roles.name = ${UserRole.Pro}
        AND roles."id" != ALL(${project.omitPros ?? []})
        AND roles."showInMatch" = true
        AND roles."hideInMatch" = false
        AND COALESCE((roles."data" ->> 'minBudget')::INT, 0) ${budget}
        AND roles."data" -> 'proType' ?| ${proTypes}
        AND roles."data" -> 'specialties' ?| ${proSpecialties}
        AND st_DistanceSphere(
                    addresses."geom",
                    st_MakePoint(
                            ${project.matchData.location.lon},
                            ${project.matchData.location.lat}
                        )
                ) < (
                  CASE WHEN (COALESCE((roles."data" ->> 'maxDistance')::INT, 50) > 50)
                    THEN 50
                    ELSE COALESCE((roles."data" ->> 'maxDistance')::INT, 50)
                  END
                ) * 1609.34
        AND contracts IS NULL
        AND hidden_pros IS NULL
    `.setName('match-pro-for-owner')
    );

    const compatiblePersonalitiesMatrix = PRO_PERSONALITY_MATRIX.find(([personality]) => {
      const personalityIntersection = intersection(personality, project.matchData.personality);
      return personalityIntersection.length === 4;
    });
    if (!compatiblePersonalitiesMatrix) {
      throw new GraphQLError('Match error');
    }
    const compatiblePersonalities = compatiblePersonalitiesMatrix[1];
    const priority = project.matchData.priority;

    let maxTypeScore = 0;
    let maxSpecialtyScore = 0;
    let maxQualitiesScore = 0;
    let maxPersonalityScore = 0;
    let scoredPros: (MatchedPartner & { partner: Role })[] = [];
    for (const selectedPro of selectedPros) {
      const explain: MatchScoreExplain = {
        proType: { score: 0, scoreAbs: 0, matched: [] },
        specialty: { score: 0, scoreAbs: 0, matched: [] },
        qualities: { intersection: [], scoreAbs: 0, score: 0 },
        personality: { compatibleIndex: -1, scoreAbs: 0, score: 0 }
      };
      let typeScore = 0;
      let specialtyScore = 0;
      for (const scope of project.matchData.scopeMain) {
        const workType = workTypes[scope];
        // Hack: But we report about error before this
        if (!workType) continue;

        // PRO TYPE SCORE
        let maxCurrentTypeScore = 0;
        for (const proType of selectedPro.data.proType) {
          const mark = workType.proType[proType];
          if (!mark) continue;

          let currentScore = 0;
          const priorityType = mark[0] as 'A' | 'C' | 'T' | 'D';
          const scoreLevel = Number(mark[1]) - 1;

          if (priorityType === 'A') {
            currentScore = PRO_TYPE_SCORES[0][scoreLevel];
          } else {
            const priorityLevel = PRIORITY_TYPES[priorityType] as 'cost' | 'time' | 'design';
            const scoreRange = PRO_TYPE_SCORES[priority[priorityLevel] - 1];
            currentScore = scoreRange[scoreLevel];
          }

          if (currentScore > maxCurrentTypeScore) {
            maxCurrentTypeScore = currentScore;
          }
          explain.proType.matched.push({
            scope,
            proType,
            score: currentScore,
            mark
          });
        }
        typeScore += maxCurrentTypeScore;

        // PRO SPECIALTY SCORE
        let maxCurrentSpecialtyScore = 0;
        for (const specialty of selectedPro.data.specialties) {
          const score = workType.specialty[specialty];
          if (!score) continue;

          const currentScore = SPECIALTY_SCORES[score - 1];
          if (currentScore > maxCurrentSpecialtyScore) {
            maxCurrentSpecialtyScore = currentScore;
          }
          explain.specialty.matched.push({
            scope,
            specialty,
            score: currentScore,
            mark: score
          });
        }
        specialtyScore += maxCurrentSpecialtyScore;
      }
      explain.proType.scoreAbs = typeScore;
      explain.specialty.scoreAbs = specialtyScore;

      // QUALITIES SCORE
      const qualitiesIntersection = intersection(selectedPro.data.qualities, project.matchData.proQualities);
      const qualitiesScore = qualitiesIntersection.length * PRO_QUALITIES_SCORE;
      explain.qualities.intersection = qualitiesIntersection;
      explain.qualities.scoreAbs = qualitiesScore;

      // PERSONALITY SCORE
      const compatiblePersonalityIndex = compatiblePersonalities.findIndex(personality => {
        const personalityIntersection = intersection(personality, selectedPro.data.personality);
        return personalityIntersection.length === 4;
      });
      const personalityScore = (compatiblePersonalities.length - compatiblePersonalityIndex) * PRO_PERSONALITY_SCORE;
      explain.personality.compatibleIndex = compatiblePersonalityIndex;
      explain.personality.scoreAbs = personalityScore;

      // MAX SCORES
      if (typeScore > maxTypeScore) maxTypeScore = typeScore;
      if (specialtyScore > maxSpecialtyScore) {
        maxSpecialtyScore = specialtyScore;
      }
      if (qualitiesScore > maxQualitiesScore) {
        maxQualitiesScore = qualitiesScore;
      }
      if (personalityScore > maxPersonalityScore) {
        maxPersonalityScore = personalityScore;
      }

      scoredPros.push({
        id: selectedPro.id,
        score: 0,
        typeScore,
        specialtyScore,
        qualitiesScore,
        personalityScore,
        partner: selectedPro,
        explain
      });
    }

    scoredPros = scoredPros.map((scoredPro): MatchedPartner & {
      partner: Role;
    } => {
      const typeScore = scaleScore(scoredPro.typeScore, maxTypeScore, PRO_TYPE_SCORE_MULTIPLIER);
      scoredPro.explain.proType.score = typeScore;

      const specialtyScore = scaleScore(scoredPro.specialtyScore, maxSpecialtyScore, SPECIALTY_SCORE_MULTIPLIER);
      scoredPro.explain.specialty.score = specialtyScore;

      const qualitiesScore = scaleScore(scoredPro.qualitiesScore, maxQualitiesScore, QUALITIES_SCORE_MULTIPLIER);
      scoredPro.explain.qualities.score = qualitiesScore;

      const personalityScore = scaleScore(
        scoredPro.personalityScore,
        maxPersonalityScore,
        PERSONALITY_SCORE_MULTIPLIER
      );
      scoredPro.explain.personality.score = personalityScore;

      const score = Math.round(typeScore + specialtyScore + qualitiesScore + personalityScore);

      return {
        id: scoredPro.id,
        partner: scoredPro.partner,
        score,
        typeScore,
        specialtyScore,
        qualitiesScore,
        personalityScore,
        explain: scoredPro.explain
      };
    });

    // Sort in descending order -> 100, 99, 98…
    scoredPros.sort((pro1, pro2) => pro2.score - pro1.score);

    return scoredPros.slice(0, options.limit);
  } catch (e) {
    throw new GraphQLError('Match error');
  }
}

/**
 * Transforms the match data for a project.
 * 
 * @param project - The project object containing the match data.
 * @param workTypes - The match data for different work types.
 * @returns An object containing the transformed match data with pro types and pro specialties.
 */
function transformMatchData(project: { matchData: ProjectMatchData }, workTypes: MatchDataTableRow) {
  const exactExceptionRule = project.matchData.mindset === 'KnowExactly';

  const proTypes = new Set<string>();
  const proSpecialties = new Set<string>();
  for (const scope of project.matchData.scopeMain) {
    const workType = workTypes[scope];

    // If we cannot find this scope report it to sentry and skip in matching
    if (!workType) {
      Sentry.captureException(new Error(`Cannot find matching data for ${scope}`));
      continue;
    }

    for (const currentProSpecilty in workType.specialty) {
      proSpecialties.add(currentProSpecilty);
    }

    if (!exactExceptionRule) {
      for (const currentProType in workType.proType) {
        proTypes.add(currentProType);
      }
    }
  }

  if (exactExceptionRule) proTypes.add('GeneralContractor');

  return {
    proTypes: Array.from(proTypes),
    proSpecialties: Array.from(proSpecialties)
  };
}

/**
 * Returns an array containing the intersection of two arrays.
 *
 * @template T - The type of elements in the arrays.
 * @param {T[]} arr1 - The first array.
 * @param {T[]} arr2 - The second array.
 * @returns {T[]} - An array containing the common elements between the two arrays.
 */
function intersection<T>(arr1: T[], arr2: T[]): T[] {
  const result: T[] = [];
  for (const val1 of arr1) {
    if (_.includes(arr2, val1)) result.push(val1);
  }
  return result;
}

function scaleScore(current: number, max: number, multiplier: number): number {
  /**
   * 1. Find ration of score multiplier.
   *    Example:
   *      PRO_TYPE_MULTIPLIER = 50
   *      ratio = 50 / 100 = 0.5
   */
  const ratio = multiplier / 100;
  /**
   * 2. Scale original multiplier according to the ration and a new range
   *    Example:
   *      ratio = 0.5
   *      MIN_SCORE = 75
   *      scaledMultiplier = (100 - 75) * 0.5 = 12.5
   */
  const scaledMultiplier = (100 - MIN_SCORE) * ratio;
  /**
   * 3. Calculate score relative to the max available score
   *    Example:
   *      current = 300
   *      max = 900
   *      score = (1 + 300) / (1 + 900) = 0.334…
   */
  const score = (1 + current) / (1 + max);
  /**
   * 4. Get the final score
   *    Example:
   *      score = 0.33
   *      scaledMultiplier = 12.5
   *      MIN_SCORE = 75
   *      ratio = 0.5
   *      result = 0.334 * 12.5 + 75 * 0.5 = 41.625
   */
  return score * scaledMultiplier + MIN_SCORE * ratio;
}

export interface MatchedPartner {
  id: string;
  partner: Role;
  score: number;
  typeScore: number;
  specialtyScore: number;
  qualitiesScore: number;
  personalityScore: number;
  explain: MatchScoreExplain;
}

export interface MatchScoreExplain {
  proType: {
    score: number;
    scoreAbs: number;
    matched: { scope: string; proType: string; score: number; mark: string }[];
  };
  specialty: {
    score: number;
    scoreAbs: number;
    matched: {
      scope: string;
      specialty: string;
      score: number;
      mark: number;
    }[];
  };
  qualities: { intersection: string[]; scoreAbs: number; score: number };
  personality: {
    compatibleIndex: number;
    scoreAbs: number;
    score: number;
  };
}
