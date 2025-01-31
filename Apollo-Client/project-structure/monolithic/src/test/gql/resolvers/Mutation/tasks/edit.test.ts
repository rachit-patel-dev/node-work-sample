/*external modules*/
import _ from 'lodash';
import moment from 'moment';
import assert from 'assert';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Payment } from '../../../../../db/types/payment';
import { PaymentOperation } from '../../../../../db/types/paymentOperation';
import { Task as TaskDB, TaskStatus } from '../../../../../db/types/task';
import { Collaborator, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { Contract } from '../../../../../db/types/contract';
import { getTaskTotal } from '../../../../../db/dataUtils/getTaskTotal';
import { ActionType } from '../../../../../db/types/actionType';
import { Schedule } from '../../../../../db/types/schedule';
import { Decision, DecisionSelectionType, DecisionStatus } from '../../../../../db/types/decision';
import { TaskReminder, NotifyTime } from '../../../../../db/types/taskReminder';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
/*GQL*/
import { GraphQLError } from '../../../../../gql';
import { Phase } from '../../../../../gql/resolvers/Types/Phase/Phase';
import { TaskInput } from '../../../../../gql/resolvers/Types/Task/inputs/TaskInput';
import { WhoCanSeeFiles } from '../../../../../gql/resolvers/Types/File';
import { EditTasksInput } from '../../../../../gql/resolvers/Types/Task/inputs/EditTasksInput';
import { getChangeOrderTasks } from '../../../../../gql/resolvers/Mutation/tasks/edit';
import { resolveDecisionActions } from '../../../../../gql/resolvers/functions/decisions/resolveActions';
import { resolveScheduleActions } from '../../../../../gql/resolvers/functions/shedule/resolveActions';
import { resolveTaskRemindersActions } from '../../../../../gql/resolvers/functions/reminders/resolveActions';
/*other*/
import { Test } from '../../../../helpers/Test';

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  Fund = 'Fund'
}
const enum PhaseName {
  First = 'FIRST',
  Second = 'SECOND',
  NewPhase = 'NEWPHASE'
}
const enum TaskName {
  One = 'One',
  Two = 'Two',
  Free = 'Free',
  New = 'New'
}

type PopulatedTask = TaskDB & { payment?: Payment & { charge: PaymentOperation; payout?: PaymentOperation } };
type PopulatedPhase = Phase & {
  tasks: Array<PopulatedTask>;
};

interface OutputData {
  users: Test.TUser[];
  collaborators: Collaborator[];
  contract: Contract;
  phases: Array<PopulatedPhase>;
}

function toTaskInput(
  task: PopulatedTask & { phaseName?: string; phaseId?: string },
  { decisions = [], taskReminders = [], schedules = [] } = {}
) {
  const keys: Array<keyof TaskInput> = [
    'id',
    'name',
    'description',
    'divisionTrade',
    'materialCost',
    'laborCost',
    'otherCost',
    'markupPercent',
    'room',
    'startDate',
    'endDate',
    'phaseId',
    'phaseName'
  ];

  return {
    task: {
      ..._.pick(task, keys),
      files: [],
      assignees: [],
      whoCanSeeFiles: WhoCanSeeFiles.All
    },
    taskId: task.id,
    decisions,
    taskReminders,
    schedules
  } as EditTasksInput;
}

async function createOutputData<TInput extends { [k: string]: any }>(inputData: TInput) {
  const ctx = { sql, events: [] };

  return getClientTransaction(async client => {
    const users = await Promise.all(
      _.map(inputData.users, async userData => {
        const userGenerate = new Test.UserGenerate(client, ctx);

        await userGenerate.create({
          email: userData.email
        });
        await userGenerate.setRole({ name: userData.role.name });

        return userGenerate.user!;
      })
    );

    const homeUser = _.find(users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const proUser = _.find(users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    const projectGenerate = new Test.ProjectGenerate(client, ctx);
    await projectGenerate.create({
      ownerId: homeUser.lastRoleId,
      matchData: inputData.project.matchData as any
    });
    await projectGenerate.addContract({
      name: inputData.contract.name,
      partnerId: proUser.lastRoleId
    });

    const project = projectGenerate.project!;

    const contract = _.find(project.contracts, {
      name: ContractName.Fund
    });
    if (!contract) throw GraphQLError.notFound('contract');

    const collaborators = await Promise.all(
      _.map(inputData.collaborators, async collaboratorData => {
        let userInvited;

        switch (collaboratorData.invite.userRole) {
          case UserRole.Pro:
            userInvited = proUser;
            break;
          case UserRole.HomeOwner:
            userInvited = homeUser;
            break;
        }

        if (!userInvited) throw GraphQLError.notFound('user invited');

        const email = Email.Collaborator + collaboratorData.permissions + collaboratorData.invite.userRole;
        const collaborator = _.find(users, { email });

        if (!collaborator) throw GraphQLError.notFound('collaborator');

        const inviteProGenerate = new Test.InviteGenerate(client, ctx);
        await inviteProGenerate.create({
          ...collaboratorData.invite,
          email: email,
          invitedById: userInvited.lastRoleId
        });

        const invite = inviteProGenerate.invite!;

        const collaboratorProGenerate = new Test.CollaboratorGenerate(client, ctx);
        await collaboratorProGenerate.create({
          roleId: collaborator.lastRoleId,
          inviteId: invite.id,
          contractId: contract.id,
          invitedById: userInvited.lastRoleId,
          approvedById: homeUser.lastRoleId,
          userRole: collaborator.role!.name,
          email: email,
          permissions: collaboratorData.permissions
        });

        return collaboratorProGenerate.collaborator!;
      })
    );

    const phases: OutputData['phases'] = await Promise.all(
      _.map(inputData.phases, async phaseInput => {
        const phaseGenerate = new Test.PhaseGenerate(client, ctx);
        await phaseGenerate.create({
          contractId: contract.id,
          ...phaseInput
        });

        await Promise.all(
          _.map(phaseInput.tasks, async taskInput => {
            const data = {
              creatorId: proUser.lastRoleId,
              ...taskInput
            };

            if (!_.isEmpty(taskInput.assignees)) {
              data.assignees = _.map(taskInput.assignees, userEmail => {
                const user = _.find(users, { email: userEmail });
                if (!user) throw GraphQLError.notFound(`user by ${userEmail}`);

                return user.lastRoleId!;
              }) as any[];
            }

            await phaseGenerate.addTask(data);

            if (!taskInput.payment) return;

            let task = _.last(phaseGenerate.phase?.tasks)!;

            const paymentGenerate = new Test.PaymentGenerate(client, ctx);
            await paymentGenerate.createCharge({
              amount: getTaskTotal(task),
              stripeId: 'px_' + _.get(task, 'name'),
              ...taskInput.payment.charge
            });
            await paymentGenerate.createPayment(taskInput.payment);

            const payment = paymentGenerate.payment;

            await phaseGenerate.updateTask({
              id: _.get(task, 'id'),
              paymentId: _.get(payment, 'id')
            });

            task = _.find(phaseGenerate.phase?.tasks, { id: task.id })!;

            _.set(task, 'payment', {
              ...payment,
              charge: paymentGenerate.charge,
              payout: paymentGenerate.payout
            });
          })
        );

        const phase = phaseGenerate.phase!;
        if (_.isEmpty(phase.tasks)) throw GraphQLError.notFound('tasks');

        return phase as PopulatedPhase;
      })
    );

    return {
      users,
      phases,
      collaborators,
      contract
    } as OutputData;
  });
}

async function removeOutputData<TData extends { [k: string]: any }>(outputData: TData) {
  const ctx = { sql, events: [] };

  await getClientTransaction(async client => {
    if (!_.isEmpty(outputData.collaborators)) {
      await Promise.all(
        _.map(outputData.collaborators, collaborator =>
          CollaboratorModel.remove.exec(
            client,
            {
              collaboratorId: collaborator.id
            },
            ctx
          )
        )
      );
    }

    if (!_.isEmpty(outputData.users)) {
      await Promise.all(
        _.map(outputData.users, user =>
          UserModel.remove.exec(
            client,
            {
              userId: user.id
            },
            ctx
          )
        )
      );
    }
  });
}

describe('gql/resolvers/Mutation/tasks/edit', () => {
  let outputData: OutputData;

  const inputData = {
    users: [
      {
        email: Email.Home,
        role: {
          name: UserRole.HomeOwner
        }
      },
      {
        email: Email.Pro,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.Other,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner,
        role: {
          name: UserRole.HomeOwner
        }
      },
      {
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.Pro,
        role: {
          name: UserRole.Pro
        }
      }
    ],
    collaborators: [
      {
        permissions: CollaboratorPermission.Full,
        invite: {
          firstName: 'test home',
          inviteMessage: 'test home message',
          type: InviteType.ProjectOwnerInvite,
          userRole: UserRole.HomeOwner
        }
      },
      {
        permissions: CollaboratorPermission.Full,
        invite: {
          firstName: 'test pro',
          inviteMessage: 'test pro message',
          type: InviteType.ProjectProInvite,
          userRole: UserRole.Pro
        }
      }
    ],
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.Fund
    },
    phases: [
      {
        name: PhaseName.First,
        order: 1000,
        tasks: [
          {
            name: TaskName.One,
            materialCost: 100,
            laborCost: 100,
            otherCost: 100,
            markupPercent: 20,
            order: 500,
            status: TaskStatus.Done,
            startDate: moment().toDate(),
            endDate: moment()
              .add(3, 'day')
              .toDate(),
            assignees: [Email.Pro, Email.Collaborator + CollaboratorPermission.Full + UserRole.Pro]
          },
          {
            name: TaskName.Two,
            materialCost: 100,
            laborCost: 100,
            otherCost: 100,
            markupPercent: 20,
            order: 500,
            status: TaskStatus.Todo,
            startDate: moment().toDate(),
            endDate: moment()
              .add(3, 'day')
              .toDate(),
            assignees: [Email.Pro]
          }
        ]
      }
    ]
  };

  before(async () => {
    outputData = await createOutputData(inputData);
  });

  after(async () => {
    await removeOutputData(outputData);
  });

  describe('/resolveTaskRemindersActions', () => {
    const ctx = { sql, events: [] };

    let TR: TaskReminder | undefined;
    //success
    it('should to create TR', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const homeUser = _.find(outputData.users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('home user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        _.set(ctx, 'currentUser', proUser);

        await getClient(async client => {
          const TRData = {
            reminder: 'test',
            roleId: _.get(homeUser, 'lastRoleId'),
            dueDate: new Date(),
            notifies: [NotifyTime.d3daysBefore]
          };
          const data = {
            taskId: _.get(task, 'id'),
            TRs: [
              {
                actionType: ActionType.Create,
                reminder: TRData
              }
            ]
          };

          const [result] = await resolveTaskRemindersActions(client, data, ctx);

          TR = result;

          Test.Check.data(TR, {
            ..._.omit(TRData, ['dueDate', 'notifies']),
            dueDate: {
              $check: '===',
              $value: new Date(),
              $func: (value: Date) => moment(value).format('YYYY:MM:DD')
            }
          });
        });
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('should to update TR', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      if (!TR) throw GraphQLError.notFound('TR');

      let error = null;
      try {
        _.set(ctx, 'currentUser', proUser);

        await getClient(async client => {
          const TRData = {
            id: _.get(TR, 'id'),
            reminder: 'test 2'
          };
          const data = {
            taskId: _.get(task, 'id'),
            TRs: [
              {
                actionType: ActionType.Update,
                reminder: TRData
              }
            ]
          };

          [TR] = await resolveTaskRemindersActions(client, data, ctx);

          Test.Check.data(TR, {
            ...TRData
          });
        });
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    // error
    it('no data provided for update', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        await getClient(async client => {
          await resolveTaskRemindersActions(
            client,
            {
              taskId: _.get(task, 'id'),
              TRs: [
                {
                  actionType: ActionType.Update,
                  reminder: {
                    id: task.id
                  }
                }
              ]
            },
            ctx
          );
        });
      } catch (e) {
        error = e;

        Test.Check.error(error, new GraphQLError('No data provided for update.'));
      } finally {
        assert(error !== null, 'Must be error!.');
      }
    });

    it('required field for update TR', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        await getClient(async client => {
          await resolveTaskRemindersActions(
            client,
            {
              taskId: _.get(task, 'id'),
              TRs: [
                {
                  actionType: ActionType.Update,
                  reminder: {
                    reminder: '5'
                  }
                }
              ]
            },
            ctx
          );
        });
      } catch (e) {
        error = e;

        Test.Check.error(error, new GraphQLError(`'Field "id" in ExtendedTaskReminderInput required.`));
      } finally {
        assert(error !== null, 'Must be error!.');
      }
    });

    it('required field for create TR', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        await getClient(async client => {
          await resolveTaskRemindersActions(
            client,
            {
              taskId: _.get(task, 'id'),
              TRs: [
                {
                  actionType: ActionType.Create,
                  reminder: {
                    reminder: 'test'
                  }
                }
              ]
            },
            ctx
          );
        });
      } catch (e) {
        error = e;

        Test.Check.error(error, new GraphQLError(`'Field "roleId" in ExtendedTaskReminderInput required.`));
      } finally {
        assert(error !== null, 'Must be error!.');
      }
    });
  });

  describe('/resolveScheduleActions', () => {
    const ctx = { sql, events: [] };

    let schedule: Schedule | undefined;
    //success
    it('should to create schedule', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const proCollaborator = _.find(outputData.users, {
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.Pro
      });
      if (!proCollaborator) throw GraphQLError.notFound('pro collaborator');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        _.set(ctx, 'currentUser', proUser);

        await getClient(async client => {
          const scheduleData = {
            taskId: _.get(task, 'id'),
            roleId: _.get(proCollaborator, 'lastRoleId'),
            estimatedTime: 5,
            startDate: new Date(),
            endDate: moment()
              .add(1, 'day')
              .toDate()
          };
          const data = {
            schedules: [
              {
                actionType: ActionType.Create,
                schedule: scheduleData
              }
            ]
          };

          [schedule] = await resolveScheduleActions(client, data, ctx);

          Test.Check.data(schedule, {
            ..._.omit(scheduleData, ['startDate', 'endDate']),
            period: {
              0: {
                $check: '===',
                $value: new Date(),
                $func: value => moment(value).format('YYYY:MM:DD')
              },
              '-1': {
                $check: '===',
                $value: _.get(scheduleData, 'endDate'),
                $func: value => moment(value).format('YYYY:MM:DD')
              }
            }
          });
        });
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('should to update schedule', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const proCollaborator = _.find(outputData.users, {
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.Pro
      });
      if (!proCollaborator) throw GraphQLError.notFound('pro collaborator');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      if (!schedule) throw GraphQLError.notFound('schedule');

      let error = null;
      try {
        _.set(ctx, 'currentUser', proUser);

        await getClient(async client => {
          const scheduleData = {
            id: _.get(schedule, 'id'),
            estimatedTime: 6
          };
          const data = {
            schedules: [
              {
                actionType: ActionType.Update,
                schedule: scheduleData
              }
            ]
          };

          [schedule] = await resolveScheduleActions(client, data, ctx);

          Test.Check.data(schedule, {
            ..._.omit(scheduleData, ['startDate', 'endDate'])
          });
        });
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('should to delete schedule', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const proCollaborator = _.find(outputData.users, {
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.Pro
      });
      if (!proCollaborator) throw GraphQLError.notFound('pro collaborator');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      if (!schedule) throw GraphQLError.notFound('schedule');

      let error = null;
      try {
        _.set(ctx, 'currentUser', proUser);

        await getClient(async client => {
          const scheduleData = {
            id: _.get(schedule, 'id')
          };
          const data = {
            schedules: [
              {
                actionType: ActionType.Delete,
                schedule: scheduleData
              }
            ]
          };

          [schedule] = await resolveScheduleActions(client, data, ctx);

          Test.Check.data(schedule, {
            ..._.omit(scheduleData, ['startDate', 'endDate'])
          });
        });
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    // error
    it('required field for delete schedule', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        await getClient(async client => {
          await resolveScheduleActions(
            client,
            {
              schedules: [
                {
                  actionType: ActionType.Update,
                  schedule: {
                    estimatedTime: 5
                  }
                }
              ]
            },
            ctx
          );
        });
      } catch (e) {
        error = e;

        Test.Check.error(error, new GraphQLError(`'Field "id" in ExtendedScheduleInput required.`));
      } finally {
        assert(error !== null, 'Must be error!.');
      }
    });

    it('no data provided for update', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        await getClient(async client => {
          await resolveScheduleActions(
            client,
            {
              schedules: [
                {
                  actionType: ActionType.Update,
                  schedule: {
                    id: task.id
                  }
                }
              ]
            },
            ctx
          );
        });
      } catch (e) {
        error = e;

        Test.Check.error(error, new GraphQLError('No data provided for update.'));
      } finally {
        assert(error !== null, 'Must be error!.');
      }
    });

    it('required field for update schedule', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        await getClient(async client => {
          await resolveScheduleActions(
            client,
            {
              schedules: [
                {
                  actionType: ActionType.Update,
                  schedule: {
                    estimatedTime: 5
                  }
                }
              ]
            },
            ctx
          );
        });
      } catch (e) {
        error = e;

        Test.Check.error(error, new GraphQLError(`'Field "id" in ExtendedScheduleInput required.`));
      } finally {
        assert(error !== null, 'Must be error!.');
      }
    });

    it('required field for create schedule', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        await getClient(async client => {
          await resolveScheduleActions(
            client,
            {
              schedules: [
                {
                  actionType: ActionType.Create,
                  schedule: {
                    estimatedTime: 6
                  }
                }
              ]
            },
            ctx
          );
        });
      } catch (e) {
        error = e;

        Test.Check.error(error, new GraphQLError(`'Field "taskId" in ExtendedScheduleInput required.`));
      } finally {
        assert(error !== null, 'Must be error!.');
      }
    });
  });

  describe('/resolveDecisionActions', () => {
    const ctx = { sql, events: [] };

    let decision: Decision | undefined;
    // success
    it('should to create decision', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const homeUser = _.find(outputData.users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('home user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        _.set(ctx, 'currentUser', proUser);

        await getClient(async client => {
          const decisionData = {
            status: DecisionStatus.Submitted,
            title: 'test',
            makers: [
              {
                actionType: ActionType.Create,
                roleId: homeUser.lastRoleId
              }
            ],
            dueDate: new Date(),
            allowance: 50,
            options: [
              {
                option: 'test',
                units: 2,
                cost: 10,
                actionType: ActionType.Create
              },
              {
                option: 'test 2',
                units: 2,
                cost: 100,
                actionType: ActionType.Create
              }
            ]
          };
          const data = {
            taskId: _.get(task, 'id'),
            decisions: [
              {
                actionType: ActionType.Create,
                decision: decisionData
              }
            ]
          };

          [decision] = await resolveDecisionActions(client, data, ctx);

          Test.Check.data(decision, {
            title: _.get(decisionData, 'title'),
            selectionType: DecisionSelectionType.Single,
            taskId: _.get(task, 'id'),
            allowance: _.get(decisionData, 'allowance'),
            dueDate: {
              $check: '===',
              $value: new Date(),
              $func: value => moment(value).format('YYYY:MM:DD')
            },
            status: DecisionStatus.Submitted
          });
        });
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('should to update decision', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      if (!decision) throw GraphQLError.notFound('decision');

      let error = null;
      try {
        _.set(ctx, 'currentUser', proUser);

        await getClient(async client => {
          const decisionData = {
            id: _.get(decision, 'id'),
            status: DecisionStatus.Submitted,
            title: 'test 2',
            allowance: 55
          };
          const data = {
            taskId: _.get(task, 'id'),
            decisions: [
              {
                actionType: ActionType.Update,
                decision: decisionData
              }
            ]
          };

          [decision] = await resolveDecisionActions(client, data, ctx);

          Test.Check.data(decision, {
            ...decisionData
          });
        });
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('should to delete decision', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      if (!decision) throw GraphQLError.notFound('decision');

      let error = null;
      try {
        _.set(ctx, 'currentUser', proUser);

        await getClient(async client => {
          const decisionData = {
            id: _.get(decision, 'id')
          };
          const data = {
            taskId: _.get(task, 'id'),
            decisions: [
              {
                actionType: ActionType.Delete,
                decision: decisionData
              }
            ]
          };

          [decision] = await resolveDecisionActions(client, data, ctx);

          Test.Check.data(decision, {
            ...decisionData
          });
        });
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    // error
    it('required field for delete decision', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        await getClient(async client => {
          await resolveDecisionActions(
            client,
            {
              taskId: task.id,
              decisions: [
                {
                  actionType: ActionType.Update,
                  decision: {
                    dueDate: new Date()
                  }
                }
              ]
            },
            ctx
          );
        });
      } catch (e) {
        error = e;

        Test.Check.error(error, new GraphQLError(`'Field "id" in ExtendedDecisionInput required.`));
      } finally {
        assert(error !== null, 'Must be error!.');
      }
    });

    it('no data provided for update', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        await getClient(async client => {
          await resolveDecisionActions(
            client,
            {
              taskId: task.id,
              decisions: [
                {
                  actionType: ActionType.Update,
                  decision: {
                    id: task.id
                  }
                }
              ]
            },
            ctx
          );
        });
      } catch (e) {
        error = e;

        Test.Check.error(error, new GraphQLError('No data provided for update.'));
      } finally {
        assert(error !== null, 'Must be error!.');
      }
    });

    it('required field for update decision', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        await getClient(async client => {
          await resolveDecisionActions(
            client,
            {
              taskId: task.id,
              decisions: [
                {
                  actionType: ActionType.Update,
                  decision: {
                    dueDate: new Date()
                  }
                }
              ]
            },
            ctx
          );
        });
      } catch (e) {
        error = e;

        Test.Check.error(error, new GraphQLError(`'Field "id" in ExtendedDecisionInput required.`));
      } finally {
        assert(error !== null, 'Must be error!.');
      }
    });

    it('required field for create decision', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        await getClient(async client => {
          await resolveDecisionActions(
            client,
            {
              taskId: task.id,
              decisions: [
                {
                  actionType: ActionType.Create,
                  decision: {
                    dueDate: new Date()
                  }
                }
              ]
            },
            ctx
          );
        });
      } catch (e) {
        error = e;

        Test.Check.error(error, new GraphQLError(`'Field "title" in ExtendedDecisionInput required.`));
      } finally {
        assert(error !== null, 'Must be error!.');
      }
    });
  });

  describe('/getChangeOrderTasks', () => {
    const ctx = { sql, events: [] };

    // success
    it('should return empty array if task not updated', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        await getClient(async client => {
          const result = await getChangeOrderTasks(
            client,
            {
              tasks: [toTaskInput(task)]
            },
            ctx
          );

          assert(result.length === 0, 'Must be no provided tasks to create CO');
        });
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('should return task if new phase', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        await getClient(async client => {
          const result = await getChangeOrderTasks(
            client,
            {
              tasks: [
                toTaskInput({
                  ...task,
                  phaseId: undefined as any,
                  phaseName: PhaseName.NewPhase
                })
              ]
            },
            ctx
          );

          Test.Check.data(result, {
            id: task.id,
            phaseName: PhaseName.NewPhase
          });
        });
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    // error
    it('task not found', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro user');

      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const task = _.find(firstPhase.tasks, { name: TaskName.One });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        await getClient(async client => {
          await getChangeOrderTasks(
            client,
            {
              tasks: [
                {
                  ...toTaskInput(task),
                  taskId: proUser.id
                }
              ]
            },
            ctx
          );
        });
      } catch (e) {
        error = e;
        Test.Check.error(e, GraphQLError.notFound('task'));
      } finally {
        assert(error !== null, 'Must be error!.');
      }
    });
  });
});
