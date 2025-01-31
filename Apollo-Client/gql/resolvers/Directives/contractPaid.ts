/*external modules*/
import _ from 'lodash';
/*DB*/
import { getClient } from '../../../db';
import { Contract, CONTRACT_TABLE, ContractPaymentPlan, ContractStatus } from '../../../db/types/contract';
import { TASK_TABLE } from '../../../db/types/task';
import { PHASE_TABLE } from '../../../db/types/phase';
/*models*/
import { ContractModel } from '../../../db/models/ContractModel';
import { PhaseModel } from '../../../db/models/PhaseModel';
import { ChangeOrderModel } from '../../../db/models/ChangeOrderModel';
import { TaskModel } from '../../../db/models/TaskModel';
import { DecisionModel } from '../../../db/models/DecisionModel';
import { ScheduleModel } from '../../../db/models/ScheduleModel';
import { TrackTimeModel } from '../../../db/models/TrackTimeModel';
import { WorkLogModel } from '../../../db/models/WorkLogModel';
import { TaskReminderModel } from '../../../db/models/TaskReminderModel';
/*GQL*/
import { defDirective, GraphQLDirectiveResolver, GraphQLError } from '../../index';
/*other*/

type TArgs = {
  path: string;
  alias: string;
};

const isNotPaidContract = _.conforms<Pick<Contract, 'paid' | 'paymentPlan' | 'status'>>({
  paid: (val: boolean) => !val,
  paymentPlan: (val: ContractPaymentPlan) => _.isEqual(val, ContractPaymentPlan.MonthlySubscription),
  status: (val: ContractStatus) => _.isEqual(val, ContractStatus.Hired)
});

/**
 * Checks if a contract is paid before executing the next resolver function.
 * 
 * @param next - The next resolver function to be executed.
 * @param _source - The source object.
 * @param args - The arguments passed to the resolver function.
 * @param ctx - The context object.
 * @param info - The GraphQL resolve info object.
 * @returns The result of the next resolver function.
 * @throws {GraphQLError} If the contract is not found or if the subscription is not paid.
 */
export const contractPaid: GraphQLDirectiveResolver = async (next, _source, args, ctx, info) => {
  const { variableValues } = info;

  const { path } = args as TArgs;
  const alias = args.alias ?? path;

  const value: string = _.get(variableValues, path.split('.'));
  if (!value) throw new GraphQLError(`Value by path: "${path}" is empty`);

  await getClient(async client => {
    let contract: Contract | undefined;

    switch (alias) {
      case 'contractId': {
        contract = await ContractModel.findById.exec(
          client,
          {
            contractId: value
          },
          ctx
        );
        break;
      }
      case 'phaseId': {
        contract = await PhaseModel.getContract.exec(
          client,
          {
            phaseId: value
          },
          ctx
        );
        break;
      }
      case 'changeOrderId': {
        contract = await ChangeOrderModel.getContract.exec(
          client,
          {
            changeOrderId: value
          },
          ctx
        );
        break;
      }
      case 'taskId': {
        contract = await TaskModel.getContract.exec(
          client,
          {
            taskId: value
          },
          ctx
        );
        break;
      }
      case 'decisionId': {
        const decision = await DecisionModel.findById.exec(
          client,
          {
            decisionId: value
          },
          ctx
        );
        if (!decision) throw GraphQLError.notFound('decision');

        contract = await TaskModel.getContract.exec(
          client,
          {
            taskId: decision.taskId
          },
          ctx
        );
        break;
      }
      case 'payments':
      case 'paymentId': {
        const paymentIds = _.isArray(value) ? value : [value];

        const { rows: contracts } = await client.query(
          ctx.sql`
              SELECT DISTINCT ON (contracts."id") contracts.*
              FROM ${TASK_TABLE} tasks
                INNER JOIN ${PHASE_TABLE} phases
                    INNER JOIN ${CONTRACT_TABLE} contracts ON contracts."id" = phases."contractId"
                ON phases."id" = tasks."phaseId"
              WHERE tasks."paymentId" = ANY(${paymentIds})
            `
        );

        if (_.some(contracts, c => isNotPaidContract(c))) {
          throw new GraphQLError(`Action blocked because Subscription not paid`);
        }

        return;
      }
      case 'scheduleId': {
        const schedule = await ScheduleModel.findById.exec(
          client,
          {
            scheduleId: value
          },
          ctx
        );
        if (!schedule) throw GraphQLError.notFound('schedule');

        contract = await TaskModel.getContract.exec(
          client,
          {
            taskId: schedule.taskId
          },
          ctx
        );
        break;
      }
      case 'trackTimeId': {
        contract = await TrackTimeModel.getContract.exec(
          client,
          {
            trackTimeId: value
          },
          ctx
        );
        break;
      }
      case 'workLogId': {
        const workLog = await WorkLogModel.findById.exec(
          client,
          {
            workLogId: value
          },
          ctx
        );
        if (!workLog) throw GraphQLError.notFound('work log');

        contract = await TaskModel.getContract.exec(
          client,
          {
            taskId: workLog.taskId
          },
          ctx
        );
        break;
      }
      case 'taskReminderId': {
        const TR = await TaskReminderModel.findById.exec(client, { reminderId: value }, ctx);
        if (!TR) throw GraphQLError.notFound('Task Reminder');

        contract = await TaskModel.getContract.exec(client, { taskId: TR.taskId }, ctx);
        break;
      }
      default:
        throw new GraphQLError(`Invalid variable name`);
    }

    if (!contract) throw GraphQLError.notFound('contract');
    if (isNotPaidContract(contract)) {
      throw new GraphQLError(`Action blocked because Subscription not paid`);
    }
  });

  return next();
};

defDirective('directive @contractPaid(path: String!, alias: String) on FIELD_DEFINITION', contractPaid);
