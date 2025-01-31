/*external modules*/
/*DB*/
import { Contract, CONTRACT_TABLE } from '../../../db/types/contract';
import { TASK_TABLE, Task, TaskStatus } from '../../../db/types/task';
import { PHASE_TABLE } from '../../../db/types/phase';
/*models*/
import { TaskModel } from '../../../db/models/TaskModel';
/*GQL*/
import { defSubscription, pubsub, GraphQLError } from '../../';
import { Taskboard } from '../Types/Task/Taskboard';
/*other*/
import { taskboardUpdatedTopic } from '../../../notifications/subscriptions/publishTaskboardUpdated';
import { validateContractAccess, WithContractAccess } from '../../checks/validateContractAccess';

type TArgs = { contractId: string };
type TPayload = { contractId: string };
type TReturn = Taskboard;

/**
 * Subscription definition for taskboardUpdated event.
 * 
 * @param contractId The ID of the contract.
 * @returns The updated taskboard.
 */
defSubscription<TArgs, TPayload, TReturn>(
  `taskboardUpdated(contractId: ID!): Taskboard! @authenticated`,
  async (_root, { contractId }, ctx) => {
    const hasContractAccess = ctx.sql.contractAccess(contractId, ctx.currentUser!.lastRoleId);
    const {
      rows: [contract]
    }: { rows: WithContractAccess<Contract>[] } = await ctx.db.pool.query(
      ctx.sql`
        SELECT *,
               ${hasContractAccess} as "contractAccess"
        FROM ${CONTRACT_TABLE} WHERE "id" = ${contractId}
      `
    );
    if (!contract) throw GraphQLError.notFound('contract');
    validateContractAccess(contract);

    const topic = taskboardUpdatedTopic(contractId);
    return pubsub.asyncIterator(topic);
  },
  async ({ contractId }, _args, ctx) => {
    ctx.dataLoader.flush();
    const { rows } = await ctx.db.pool.query(
      ctx.sql`
        SELECT tt."status",
               JSON_AGG(tt.* ORDER BY tt."order") AS "tasks"
        FROM ${TASK_TABLE} AS tt
          INNER JOIN ${PHASE_TABLE} AS pt ON (pt."id" = tt."phaseId")
        WHERE pt."contractId" = ${contractId}
        GROUP BY tt."status"
      `
    );
    const groups: { status: TaskStatus; tasks: Task[] }[] = rows;

    const taskboard: Taskboard = {
      [TaskStatus.Todo]: [],
      [TaskStatus.Doing]: [],
      [TaskStatus.Done]: []
    };
    for (const group of groups) {
      taskboard[group.status] = group.tasks;

      TaskModel.UtilDataLoader.prime(group.tasks, ctx);
    }

    return taskboard;
  }
);
