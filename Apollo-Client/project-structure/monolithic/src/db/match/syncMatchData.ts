import { redis } from '../redis';
import { config } from '../../config';
import { getAccessToken } from '../../auth/oauth/googleCloud';
import { makeRequest } from '../../http/client';
import { Mime } from '../../utils/mime';
import * as bodyParser from '../../http/middleware/bodyParser';
import { logger } from '../../logger';
import { proType, specialties as proSpecialties } from '../quests/pro';
import { projectType } from '../quests/homeOwner';
import { invert } from '../../utils/object';
import { getProjectTypeOptions } from '../dataUtils/getProjectTypeOptions';

const proTypesInverted = invert(proType.options);
const proSpecialtiesInverted = invert(proSpecialties.options);
const projectTypesInverted: { [key: string]: string } = Object.keys(projectType.options).reduce(
  (projectTypes, projectTypeKey) => {
    const key = projectTypeKey as keyof typeof projectType.options;
    const type = projectType.options[key];
    return Object.assign(projectTypes, { [type.text]: projectTypeKey });
  },
  {}
);

const API_URL = 'https://content-sheets.googleapis.com/v4/spreadsheets';
const MATCH_DATA_KEY = 'match:data';

/**
 * Get match data stored in the redis
 */
export async function getMatchData(): Promise<{
  table: MatchDataTable;
  updatedAt: Date;
}> {
  const [table, updatedAt] = (await redis.hmget(MATCH_DATA_KEY, 'table', 'updatedAt')) as Required<string[]>;

  return {
    table: JSON.parse(table),
    updatedAt: new Date(Number(updatedAt))
  };
}

/**
 * Sync match data from google sheets into redis. Update will be skipped if data
 * exists in redis. To force update provide true as first param.
 *
 * @param force = false Force update
 */
export async function syncMatchData(force = false): Promise<void> {
  const dataExists = await redis.exists(MATCH_DATA_KEY);
  if (!force && dataExists > 0) {
    logger.debug('Match data already exists');
    return;
  }
  logger.info(
    {
      proTypesDoc: config.matching.proTypesDoc,
      specialtiesDoc: config.matching.proSpecialtiesDoc
    },
    'Syncing match data'
  );

  const proTypesReq = getSheet(config.matching.proTypesDoc, 'Q61');
  const specialtiesReq = getSheet(config.matching.proSpecialtiesDoc, 'Y61');
  const [proTypesSheet, specialtiesSheet] = await Promise.all([proTypesReq, specialtiesReq]);

  let proTypesNames = proTypesSheet.shift();
  if (!proTypesNames) throw new Error('Pro Type Match sheet is empty');
  proTypesNames = proTypesNames.slice(1).map(name => {
    const invertedName = proTypesInverted[name];
    if (!invertedName) throw new Error(`Cannot find pro type ${name}`);
    return invertedName;
  });

  let specialtiesNames = specialtiesSheet.shift();
  if (!specialtiesNames) throw new Error('Specialties Match sheet is empty');
  specialtiesNames = specialtiesNames.slice(1).map(name => {
    const invertedName = proSpecialtiesInverted[name];
    if (!invertedName) throw new Error(`Cannot find pro type ${name}`);
    return invertedName;
  });

  const matchDataTable: MatchDataTable = {};
  let currentProjectType: string | undefined;
  for (const [index, projectTypeRow] of proTypesSheet.entries()) {
    const specialtyRow = specialtiesSheet[index];

    const proTypeScope = projectTypeRow.shift();
    const specialtyScope = specialtyRow.shift();
    if (!proTypeScope || !specialtyScope || proTypeScope !== specialtyScope) {
      throw new Error(`Rows mismatch, row #${index} expected to be ${proTypeScope} received ${specialtyScope}`);
    }

    if (projectTypeRow.length < 1) {
      currentProjectType = projectTypesInverted[proTypeScope];
      continue;
    }
    if (!currentProjectType) {
      throw new Error(`Cannot find key for ${proTypeScope}`);
    }

    if (!matchDataTable[currentProjectType]) {
      matchDataTable[currentProjectType] = {};
    }

    const projectTypeOptions = invert(getProjectTypeOptions(currentProjectType));

    const currentScope = projectTypeOptions[proTypeScope];
    if (!currentScope) throw new Error(`Cannot find scope ${proTypeScope}`);

    if (!matchDataTable[currentProjectType][currentScope]) {
      matchDataTable[currentProjectType][currentScope] = {
        proType: {},
        specialty: {}
      };
    }

    for (const [scoreIndex, score] of projectTypeRow.entries()) {
      if (!score) continue;
      const proTypeName = proTypesNames[scoreIndex];
      if (!proTypeName) {
        throw new Error(`Cannot find pro type name at ${scoreIndex}`);
      }
      matchDataTable[currentProjectType][currentScope].proType[proTypeName] = score;
    }

    for (const [scoreIndex, score] of specialtyRow.entries()) {
      if (!score) continue;
      const specialtyName = specialtiesNames[scoreIndex];
      if (!specialtyName) {
        throw new Error(`Cannot find specialty name at ${scoreIndex}`);
      }
      matchDataTable[currentProjectType][currentScope].specialty[specialtyName] = Number(score);
    }
  }

  await redis.hmset(MATCH_DATA_KEY, {
    table: JSON.stringify(matchDataTable),
    updatedAt: Date.now()
  });
}

/**
 * Get all values from spreadsheet by range
 * https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets.values/get
 *
 * @param sheetId Sheet ID
 * @param range   Latest row+column
 */
async function getSheet(sheetId: string, range: string) {
  const token = await getAccessToken();
  const res = await makeRequest(`${API_URL}/${sheetId}/values/A1:${range}?majorDimension=ROWS`, {
    headers: {
      accept: Mime.JSON,
      'content-type': Mime.JSON,
      authorization: `${token.tokenType} ${token.accessToken}`
    }
  });

  const json = await bodyParser.json<{ values: string[][] }>(res);
  return json.values;
}

export interface MatchDataTable {
  [key: string]: MatchDataTableRow;
}

export interface MatchDataTableRow {
  [key: string]: {
    proType: { [key: string]: string };
    specialty: { [key: string]: number };
  };
}
