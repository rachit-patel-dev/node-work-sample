/*external modules*/
import _ from 'lodash';
import async from 'async';
/*DB*/
import { getTaskDiff } from '../../../../db/dataUtils/getTaskDiff';
import { ContractActivityType } from '../../../../db/types/contractActivity';
import { Task } from '../../../../db/types/task';
import { Contract } from '../../../../db/types/contract';
import { TaskVersion } from '../../../../db/types/taskVersion';
import { ChangeOrder } from '../../../../db/types/changeOrder';
import { diffToString } from '../../../../db/dataUtils/getDiff';
/*models*/
import { ContractModel } from '../../../../db/models/ContractModel';
import { CommentModel } from '../../../../db/models/CommentModel';
import { TaskModel } from '../../../../db/models/TaskModel';
import { PhaseModel } from '../../../../db/models/PhaseModel';
/*GQL*/
import { GraphQLError } from '../../../errors';
import { TaskInput } from '../../Types/Task/inputs/TaskInput';
import { addTaskAssignees } from '../../Mutation/tasks/assignees/addAssignees';
/*other*/
import jobWorker from '../../../../jobs';
import { publishContractUpdated } from '../../../../notifications/subscriptions/contracts/updated';
import { publishTasksUpdated } from '../../../../notifications/subscriptions/tasks/updated';
import { publishPhasesUpdated } from '../../../../notifications/subscriptions/phases/updated';
import { publishUserRequiredActionsCreated } from '../../../../notifications/subscriptions/users/requiredActionsCreated';

/**
 * Finds and replaces phase names on tasks.
 * 
 * @param {GraphqlClient} client - The GraphQL client.
 * @param {Object} args - The function arguments.
 * @param {string} args.contractId - The ID of the contract.
 * @param {Array<TaskInput | TaskVersion>} args.tasks - The array of tasks.
 * @param {Object} ctx - The context object.
 * @returns {Map<string, string>} - The map of phase names and phase IDs.
 */
export const findAndReplacePhaseNameOnTasks: TFunction.GraphqlClientBasedResolver.ReturnRequired<
  {
    contractId: Contract['id'];
    tasks: Array<Readonly<TaskInput | TaskVersion>>;
  },
  Map<string /*phaseName*/, string /*phaseId*/>
> = async (client, args, ctx) => {
  const { contractId, tasks } = args;

  // Create phases if we will apply CO
  const phasesToCreate = _.chain(tasks)
    .filter('phaseName')
    .map(task => _.trim(task.phaseName).toUpperCase())
    .uniq()
    .value();

  const phaseNameMap = new Map();

  if (_.size(phasesToCreate) > 0) {
    let order = await ContractModel.getMaxPhaseOrder.exec(
      client,
      {
        contractId: contractId
      },
      ctx
    );

    let needPublishContractUpdated = true;
    let anyonePhaseIsCreated = false;
    await async.each(phasesToCreate, async phaseName => {
      order += 1;

      const phase = await PhaseModel.createOrUpdate.exec(
        client,
        {
          name: phaseName,
          contractId,
          order
        },
        ctx
      );

      if (phase.isUpdated) order -= 1;
      if (!phase.isUpdated && needPublishContractUpdated) {
        ctx.events.push(() => publishContractUpdated({ id: contractId }));
        needPublishContractUpdated = false;
      }
      if (!anyonePhaseIsCreated) anyonePhaseIsCreated = !phase.isUpdated;

      _.forEach(tasks, task => {
        if (_.toUpper(task.phaseName)?.trim() === phase.name) {
          phaseNameMap.set(task.phaseName, phase.id);
        }
      });
    });

    if (anyonePhaseIsCreated) {
      ctx.events.push(() => publishPhasesUpdated({ id: contractId }));
    }
  }

  return phaseNameMap;
};

/**
 * Creates a new task.
 * 
 * @param {GraphqlClient} client - The GraphQL client.
 * @param {Object} args - The arguments for creating the task.
 * @param {string} args.contractId - The ID of the contract.
 * @param {TaskInput | TaskVersion} args.taskInput - The input data for the task.
 * @param {Object} ctx - The context object.
 * @returns {Task} - The created task.
 */
export const createTask: TFunction.GraphqlClientBasedResolver.ReturnRequired<
  {
    contractId: Contract['id'];
    taskInput: Readonly<TaskInput | TaskVersion>;
  },
  Task
> = async (client, args, ctx) => {
  const { contractId, taskInput } = args;
  const currentUserRoleId = ctx.currentUser!.lastRoleId;

  const taskData: TaskModel.create.TArgs = {
    phaseId: taskInput.phaseId!,
    // if "taskInput" is "TaskVersion"
    creatorId: _.get(taskInput, 'creatorId') ?? currentUserRoleId,
    name: taskInput.name,
    description: taskInput.description,
    divisionTrade: taskInput.divisionTrade,
    materialCost: taskInput.materialCost,
    laborCost: taskInput.laborCost,
    otherCost: taskInput.otherCost,
    markupPercent: taskInput.markupPercent,
    room: taskInput.room,
    startDate: taskInput.startDate,
    endDate: taskInput.endDate
  };

  const task = await TaskModel.create.exec(client, taskData, ctx);

  if (!_.isEmpty(_.get(taskInput, 'assignees'))) {
    await addTaskAssignees(
      client,
      {
        taskId: _.get(task, 'id'),
        assignees: _.get(taskInput, 'assignees')
      },
      ctx
    );
  }

  ctx.events.push(async () =>
    jobWorker.getQueue('create-contract-activity').add({
      contractId,
      type: ContractActivityType.TaskNew,
      roleId: currentUserRoleId,
      taskId: task.id,
      taskName: task.name
    })
  );

  return task;
};

/**
 * Updates a task.
 * 
 * @param client - The GraphQL client.
 * @param args - The arguments for updating the task.
 * @param ctx - The context object.
 * @returns The updated task.
 * @throws {GraphQLError} If the task is not found.
 */
export const updateTask: TFunction.GraphqlClientBasedResolver.ReturnRequired<
  {
    contractId: Contract['id'];
    changeOrderId: ChangeOrder['id'];
    taskInput: Readonly<TaskInput | TaskVersion>;
  },
  Task
> = async (client, args, ctx) => {
  const { contractId, changeOrderId, taskInput } = args;
  const currentUserRoleId = ctx.currentUser!.lastRoleId;

  const taskId = taskInput.id!;
  const versionCount = await TaskModel.getVersionCount.exec(client, { taskId }, ctx);

  if (versionCount === 0) {
    await TaskModel.createVersionSnapshot.exec(client, { taskId }, ctx);
  }

  const taskToEdit = await TaskModel.findById.exec(client, { taskId }, ctx);
  if (!taskToEdit) throw GraphQLError.notFound('task');

  const taskData: TaskModel.update.TArgs = {
    id: taskId,
    phaseId: taskInput.phaseId,
    name: taskInput.name,
    description: taskInput.description,
    divisionTrade: taskInput.divisionTrade,
    materialCost: taskInput.materialCost,
    laborCost: taskInput.laborCost,
    otherCost: taskInput.otherCost,
    markupPercent: taskInput.markupPercent,
    room: taskInput.room,
    startDate: taskInput.startDate,
    endDate: taskInput.endDate
  };

  const task = (await TaskModel.update.exec(client, taskData, ctx))!;

  // if "taskInput" is "TaskVersion"
  if (!_.has(taskInput, 'files')) _.set(taskInput, 'files', []);

  const diff = await getTaskDiff(taskToEdit, taskInput as TaskInput, client);

  const taskComment = await CommentModel.create.exec(
    client,
    {
      roleId: currentUserRoleId,
      taskId: taskInput.id,
      text: diffToString(diff),
      changeOrderId,
      data: diff
    },
    ctx
  );

  ctx.events.push(async () => publishTasksUpdated({ taskId: task.id, contractId }));

  ctx.events.push(async () =>
    jobWorker.getQueue('create-contract-activity').add({
      contractId,
      diff,
      type: ContractActivityType.TaskEdited,
      taskId: task.id,
      roleId: currentUserRoleId,
      taskName: task.name
    })
  );

  ctx.events.push(() =>
    publishUserRequiredActionsCreated(contractId, {
      taskComments: [taskComment.id]
    })
  );

  return task;
};
