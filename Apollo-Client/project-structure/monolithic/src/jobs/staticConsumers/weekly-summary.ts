/*external modules*/
import _ from 'lodash';
import { Job } from 'bull';
import moment, { Moment } from 'moment';
/*DB*/
import * as db from '../../db';
import { getClientTransaction } from '../../db';
import { Contract, CONTRACT_TABLE, ContractStatus } from '../../db/types/contract';
import { CollaboratorPermission } from '../../db/types/collaborator';
import { UserRole } from '../../db/types/role';
import { TaskStatus } from '../../db/types/task';
import { Phase } from '../../db/types/phase';
import { ContractActivityType } from '../../db/types/contractActivity';
import { ChangeOrderStatus } from '../../db/types/changeOrder';
/*models*/
import { ContractModel } from '../../db/models/ContractModel';
import { UserWithRole } from '../../db/models/RoleModel';
/*GQL*/
import { execQuery } from '../../test/gql';
import { PhasePaymentStatus } from '../../gql/resolvers/PhasePaymentStatus';
import { ContractSummary } from '../../gql/resolvers/Types/Contract/ContractSummary';
import { UserRequiredActions } from '../../gql/resolvers/UserRequiredActions';
import { ContractActivity } from '../../gql/resolvers/Types/Contract/Activity/ContractActivity';
import { TaskSummary } from '../../gql/resolvers/Types/Task/TaskSummary';
/*other*/
import { logger } from '../../logger';
import { naivePluralize } from '../../utils/pluralize';
import jobWorker from '../index';
import { config } from '../../config';
import formatMoney from '../../utils/formatMoney';

export interface WeeklySummaryOptions {}

type PopulatedUser = UserWithRole & {
  contractId: string;
  contractName: string;
  roleName: UserRole;
  data: TQuery;
};

type TQuery = {
  getContractSummary: ContractSummary;
  getContractActivities: ContractActivity[];
  getUserRequiredActions: UserRequiredActions;
};
const CONTRACT_PROGRESS_QUERY = `
  query ($contractId: ID!, $lastActivity: DateTime) {
    getContractSummary(contractId: $contractId) {
      total
      targetEndDate
      targetStartDate
      initialEndDate
      partner {
        id
        user {
          id
          email
          firstName
          lastName
        }
      }
      owner {
        id
        user {
          id
          firstName
          lastName
        }
      }
      createdAt
      phases {
        id
        name
        startDate
        endDate
        initialTotal
        total
        paymentStatus
        totalTodo
        totalDoing
        totalDone
        tasks {
          id
          name
          startDate
          endDate
          status
          total
          initialTotal
          paymentStatus
          assignees {
            id
            user {
              id
              firstName
              lastName
            }
          }
          changeOrders {
            id
            status
          }
          decisions {
            id
            title
            dueDate
            status
            createdAt
            updatedAt
            task {
              id
              name
            }
            createdBy {
              id
              user {
                id
              }
            }
            decisionMakers {
              id
              user {
                id
              }
            }
          }
        }
      }
      openChangeOrders
      approvedChangeOrders
    }
    getContractActivities(contractId: $contractId, lastActivity: $lastActivity) {
      id
      type
      data
      createdAt
      taskId
      contractId
      changeOrderId
      fileId
      decisionId
      decisionResultId
      scheduleId
      taskReminderId
      role {
        id
        user {
          id
          firstName
          lastName
          avatar {
            id
            mime
            thumbnail(width: 64)
            name
            url
          }
        }
      }
    }
    getUserRequiredActions(contractId: $contractId) {
      changeOrders {
        id
        status
        tasksVersions {
          id
          name
        }
        requester {
          id
          user {
            id
            firstName
            lastName
            avatar {
              id
              mime
              name
              url
            }
          }
        }
        createdAt
      }
      payments {
        id
        task {
          id
          name
          phase {
            id
            name
          }
        }
        charge {
          id
          status
          updatedAt
          availableAt
        }
        payout {
          id
          status
          updatedAt
          availableAt
        }
      }
  }
}
`;

const MAX_EMPTY_WEEKLY_SUMMARY = 4;

/**
 * Executes the weekly summary consumer function.
 * 
 * @param job - The job object containing the weekly summary options.
 * @returns A promise that resolves to void.
 */
export async function weeklySummaryConsumer(job: Job<WeeklySummaryOptions>): Promise<void> {
  const scope = `weekly-summary`;

  logger.info(`Started ${scope}`, job.data);

  const ctx = { sql: db.sql, events: [] };
  const { usersWithData } = await getClientTransaction(async client => {
    // language=PostgreSQL
    const { rows: contracts } = await client.query<Contract>(
      ctx.sql`
        SELECT contracts.*
        FROM ${CONTRACT_TABLE} contracts
        WHERE contracts."status" = ${ContractStatus.Hired}
      `
    );

    const usersWithData = await Promise.all(
      _.map(contracts, async contract => {
        const owner = await ContractModel.getOwner.exec(
          client,
          {
            contractId: contract.id
          },
          ctx
        );

        const ownerCollaborators = await ContractModel.getCollaborators.exec(
          client,
          {
            contractId: contract.id,
            permissions: CollaboratorPermission.Full,
            userRole: UserRole.HomeOwner
          },
          ctx
        );

        const pro = await ContractModel.getPartner.exec(
          client,
          {
            contractId: contract.id
          },
          ctx
        );

        const proCollaborators = await ContractModel.getCollaborators.exec(
          client,
          {
            contractId: contract.id,
            permissions: CollaboratorPermission.Full,
            userRole: UserRole.Pro
          },
          ctx
        );

        const usersToNotify = _.chain([owner, ...ownerCollaborators])
          .map(u => Object.assign(u, { roleName: UserRole.HomeOwner }))
          .concat([pro, ...proCollaborators].map(u => Object.assign(u, { roleName: UserRole.Pro })))
          .filter(u => Boolean(u.email))
          .value();

        const contractName = _.chain(contract.name)
          .split('/')
          .first()
          .split(',')
          .first()
          .value();

        let isEmptyContract = true;
        const usersWithData = await Promise.all(
          _.map(usersToNotify, async user => {
            if (user.roleId) {
              let isArchived = false;

              switch (user.roleName) {
                case UserRole.Pro: {
                  isArchived = await ContractModel.isArchived.exec(
                    client,
                    {
                      contractId: contract.id,
                      roleId: user.roleId
                    },
                    ctx
                  );

                  break;
                }
                case UserRole.HomeOwner: {
                  isArchived = await ContractModel.isArchived.exec(
                    client,
                    {
                      contractId: contract.id,
                      roleId: user.roleId
                    },
                    ctx
                  );

                  break;
                }
              }

              if (isArchived) return;
            }

            const lastActivity = moment()
              .subtract(1, 'week')
              .toDate();
            const { data, errors } = await execQuery<TQuery>(
              CONTRACT_PROGRESS_QUERY,
              {
                contractId: contract.id,
                lastActivity
              },
              user
            );

            if (!_.isEmpty(errors)) {
              errors?.forEach((e: any) => logger.error(e, 'Error in exec Query'));
              return;
            } else {
              if (isEmptyContract) isEmptyContract = _.isEmpty(data!.getContractActivities);

              return {
                ...user,
                contractId: contract.id,
                contractName,
                data
              };
            }
          })
        );

        if (isEmptyContract) {
          const updatedContract = await ContractModel.incrementEmptyWeeklySummary.exec(
            client,
            {
              contractId: contract.id
            },
            ctx
          );
          if (!updatedContract) return null;
          if (updatedContract.emptyWeeklySummary >= MAX_EMPTY_WEEKLY_SUMMARY) return null;
        }

        if (!isEmptyContract && contract.emptyWeeklySummary !== 0) {
          await ContractModel.update.exec(
            client,
            {
              id: contract.id,
              emptyWeeklySummary: 0
            },
            ctx
          );
        }

        return usersWithData;
      })
    );

    return {
      usersWithData: _.compact(_.flatten(usersWithData)) as PopulatedUser[]
    };
  });

  await Promise.all(
    _.map(usersWithData, async user => {
      const {
        getContractSummary: contractSummary,
        getUserRequiredActions: userRequiredActions,
        getContractActivities: contractActivities
      } = user.data;

      const payoutRequestUrl = config.utils.clientUrl(`/manage/${user.contractId}/payout`);
      const changeOrderUrl = config.utils.clientUrl(`/manage/${user.contractId}/change-order`);
      const paymentUrl = config.utils.clientUrl(`/manage/${user.contractId}/payment`);
      const matchUrl = config.utils.clientUrl(`/match`);

      const isCreatedToday = moment(contractSummary.createdAt).isSame(Date.now(), 'day');
      const targetDateIsSameInitialDate = moment(contractSummary.targetEndDate)
        .startOf('day')
        .isSame(moment(contractSummary.initialEndDate).startOf('day'));

      const isUserPro = user.roleName === UserRole.Pro;

      const partnerFirstName = _.get(
        contractSummary,
        ['partner', 'user', 'firstName'],
        _.get(contractSummary, ['partner', 'user', 'email'])
      );

      const tasks = _.compact(_.flatMap(contractSummary.phases, phase => phase.tasks));
      const decisions = _.compact(_.flatMap(tasks, task => task.decisions));

      const today = moment();

      const overdueTasks = _.filter(tasks, ({ endDate, status }) => {
        const daysToFinishTask = getDaysDiff(today, endDate);

        const isEndDateApproaching = daysToFinishTask > 0 && daysToFinishTask <= 5;
        return status !== 'Done' && isEndDateApproaching;
      });

      let overdueTasksRecap: string[] = [];
      if (!_.isEmpty(overdueTasks)) {
        const overdueMessages = _.groupBy(
          _.map(overdueTasks, task => ({ task, days: getDaysDiff(today, task.endDate) })),
          'days'
        );

        overdueTasksRecap = Object.keys(overdueMessages).map(day => {
          const taskNames = _.map(overdueMessages[day], m => m.task.name);

          return `
              ${taskNames.join(', ')} due date is coming up in ${day}
              ${naivePluralize(parseInt(day), 'day')}. If you need more time, update the
              dates on the Task Details on the Taskboard.
            `;
        });
      }

      const overdueDecisions = _.filter(decisions, decision => {
        const daysToFinishDecision = getDaysDiff(today, decision.dueDate);
        const isEndDateApproaching = daysToFinishDecision > 0 && daysToFinishDecision <= 14;

        return (
          (decision.decisionMakers.some(dM => dM.user.id === user.id) || decision.createdBy.user.id === user.id) &&
          decision.status !== 'Actioned' &&
          isEndDateApproaching
        );
      });

      let overdueDecisionRecap: string[] = [];
      if (!_.isEmpty(overdueDecisions)) {
        const overdueMessages = _.groupBy(
          _.map(overdueDecisions, decision => ({ decision, days: getDaysDiff(today, decision.dueDate) })),
          'days'
        );

        overdueDecisionRecap = Object.keys(overdueMessages).map(day => {
          const decisionNames = overdueMessages[day].map(message => message.decision.title);

          return `
              ${decisionNames.join(', ')} decision due date is coming up in ${day}<br />
              ${naivePluralize(parseInt(day), 'day')}.
            `;
        });
      }

      const phaseForRecapMsg = _.find(contractSummary.phases, phase => {
        if (_.get(phase, 'paymentStatus') === PhasePaymentStatus.Funded) {
          const finishedTasks = _.filter(phase.tasks, t => (t.status = TaskStatus.Done));

          return _.size(finishedTasks) === _.size(phase.tasks);
        } else {
          return false;
        }
      });
      const phaseNameForRecapMsg = phaseForRecapMsg && phaseForRecapMsg.name;

      const doneTasks = _.filter(tasks, task => task.status === 'Done').length;
      let progressPercent = (doneTasks / tasks.length) * 100;
      if (isNaN(progressPercent)) progressPercent = 0;

      const contractFinished =
        _.isEmpty(_.filter(contractSummary.phases, p => p.paymentStatus !== PhasePaymentStatus.Released)) &&
        progressPercent === 100;
      const contractProgress = `${progressPercent.toFixed(0)}%`;
      const additionalPhrase = getProgressPhrase(progressPercent, isUserPro);

      let paymentsAttentionRequired: string[] = [];
      if (_.size(userRequiredActions.payments) > 0) {
        const paymentPhases: Record<string, Phase> = _.reduce(
          userRequiredActions.payments,
          (acc, { task: { phase } }) => ({
            ...acc,
            [phase.id]: phase
          }),
          {}
        );

        paymentsAttentionRequired = _.compact(
          Object.values(paymentPhases).map(phase => {
            if (phase) {
              return `
                Pro is requesting payment for ${phase.name}. Please review approve
                the Payment for ${phase.name} to keep your project on track
                <br />
              `;
            } else {
              return null;
            }
          })
        );
      }

      const firstChangeOrderId = _.first(userRequiredActions.changeOrders)?.id;
      const changeOrdersAttentionUrl = config.utils.clientUrl(
        _.size(userRequiredActions.changeOrders) > 1
          ? `/manage/${user.contractId}/change-order`
          : `/manage/${user.contractId}/change-order${firstChangeOrderId && '?id=' + firstChangeOrderId}`
      );

      let changeOrdersAttentionText: string | null = null;
      let changeOrdersAttentionButtonText: string | null = null;
      if (_.size(userRequiredActions.changeOrders) > 0) {
        const countOfChangeOrders = _.size(userRequiredActions.changeOrders);

        if (isUserPro) {
          changeOrdersAttentionText = `
            ${countOfChangeOrders} Change<br />
            ${naivePluralize(countOfChangeOrders, 'Order')} changed status to
            &apos;Pending&apos;
          `;
          changeOrdersAttentionButtonText = 'Respond';
        } else {
          changeOrdersAttentionText = `
            Pro is requesting changes to the project. Please review and respond
            to the ${countOfChangeOrders} open Change<br/>
            ${naivePluralize(countOfChangeOrders, 'Order')} to keep your project on
            track.
          `;

          changeOrdersAttentionButtonText = 'Approve/Decline';
        }
      }

      const overdueTasksAttentionRequired = _.chain(tasks)
        .filter(({ endDate, status }) => status !== 'Done' && today.isAfter(endDate))
        .map((task, index, arr) => {
          return {
            text: `${task.name} ${arr.length - 1 !== index ? ',' : ''} &nbsp;`,
            url: config.utils.clientUrl(`/manage/${user.contractId}/taskboard?id=${task.id}`),
            assignees: task.assignees
          };
        })
        .value();

      let overdueTasksAttentionRequiredAdditionalText: string;
      if (isUserPro) {
        overdueTasksAttentionRequiredAdditionalText = `
          ${naivePluralize(
            overdueTasksAttentionRequired.length,
            'is'
          )} overdue. Please update the dates on the Task Details on the Taskboard.
        `;
      } else {
        const firstAssigneesUserName =
          !_.isEmpty(_.first(overdueTasksAttentionRequired)?.assignees) &&
          _.get(_.last(_.first(overdueTasksAttentionRequired)?.assignees), ['user', 'firstName']);

        overdueTasksAttentionRequiredAdditionalText = `
          ${naivePluralize(overdueTasksAttentionRequired.length, 'is')} overdue. Check in with<br />
          ${firstAssigneesUserName || ''}<br/>
          on the status.
        `;
      }

      const overdueDecisionsAttentionRequired = _.chain(decisions)
        .filter(decision => {
          return (
            (decision.decisionMakers.some(decisionMaker => decisionMaker.user.id === user.id) ||
              decision.createdBy.user.id === user.id) &&
            today.isAfter(decision.dueDate) &&
            decision.status !== 'Actioned'
          );
        })
        .map((decision, index, arr) => {
          return {
            text: `${decision.title} ${arr.length - 1 !== index && ','} &nbsp;`,
            url: config.utils.clientUrl(`/manage/${user.contractId}/taskboard?id=${decision.task.id}`)
          };
        })
        .value();

      const overdueDecisionsAttentionRequiredBeforeText = overdueDecisionsAttentionRequired.length
        ? `${naivePluralize(overdueDecisionsAttentionRequired.length, 'Decision')}`
        : '';
      const overdueDecisionsAttentionRequiredAfterText = overdueDecisionsAttentionRequired.length
        ? `${naivePluralize(overdueDecisionsAttentionRequired.length, 'is')}`
        : '';

      const haveAttentionRequiredItems = !_.isEmpty(
        _.compact([
          ...paymentsAttentionRequired,
          ...overdueTasksAttentionRequired,
          ...overdueDecisionsAttentionRequired,
          changeOrdersAttentionText
        ])
      );

      const countOfOverdueTasks = _.filter(
        tasks,
        ({ endDate, status }) => status !== TaskStatus.Done && today.isAfter(endDate)
      ).length;
      const overduePluralizeTaskText = _.upperFirst(naivePluralize(countOfOverdueTasks, 'task'));

      const remainingTasks = `${_.filter(tasks, t => t.status === TaskStatus.Todo).length} / ${tasks.length}`;

      const remainingInMoney = _.chain(tasks)
        .filter(task => _.get(task, 'paymentStatus') === PhasePaymentStatus.None)
        .reduce((acc, task) => acc + _.get(task, 'total', 0), 0)
        .value();
      const remainingInPercent = (remainingInMoney / contractSummary.total) * 100;

      const countOfOpenChangeOrder = contractSummary.openChangeOrders;
      const countOfApprovedChangeOrder = contractSummary.approvedChangeOrders;

      const changeOrderMoneyDiff = getChangeOrdersMoneyDiff(contractSummary.phases);

      const targetEndDate = _.get(contractSummary, 'targetEndDate');
      const parsedEndDate = moment(targetEndDate);

      const [monthOfEndDate, dayOfEndDate, yearOfEndDate] = [
        parsedEndDate.format('MMMM'),
        parsedEndDate.format('DD'),
        parsedEndDate.format('YYYY')
      ];

      const targetDate = parsedEndDate.format('MM/DD/YY');
      const daysToComplection =
        `${getDaysDiff(today, parsedEndDate)} ` + naivePluralize(getDaysDiff(today, parsedEndDate), 'day');

      const initEndDate = moment(contractSummary.initialEndDate).format('MMMM DD, YYYY');

      const endDateDaysDiff = getDaysDiff(contractSummary.initialEndDate, contractSummary.targetEndDate);
      const daysPerApproved = `${endDateDaysDiff > 0 ? '+' : '-'} ${Math.abs(endDateDaysDiff)} days per approved`;

      const { haveContractActivities, activitiesList } = getActivitiesList(contractActivities, user.contractId);

      await jobWorker.getQueue('send-email').add({
        template: 'dashboard',
        subject: `Weekly Summary`,
        to: user.email,
        usingMJMLChart: true,
        locals: {
          contractName: user.contractName,
          isCreatedToday,
          isUserPro,
          partnerFirstName,
          overdueTasksRecap,
          overdueDecisionRecap,
          phaseNameForRecapMsg: phaseNameForRecapMsg || null,
          payoutRequestUrl,
          matchUrl,
          contractProgress,
          contractFinished,
          additionalPhrase,
          paymentUrl,
          haveAttentionRequiredItems,
          paymentsAttentionRequired,
          changeOrdersAttentionUrl,
          changeOrdersAttentionText,
          changeOrdersAttentionButtonText,
          overdueTasksAttentionRequired,
          overdueTasksAttentionRequiredAdditionalText,
          overdueDecisionsAttentionRequired,
          overdueDecisionsAttentionRequiredBeforeText,
          overdueDecisionsAttentionRequiredAfterText,
          countOfOverdueTasks,
          overduePluralizeTaskText,
          remainingTasks,
          remainingInMoney: formatMoney(remainingInMoney),
          remainingInPercent: remainingInPercent.toFixed(0),
          countOfOpenChangeOrder,
          countOfApprovedChangeOrder,
          changeOrderMoneyDiff,
          monthOfEndDate,
          dayOfEndDate,
          yearOfEndDate,
          targetDate,
          targetDateIsSameInitialDate,
          initEndDate,
          daysToComplection,
          changeOrderUrl,
          daysPerApproved,
          haveContractActivities,
          activitiesList,
          ...buildLocalsForMJMLChart(tasks)
        }
      });
    })
  );

  logger.info(`Completed ${scope}`, job.data);
}

/**
 * Calculates the difference in days between two dates.
 * 
 * @param firstDate - The first date.
 * @param secondDate - The second date.
 * @returns The difference in days between the two dates.
 */
function getDaysDiff(firstDate: Date | Moment, secondDate: Date | Moment) {
  return moment(secondDate)
    .startOf('day')
    .diff(moment(firstDate).startOf('day'), 'days');
}

/**
 * Calculates the difference in money between the initial total and the current total for each phase in the contract summary.
 * 
 * @param phases - The phases of the contract summary.
 * @returns The difference in money between the initial total and the current total for all phases. Returns null if the difference is zero.
 *          Returns a negative value in parentheses if the difference is negative. Returns a positive value if the difference is positive.
 */
function getChangeOrdersMoneyDiff(phases: ContractSummary['phases']) {
  const moneyDiff = _.reduce(phases, (acc, { initialTotal, total }) => acc + total - initialTotal, 0);

  if (moneyDiff === 0) {
    return null;
  }

  if (moneyDiff < 0) {
    return `(-${formatMoney(moneyDiff * -1)})`;
  }

  return `(+${formatMoney(moneyDiff)})`;
}

const PROGRESS_PHRASES = {
  10: {
    owner: '',
    pro: 'Be gentle with yourself. You’re doing the best you can!'
  },
  20: {
    owner: 'Everything you need to accomplish your goals is already in you.',
    pro: 'Everything you need to accomplish your goals is already in you.'
  },
  30: {
    owner: 'Keep it up! You can do it!',
    pro: 'Keep it up! You can do it!'
  },
  40: {
    owner:
      'Sometimes the best thing you can do is just breathe and have faith that everything will work out for the best.',
    pro:
      'Sometimes the best thing you can do is just breathe and have faith that everything will work out for the best.'
  },
  50: {
    owner: 'You’re more than half way through! Keep up the good work!',
    pro: 'You’re more than half way through! Keep up the good work!'
  },
  60: {
    owner: 'You’ve made it this far. Let’s keep up the velocity!',
    pro: 'You’ve made it this far. Let’s keep up the velocity!'
  },
  70: {
    owner: 'You’re almost there! Let’s finish this project!',
    pro: 'You’re almost there! Let’s finish this project!'
  },
  80: {
    owner: 'We can tell you worked really hard on this. We’re cheering for you.',
    pro: 'We can tell you worked really hard on this. We’re cheering for you.'
  },
  90: {
    owner: 'There is the light at the end of the tunnel. Keep up the good work!',
    pro: 'There is the light at the end of the tunnel. Keep up the good work!'
  },
  100: {
    owner: 'Congratulations for completing all of the tasks! Way to go!',
    pro: 'Congratulations for completing all of the tasks'
  }
};

const TYPE_ACTIONS_MAP = {
  [ContractActivityType.TaskDecisionNew]: 'created',
  [ContractActivityType.TaskDecisionUpdated]: 'updated',
  [ContractActivityType.TaskDecisionDeleted]: 'deleted',
  [ContractActivityType.TaskDecisionSubmit]: 'submitted',
  [ContractActivityType.TaskDecisionMake]: 'made',
  [ContractActivityType.TaskResourcesUpdated]: 'updated',
  [ContractActivityType.TaskResourcesDeleted]: 'deleted',
  [ContractActivityType.TaskTRNew]: 'updated',
  [ContractActivityType.TaskTRUpdated]: 'created'
};

const DOCUMENT_MIME_TYPE = /application\/pdf/;

/**
 * Returns the progress phrase based on the progress value and user type.
 * 
 * @param {number} progress - The progress value (0-100).
 * @param {boolean} isProUser - Indicates whether the user is a pro user or not.
 * @returns {string} - The progress phrase.
 */
function getProgressPhrase(progress: number, isProUser: boolean) {
  const userKey = isProUser ? 'pro' : 'owner';

  if (progress === 100) {
    return PROGRESS_PHRASES[100][userKey];
  }
  if (progress >= 90) {
    return PROGRESS_PHRASES[90][userKey];
  }
  if (progress >= 80) {
    return PROGRESS_PHRASES[80][userKey];
  }
  if (progress >= 70) {
    return PROGRESS_PHRASES[70][userKey];
  }
  if (progress >= 60) {
    return PROGRESS_PHRASES[60][userKey];
  }
  if (progress >= 50) {
    return PROGRESS_PHRASES[50][userKey];
  }
  if (progress >= 40) {
    return PROGRESS_PHRASES[40][userKey];
  }
  if (progress >= 30) {
    return PROGRESS_PHRASES[30][userKey];
  }
  if (progress >= 20) {
    return PROGRESS_PHRASES[20][userKey];
  }
  if (progress >= 10) {
    return PROGRESS_PHRASES[10][userKey];
  }
  return '';
}

/**
 * Retrieves a list of activities grouped by date and user.
 * 
 * @param contractActivities - The list of contract activities.
 * @param contractId - The ID of the contract.
 * @returns An object containing the contract activities grouped by date and user.
 *          - haveContractActivities: A boolean indicating if there are contract activities.
 *          - activitiesList: The list of activities grouped by date and user.
 *            - date: The date of the activities.
 *            - userActivities: The activities grouped by user.
 *              - firstName: The first name of the user.
 *              - lastName: The last name of the user.
 *              - userAvatar: The avatar of the user.
 *              - activities: The activities of the user.
 *                - activitiesByGroupedTasks: The activities grouped by tasks.
 *                - activityMessagesByIgnoredTypes: The activity messages for ignored types.
 *                - defaultActivitiesGroup: The default activities group.
 *                - defaultActivityMessage: The default activity message.
 */
function getActivitiesList(contractActivities: ContractActivity[], contractId: string) {
  const haveContractActivities = !_.isEmpty(contractActivities);

  if (haveContractActivities) {
    const groupedActivities: Record<string, Record<string, ContractActivity[]>> = Object.fromEntries(
      _.chain(contractActivities)
        .groupBy(activity => moment(activity.createdAt).format('MMM DD, YYYY'))
        .map((activities, date) => {
          return [date, _.groupBy(activities, activity => activity.role.id)];
        })
        .value()
    );

    const activitiesList = _.map(groupedActivities, (activitiesByDate, date) => {
      const userActivities = _.map(activitiesByDate, activitiesByUser => {
        const firstActivity = _.first(activitiesByUser);

        const user = _.get(firstActivity, ['role', 'user']);
        const firstName = _.get(user, 'firstName', '');
        const lastName = _.get(user, 'lastName', '');

        let userAvatar = config.utils.clientUrl('/static/images/optimized/userpic-200.jpg');

        const avatarThumbnail = _.get(user, ['avatar', 'thumbnail']);
        if (avatarThumbnail) {
          userAvatar = avatarThumbnail;
        } else {
          const avatarUrl = _.get(user, ['avatar', 'url']);

          if (avatarUrl) {
            userAvatar = avatarUrl;
          }
        }

        const activities = _.map(
          _.groupBy(activitiesByUser, activity => activity.type),
          (currentActivities, activityType) => {
            const firstActivity = _.first(currentActivities);

            const ignoredActivityTypes = [
              'TaskMoved',
              'ContractStarted',
              'ContractEnded',
              'TaskNew',
              'CollaboratorNew',
              'CollaboratorDeleted',
              'CollaboratorUpdated'
            ];

            const groupedByTaskActivityTypes = [
              ContractActivityType.TaskDecisionNew,
              ContractActivityType.TaskDecisionUpdated,
              ContractActivityType.TaskDecisionDeleted,
              ContractActivityType.TaskDecisionSubmit,
              ContractActivityType.TaskDecisionMake,
              ContractActivityType.TaskTRNew,
              ContractActivityType.TaskTRUpdated,
              ContractActivityType.TaskResourcesUpdated,
              ContractActivityType.TaskResourcesNew,
              ContractActivityType.TaskResourcesDeleted
            ];

            const result: Record<string, string[] | string | null> = {
              activitiesByGroupedTasks: [],
              activityMessagesByIgnoredTypes: [],
              defaultActivitiesGroup: null,
              defaultActivityMessage: null
            };

            if (groupedByTaskActivityTypes.includes(activityType as ContractActivityType)) {
              const activitiesByTask = _.groupBy(currentActivities, ({ taskId }) => taskId);

              result.activitiesByGroupedTasks = _.chain(activitiesByTask)
                .map(currentTaskActivities => getActivitiesGroup(currentTaskActivities, contractId))
                .compact()
                .value();

              return result;
            }

            if (_.size(currentActivities) === 1) {
              result.defaultActivityMessage = getActivityMessage(firstActivity!);

              return result;
            }

            if (ignoredActivityTypes.includes(activityType)) {
              result.activityMessagesByIgnoredTypes = _.chain(currentActivities)
                .map(activity => getActivityMessage(activity))
                .compact()
                .value();

              return result;
            }

            result.defaultActivitiesGroup = getActivitiesGroup(currentActivities, contractId);

            return result;
          }
        );

        return {
          firstName,
          lastName,
          userAvatar,
          activities
        };
      });

      return {
        date,
        userActivities
      };
    });

    return {
      haveContractActivities,
      activitiesList
    };
  } else {
    return {
      haveContractActivities,
      activitiesList: []
    };
  }
}

function getActivitiesTaskLinks(activities: ContractActivity[], contractId: string) {
  const moreThanOneActivity = activities.length > 1;

  return _.map(activities, (activity, index) => {
    const isNotLastItem = activities.length - 1 !== index;

    return `
      ${getActivityTaskLink(activity, contractId)}
      ${moreThanOneActivity && isNotLastItem ? ', ' : ''}
    `;
  });
}

function getActivitiesChangeOrdersLinks(activities: ContractActivity[], contractId: string) {
  const moreThanOneActivity = activities.length > 1;

  return _.map(activities, ({ changeOrderId, data }, index) => {
    const isNotLastItem = activities.length - 1 !== index;
    const changeOrderNumber = _.get(data, 'changeOrderNumber');

    const changeOrderUrl = config.utils.clientUrl(`/manage/${contractId}/change-order?id=${changeOrderId}`);
    return `
      ${
        changeOrderId
          ? `
            <a href="${changeOrderUrl}" style="color: #00c5cd; font-size: 18px; text-decoration: none;">
               #${changeOrderNumber}
            </a>
          `
          : `<span>#${changeOrderNumber}(deleted)</span>`
      }
      ${moreThanOneActivity && isNotLastItem ? ', ' : ''}
    `;
  });
}

/**
 * Returns an array of strings representing the activities by task.
 * 
 * @param activities - An array of ContractActivity objects.
 * @param nameKey - The key to access the name property in the ContractActivity data object.
 * @returns An array of strings representing the activities by task.
 */
function getActivitiesByTask(activities: ContractActivity[], nameKey: string) {
  const moreThanOneActivity = activities.length > 1;

  return [
    ...(moreThanOneActivity ? ': ' : ' '),
    ..._.map(activities, (activity, index) => {
      const isNotLastItem = activities.length - 1 !== index;

      return `
         <b>${_.get(activity, ['data', nameKey])}</b>
         ${moreThanOneActivity && isNotLastItem ? ', ' : ''}
      `;
    })
  ];
}

/**
 * Generates a task link for a given contract activity.
 * 
 * @param {ContractActivity} activity - The contract activity object.
 * @param {string} [contractId] - The contract ID. If not provided, the default contract ID will be used.
 * @returns {string} - The task link HTML string.
 */
function getActivityTaskLink({ taskId, data, contractId: defaultContractId }: ContractActivity, contractId?: string) {
  const taskUrl = config.utils.clientUrl(`/manage/${contractId ?? defaultContractId}/taskboard?id=${taskId}`);

  return `
    <a href="${taskUrl}" style="color: #00c5cd; font-size: 18px; text-decoration: none;">
        ${_.get(data, 'taskName')}
    </a>
  `;
}

/**
 * Returns a link to a change order activity.
 * 
 * @param activity - The contract activity.
 * @param contractId - The ID of the contract.
 * @returns The link to the change order activity.
 */
function getActivityCOLink(activity: ContractActivity, contractId: string) {
  const { changeOrderId } = activity;

  if (!changeOrderId) {
    return `
      <span>#${_.get(activity, ['data', 'changeOrderNumber'])}</span>
    `;
  } else {
    const changeOrderUrl = config.utils.clientUrl(`/manage/${contractId}/change-order?id=${changeOrderId}`);

    return `
      <a href="${changeOrderUrl}" style="color: #00c5cd; font-size: 18px; text-decoration: none;">
        #${_.get(activity, ['data', 'changeOrderNumber'])}
      </a>
    `;
  }
}

/**
 * Returns a link to a change order activity.
 * 
 * @param activity - The contract activity.
 * @param contractId - The ID of the contract.
 * @returns The link to the change order activity.
 */
function fileIsDocument(file: Record<string, string>) {
  const mime = _.get(file, 'mime');
  if (!mime) return false;

  return mime === 'application/pdf' || DOCUMENT_MIME_TYPE.test(mime);
}

/**
 * Returns a formatted string describing the activities grouped by their type.
 * 
 * @param activities - An array of ContractActivity objects representing the activities to be grouped.
 * @param contractId - The ID of the contract associated with the activities.
 * @returns A formatted string describing the grouped activities.
 */
function getActivitiesGroup(activities: ContractActivity[], contractId: string) {
  const firstActivity = _.first(activities)!;

  switch (firstActivity.type) {
    case ContractActivityType.TaskEdited: {
      const uniqTasks = _.uniqBy(activities, ({ taskId }) => taskId);

      return `
        updated tasks: <br />
        ${getActivitiesTaskLinks(uniqTasks, contractId).join('')}
      `;
    }
    case ContractActivityType.TaskNew: {
      return `
        created <b>new tasks</b>:<br />
        ${getActivitiesTaskLinks(activities, contractId).join('')}
      `;
    }
    case ContractActivityType.TaskCommentNew: {
      const uniqTasks = _.uniqBy(activities, ({ taskId }) => taskId);

      return `
        added<br />
        <b>
            new ${naivePluralize(activities.length, 'comment')} in<br />
            ${naivePluralize(uniqTasks.length, 'task')}
        </b>
        ${getActivitiesTaskLinks(uniqTasks, contractId).join('')}
      `;
    }
    case ContractActivityType.FileNew: {
      return `
        added <b>new files</b>: <br />
        ${_.map(activities, ({ data }, index) => {
          if (!fileIsDocument(data)) return '';

          const isNotLastItem = activities.length - 1 !== index;

          const fileUrl = _.get(data, 'thumbnail', _.get(data, 'url'));
          return `
                <a href="${fileUrl}" target="_blank" style="color: #00c5cd; font-size: 18px; text-decoration: none;">
                    ${_.get(data, 'fileName')}
                </a>
                ${isNotLastItem ? ',' : ''}
              `;
        }).join('')}
      `;
    }
    case ContractActivityType.ChangeOrderNew: {
      return `
        created new Change Orders: <br />
        ${getActivitiesChangeOrdersLinks(activities, contractId).join('')}
      `;
    }
    case ContractActivityType.ChangeOrderEdited: {
      return `
        edited Change Orders:<br />
        ${getActivitiesChangeOrdersLinks(activities, contractId).join('')}
      `;
    }
    case ContractActivityType.ChangeOrderApproved: {
      return `
        approved Change Orders:<br />
        ${getActivitiesChangeOrdersLinks(activities, contractId).join('')}
      `;
    }
    case ContractActivityType.ChangeOrderDeclined: {
      return `
        declined Change Orders:<br />
        ${getActivitiesChangeOrdersLinks(activities, contractId).join('')}
      `;
    }
    case ContractActivityType.TaskDecisionNew:
    case ContractActivityType.TaskDecisionUpdated:
    case ContractActivityType.TaskDecisionDeleted:
    case ContractActivityType.TaskDecisionSubmit:
    case ContractActivityType.TaskDecisionMake: {
      const uniqueActivities = _.uniqBy(activities, activity => _.get(activity, 'decisionId'));

      return `
        ${TYPE_ACTIONS_MAP[firstActivity.type]} ${naivePluralize(uniqueActivities.length, 'decision')}
        ${getActivitiesByTask(uniqueActivities, 'decisionName').join('')}<br />
        in task ${getActivityTaskLink(uniqueActivities[0])}
      `;
    }
    case ContractActivityType.TaskResourcesNew: {
      const uniqueActivities = _.uniqBy(activities, activity => _.get(activity, 'scheduleId'));

      return `
        added ${naivePluralize(uniqueActivities.length, 'resource')}
        ${getActivitiesByTask(uniqueActivities, 'userName').join('')}<br />
        in task ${getActivityTaskLink(uniqueActivities[0])}
      `;
    }
    case ContractActivityType.TaskResourcesUpdated:
    case ContractActivityType.TaskResourcesDeleted: {
      const isTaskResourcesUpdated = firstActivity.type === ContractActivityType.TaskResourcesUpdated;
      const uniqueActivities = _.uniqBy(activities, activity => _.get(activity, 'scheduleId'));

      return `
        ${TYPE_ACTIONS_MAP[firstActivity.type]} ${naivePluralize(uniqueActivities.length, 'resource')}
        ${getActivitiesByTask(uniqueActivities, 'userName').join('')}<br />
        ${isTaskResourcesUpdated ? 'in' : 'from'} task ${getActivityTaskLink(uniqueActivities[0])}
      `;
    }
    case ContractActivityType.TaskTRNew:
    case ContractActivityType.TaskTRUpdated: {
      const uniqueActivities = _.uniqBy(activities, activity => _.get(activity, 'taskReminderId'));

      return `
        ${TYPE_ACTIONS_MAP[firstActivity.type]} task ${naivePluralize(uniqueActivities.length, 'reminder')}
        ${getActivitiesByTask(uniqueActivities, 'TRName').join('')}<br />
        in task ${getActivityTaskLink(uniqueActivities[0])}
      `;
    }
    default: {
      return '';
    }
  }
}

/**
 * Generates the activity message for a given contract activity.
 * 
 * @param activity - The contract activity object.
 * @returns The generated activity message as a string.
 */
function getActivityMessage(activity: ContractActivity) {
  // function implementation...
}
function getActivityMessage(activity: ContractActivity) {
  const { contractId } = activity;

  const collaboratorName = _.get(activity, ['data', 'name'], null);
  const email = _.get(activity, ['data', 'email'], null);
  const accessLevel = _.get(activity, ['data', 'permissions'], null);

  switch (activity.type) {
    case ContractActivityType.TaskMoved: {
      const to = _.get(activity, ['data', 'to']);
      const from = _.get(activity, ['data', 'from']);

      return `
         moved task ${getActivityTaskLink(activity, contractId)}<br />
         from ${from} to ${to}
      `;
    }
    case ContractActivityType.TaskEdited: {
      return `
        updated task ${getActivityTaskLink(activity, contractId)}
      `;
    }
    case ContractActivityType.TaskNew: {
      return `
        created <b>new task</b><br />
        ${getActivityTaskLink(activity, contractId)}
      `;
    }
    case ContractActivityType.TaskFileNew: {
      return `
         added <b>new file</b> in task<br />
         ${getActivityTaskLink(activity, contractId)}
      `;
    }
    case ContractActivityType.TaskCommentNew: {
      return `
        added <b>new comment in task</b><br />
        ${getActivityTaskLink(activity, contractId)}
      `;
    }
    case ContractActivityType.FileNew: {
      if (fileIsDocument(activity.data)) {
        const fileUrl = _.get(activity.data, 'thumbnail', _.get(activity.data, 'url'));

        return `
          <div>
              added &nbsp;
              <a href="${fileUrl}" target="_blank" style="color: #00c5cd; font-size: 18px; text-decoration: none;">
                  ${_.get(activity.data, 'fileName')}
              </a>
          </div>
        `;
      } else {
        return '';
      }
    }
    case ContractActivityType.ChangeOrderNew: {
      const canBeApplied = _.get(activity, ['data', 'changeOrderStatus']) === ChangeOrderStatus.Closed;

      return `
        created new Change Order<br />
        ${getActivityCOLink(activity, contractId)}
        ${canBeApplied ? '(auto approved)' : ''}
      `;
    }
    case ContractActivityType.ChangeOrderEdited: {
      return `
        edited Change Order<br />
        ${getActivityCOLink(activity, contractId)}
      `;
    }
    case ContractActivityType.ChangeOrderApproved: {
      return `
        approved Change Order<br />
        ${getActivityCOLink(activity, contractId)}
      `;
    }
    case ContractActivityType.ChangeOrderDeclined: {
      return `
        declined Change Order<br />
        ${getActivityCOLink(activity, contractId)}
      `;
    }
    case ContractActivityType.CollaboratorNew: {
      const collaboratorsUrl = config.utils.clientUrl(`/manage/${contractId}/collaborators`);

      if (collaboratorName) {
        return `
          add<br />
          <a href="${collaboratorsUrl}" style="color: #00c5cd; font-size: 18px; text-decoration: none;">
             new collaborator
          </a>
          <br />
          - <b>${collaboratorName}</b>
        `;
      } else {
        return `
          invited<br />
          <a href="${collaboratorsUrl}" style="color: #00c5cd; font-size: 18px; text-decoration: none;">
             new collaborator
          </a>
          (<b>${email}</b>)
        `;
      }
    }
    case ContractActivityType.CollaboratorDeleted: {
      const collaboratorsUrl = config.utils.clientUrl(`/manage/${contractId}/collaborators`);

      if (collaboratorName) {
        return `
          <a href="${collaboratorsUrl}" style="color: #00c5cd; font-size: 18px; text-decoration: none;">
             deleted collaborator
          </a>
          <br />
          - ${collaboratorName}
        `;
      } else {
        return `
          <a href="${collaboratorsUrl}" style="color: #00c5cd; font-size: 18px; text-decoration: none;">
             deleted invite
          </a>
          <br />
          for collaborator(<b>${email}</b>)
        `;
      }
    }
    case ContractActivityType.CollaboratorApproved: {
      const collaboratorsUrl = config.utils.clientUrl(`/manage/${contractId}/collaborators`);

      if (collaboratorName) {
        return `
          <a href="${collaboratorsUrl}" style="color: #00c5cd; font-size: 18px; text-decoration: none;">
             approved collaborator
          </a>
          <br />
          - ${collaboratorName}
        `;
      } else {
        return `
          <a href="${collaboratorsUrl}" style="color: #00c5cd; font-size: 18px; text-decoration: none;">
             approved collaborator
          </a>
          (<b>${email}</b>)
        `;
      }
    }
    case ContractActivityType.CollaboratorUpdated: {
      const collaboratorsUrl = config.utils.clientUrl(`/manage/${contractId}/collaborators`);

      if (collaboratorName) {
        return `
          <a href="${collaboratorsUrl}" style="color: #00c5cd; font-size: 18px; text-decoration: none;">
             changed collaborator access level
          </a>
          <br />
          for <b>${collaboratorName}</b> to <b>${accessLevel}</b>
        `;
      } else {
        return `
          <a href="${collaboratorsUrl}" style="color: #00c5cd; font-size: 18px; text-decoration: none;">
             changed collaborator access level
          </a>
          <br />
          for <b>${email}</b> to <b>${accessLevel}</b>
        `;
      }
    }
    case ContractActivityType.ContractStarted: {
      return 'created contract';
    }
    default: {
      return '';
    }
  }
}

/**
 * Builds the locals object for MJML chart based on the given tasks.
 * 
 * @param tasks - An array of TaskSummary objects representing the tasks.
 * @returns An object containing the necessary properties for the MJML chart.
 */
function buildLocalsForMJMLChart(tasks: TaskSummary[]) {
  const { Done: doneTasks = [], Doing: doingTasks = [], Todo: todoTasks = [] } = _.groupBy(tasks, t => t.status);

  const countOfDoingTasks = doingTasks.length;
  const countOfDoneTasks = doneTasks.length;
  const countOfTodoTasks = todoTasks.length;

  const countOfTasks = [countOfDoingTasks, countOfTodoTasks, countOfDoneTasks];

  if (_.sum(countOfTasks) === 0) {
    return {
      chd: `a:0,0,0`,
      chl: `0°|0°|0°`,
      chli: `0%`
    };
  }

  const chd = `a:${_.map(countOfTasks, c => (c > 0 ? c : '')).join(',')}`;
  const chl = `${_.map(countOfTasks, c => (c > 0 ? Math.trunc((c / tasks.length) * 100) + '°' : '')).join('|')}`;
  const chli = `${Math.trunc((countOfDoneTasks / tasks.length) * 100)}%`;

  return {
    chd,
    chl,
    chli
  };
}
