/*external modules*/
import _ from 'lodash';
import moment from 'moment';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { Role, UserRole } from '../../../../../db/types/role';
import { Contract, ContractPermissionResult } from '../../../../../db/types/contract';
import { Collaborator, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { Task } from '../../../../../db/types/task';
import { Schedule as ScheduleDB } from '../../../../../db/types/schedule';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
import { TaskModel } from '../../../../../db/models/TaskModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { Schedule } from '../../../../../gql/resolvers/Types/Schedule';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { updateScheduleWorkTime: Schedule };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  Schedule = 'Schedule',
  WithOtherUserPartner = 'WithOtherUserPartner'
}
const enum PhaseName {
  Schedule = 'SCHEDULE',
  WithOtherUserPartner = 'WITHOTHERUSERPARTNER'
}
const enum TaskName {
  WithAssignees = 'WithAssignees',
  TestName = 'TestName'
}
const enum ScheduleName {
  WithAssignees = PhaseName.Schedule + TaskName.WithAssignees,
  TestName = PhaseName.Schedule + TaskName.TestName
}

interface OutputData {
  users: Test.TUser[];
  contracts: Contract[];
  collaborators: Collaborator[];
  tasks: Task[];
  schedules: Array<ScheduleDB & { name: ScheduleName | string }>;
}

const requiredFieldSet: Test.TFieldSet<Schedule> = {
  scalar: ['id', 'estimatedTime'],
  object: ['task', 'creator', 'worker'],
  array: ['period']
};

const UPDATE_SCHEDULE_WORK_TIME_MUTATION = `mutation (
  $scheduleId: ID!,
  $input: UpdateScheduleWorkTimeInput!
) {
  updateScheduleWorkTime(scheduleId: $scheduleId, input: $input) {
      id
      estimatedTime

      period

      task {
        id

        assignees {
          id
        }
      }
      creator {
        id
      }
      worker {
        id
      }
  }
}`;

describe('gql/resolvers/Mutation/schedule/update', () => {
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
        email: Email.Collaborator + CollaboratorPermission.Read + UserRole.Pro,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.Collaborator + CollaboratorPermission.Write + UserRole.Pro,
        role: {
          name: UserRole.Pro
        }
      }
    ],
    collaborators: [
      {
        permissions: CollaboratorPermission.Read,
        invite: {
          firstName: 'test',
          inviteMessage: 'test message',
          type: InviteType.ContractCollaborator,
          userRole: UserRole.Pro
        }
      },
      {
        permissions: CollaboratorPermission.Write,
        invite: {
          firstName: 'test',
          inviteMessage: 'test message',
          type: InviteType.ContractCollaborator,
          userRole: UserRole.Pro
        }
      }
    ],
    invite: {
      firstName: 'test',
      inviteMessage: 'test message',
      type: InviteType.ContractCollaborator,
      userRole: UserRole.Pro
    },
    project: {
      matchData: {
        createdByOwner: true
      },
      contracts: [
        {
          name: ContractName.Schedule,
          partnerEmail: Email.Pro,
          phase: {
            name: PhaseName.Schedule,
            order: 1000,
            payment: {
              payoutRequestedAt: new Date(),
              operation: {
                amount: 100,
                stripeId: '1',
                availableAt: new Date()
              }
            },
            tasks: [
              {
                name: PhaseName.Schedule + TaskName.TestName,
                materialCost: 100,
                laborCost: 100,
                otherCost: 100,
                markupPercent: 20,
                order: 500,
                startDate: moment()
                  .subtract(2, 'day')
                  .toDate(),
                endDate: moment()
                  .subtract(1, 'day')
                  .toDate(),
                assignees: []
              },
              {
                name: PhaseName.Schedule + TaskName.WithAssignees,
                materialCost: 100,
                laborCost: 100,
                otherCost: 100,
                markupPercent: 20,
                order: 500,
                startDate: moment()
                  .subtract(2, 'day')
                  .toDate(),
                endDate: moment()
                  .subtract(1, 'day')
                  .toDate(),
                assignees: [Email.Collaborator + CollaboratorPermission.Read + UserRole.Pro]
              }
            ]
          }
        },
        {
          name: ContractName.WithOtherUserPartner,
          partnerEmail: Email.Other,
          phase: {
            name: PhaseName.WithOtherUserPartner,
            order: 1000,
            payment: {
              payoutRequestedAt: new Date(),
              operation: {
                amount: 100,
                stripeId: '1',
                availableAt: new Date()
              }
            },
            tasks: [
              {
                name: PhaseName.WithOtherUserPartner + TaskName.TestName,
                materialCost: 100,
                laborCost: 100,
                otherCost: 100,
                markupPercent: 20,
                order: 500,
                assignees: []
              }
            ]
          }
        }
      ]
    },
    schedule: {
      estimatedTime: 4,
      startDate: new Date(),
      endDate: new Date()
    }
  };

  before(async () => {
    const ctx = { sql, events: [] };
    outputData = await getClientTransaction(async client => {
      const users = await Promise.all(
        _.map(inputData.users, async userData => {
          const userGenerate = new Test.UserGenerate(client, ctx);

          await userGenerate.create({ email: userData.email });
          await userGenerate.setRole({ name: userData.role.name });

          return userGenerate.user!;
        })
      );

      const homeUser = _.find(users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('owner');

      const proUser = _.find(users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro');

      const collaboratorWritePro = _.find(users, {
        email: Email.Collaborator + CollaboratorPermission.Write + UserRole.Pro
      });
      if (!collaboratorWritePro) {
        throw GraphQLError.notFound('collaborator read pro');
      }

      const projectGenerate = new Test.ProjectGenerate(client, ctx);
      await projectGenerate.create({
        ownerId: homeUser.lastRoleId,
        matchData: inputData.project.matchData as any
      });

      const project = projectGenerate.project!;

      await Promise.all(
        _.map(inputData.project.contracts, async contractData => {
          const partner = _.find(users, { email: contractData.partnerEmail });
          if (!partner) {
            throw GraphQLError.notFound(`partner by ${contractData.partnerEmail}`);
          }

          await projectGenerate.addContract({
            name: contractData.name,
            partnerId: partner.lastRoleId
          });

          const contract = await _.find(project.contracts, {
            name: contractData.name
          });
          if (!contract) {
            throw GraphQLError.notFound(`contract by ${contractData.name}`);
          }
        })
      );
      const contracts = project.contracts!;

      const scheduleContract = _.find(contracts, {
        name: ContractName.Schedule
      })!;

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
            contractId: scheduleContract.id,
            invitedById: userInvited.lastRoleId,
            approvedById: homeUser.lastRoleId,
            userRole: collaborator.role!.name,
            email: email,
            permissions: collaboratorData.permissions
          });

          return collaboratorProGenerate.collaborator!;
        })
      );

      const phases = await Promise.all(
        _.map(inputData.project.contracts, async ({ phase: phaseData, name: contractName }) => {
          const paymentGenerate = new Test.PaymentGenerate(client, ctx);
          await paymentGenerate.createCharge(phaseData.payment.operation);
          await paymentGenerate.createPayment(phaseData.payment);

          const contract = _.find(contracts, { name: contractName })!;

          const phaseGenerate = new Test.PhaseGenerate(client, ctx);

          await phaseGenerate.create({
            contractId: contract.id,
            ...phaseData
          });

          const phase = phaseGenerate.phase!;

          await Promise.all(
            _.map(
              phaseData.tasks as (Omit<TaskModel.create.TArgs, 'phaseId'> & {
                assignees?: string[];
              })[],
              async taskData => {
                const assignees = _.map(taskData.assignees, assigneeEmail => {
                  const user = _.find(users, { email: assigneeEmail });
                  if (!user) {
                    throw new GraphQLError(`Not found assignee by email: ${assigneeEmail}.`);
                  }
                  return user.lastRoleId;
                });

                await phaseGenerate.addTask({
                  creatorId: homeUser.lastRoleId,
                  assignees,
                  ..._.omit(taskData, ['assignees', 'creatorId'])
                });
              }
            )
          );

          return phase;
        })
      );

      const schedulePhase = _.find(phases, { name: PhaseName.Schedule });
      if (!schedulePhase) throw GraphQLError.notFound('schedule phase');

      const schedules = await Promise.all(
        _.map(schedulePhase.tasks, async task => {
          const scheduleGenerate = new Test.ScheduleGenerate(client, ctx);
          await scheduleGenerate.create({
            roleId: collaboratorWritePro.lastRoleId,
            createdById: proUser.lastRoleId,
            taskId: task.id,
            ...inputData.schedule
          });

          return {
            name: task.name,
            ...scheduleGenerate.schedule!
          };
        })
      );

      const tasks = _.flatMap(phases, 'tasks');

      return {
        users,
        contracts,
        collaborators,
        tasks,
        schedules
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
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
    });
  });

  // success
  describe('', () => {
    const ctx = { sql, events: [] };

    let proUser: Test.TUser | undefined;
    let collaboratorProRead: Collaborator | undefined;
    let schedule: ScheduleDB | undefined;
    let task: Task | undefined;

    before(async () => {
      proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('user');

      collaboratorProRead = _.find(outputData.collaborators, {
        email: Email.Collaborator + CollaboratorPermission.Read + UserRole.Pro
      });
      if (!collaboratorProRead) {
        throw GraphQLError.notFound('collaborator pro read');
      }

      schedule = _.find(outputData.schedules, {
        name: ScheduleName.TestName
      });
      if (!schedule) throw GraphQLError.notFound('schedule');

      task = _.find(outputData.tasks, {
        name: PhaseName.Schedule + TaskName.TestName
      });
      if (!task) throw GraphQLError.notFound('task');
    });

    after(async () => {
      await getClientTransaction(async client => {
        await TaskModel.removeAssignees.exec(
          client,
          {
            assignees: [collaboratorProRead!.roleId!],
            taskId: task!.id
          },
          ctx
        );
      });
    });

    it('should allow to update schedule', async () => {
      const scheduleData = {
        startDate: moment(task?.startDate)
          .add(1, 'minute')
          .toDate(),
        endDate: moment(task?.endDate)
          .subtract(1, 'minute')
          .toDate(),
        estimatedTime: 8,
        taskId: task!.id,
        roleId: collaboratorProRead!.roleId!
      };

      const { data, errors } = await execQuery<TQuery>(
        UPDATE_SCHEDULE_WORK_TIME_MUTATION,
        {
          scheduleId: _.get(schedule, 'id'),
          input: scheduleData
        },
        proUser
      );

      Test.Check.noErrors(errors);

      const result = data?.updateScheduleWorkTime;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          estimatedTime: _.get(scheduleData, 'estimatedTime'),
          period: {
            0: {
              $check: 'equal',
              $value: _.get(scheduleData, 'startDate'),
              $func: (date: Date) => moment(date).format('YYYY.MM.DD')
            },
            '-1': {
              $check: 'equal',
              $value: _.get(scheduleData, 'endDate'),
              $func: (date: Date) => moment(date).format('YYYY.MM.DD')
            }
          },
          task: {
            id: _.get(scheduleData, 'taskId'),
            assignees: {
              $check: 'every',
              $value: (member: Role) => _.get(member, 'id') === _.get(collaboratorProRead, 'roleId'),
              $eMessage: 'Only one collaborator must be assignees to task after update schedule'
            }
          },
          'creator.id': _.get(proUser, 'lastRoleId'),
          'worker.id': _.get(collaboratorProRead, 'roleId')
        },
        requiredFieldSet
      );
    });
  });

  // error
  it('endDate cannot be after task endDate', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const schedule = _.find(outputData.schedules, {
      name: ScheduleName.WithAssignees
    });

    const task = _.find(outputData.tasks, {
      name: PhaseName.Schedule + TaskName.TestName
    });
    if (!task) throw GraphQLError.notFound('task');

    const { errors } = await execQuery<TQuery>(
      UPDATE_SCHEDULE_WORK_TIME_MUTATION,
      {
        scheduleId: _.get(schedule, 'id'),
        input: {
          endDate: moment(task.endDate).add(1, 'day')
        }
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError(`Schedule end date cannot be later than the end of the task.`));
  });

  it('startDate cannot be before task startDate', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const schedule = _.find(outputData.schedules, {
      name: ScheduleName.WithAssignees
    });

    const task = _.find(outputData.tasks, {
      name: PhaseName.Schedule + TaskName.TestName
    });
    if (!task) throw GraphQLError.notFound('task');

    const { errors } = await execQuery<TQuery>(
      UPDATE_SCHEDULE_WORK_TIME_MUTATION,
      {
        scheduleId: _.get(schedule, 'id'),
        input: {
          startDate: moment(task.startDate).subtract(1, 'day'),
          endDate: moment()
        }
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError(`Schedule start date cannot be earlier than the start of the task.`));
  });

  it('startDate cannot be after endDate', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const schedule = _.find(outputData.schedules, {
      name: ScheduleName.WithAssignees
    });

    const { errors } = await execQuery<TQuery>(
      UPDATE_SCHEDULE_WORK_TIME_MUTATION,
      {
        scheduleId: _.get(schedule, 'id'),
        input: {
          startDate: moment().add(1, 'day'),
          endDate: moment()
        }
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError("Start Date can't be after End Date."));
  });

  it('new worker must be access to contract', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const otherUser = _.find(outputData.users, { email: Email.Other });

    const schedule = _.find(outputData.schedules, {
      name: ScheduleName.WithAssignees
    });

    const { errors } = await execQuery<TQuery>(
      UPDATE_SCHEDULE_WORK_TIME_MUTATION,
      {
        scheduleId: _.get(schedule, 'id'),
        input: {
          roleId: _.get(otherUser, 'lastRoleId')
        }
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it(`pro can't have access to other contract`, async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const schedule = _.find(outputData.schedules, {
      name: ScheduleName.WithAssignees
    });

    const task = _.find(outputData.tasks, {
      name: PhaseName.WithOtherUserPartner + TaskName.TestName
    });

    const { errors } = await execQuery<TQuery>(
      UPDATE_SCHEDULE_WORK_TIME_MUTATION,
      {
        scheduleId: _.get(schedule, 'id'),
        input: {
          taskId: _.get(task, 'id')
        }
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('task not found', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const schedule = _.find(outputData.schedules, {
      name: ScheduleName.WithAssignees
    });

    const { errors } = await execQuery<TQuery>(
      UPDATE_SCHEDULE_WORK_TIME_MUTATION,
      {
        scheduleId: _.get(schedule, 'id'),
        input: {
          taskId: _.get(proUser, 'id')
        }
      },
      proUser
    );

    Test.Check.error(errors, GraphQLError.notFound('task'));
  });

  it('schedule not found', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const task = _.find(outputData.tasks, {
      name: PhaseName.Schedule + TaskName.TestName
    });

    const { errors } = await execQuery<TQuery>(
      UPDATE_SCHEDULE_WORK_TIME_MUTATION,
      {
        scheduleId: _.get(proUser, 'id'),
        input: {
          taskId: _.get(task, 'id')
        }
      },
      proUser
    );

    Test.Check.error(errors, GraphQLError.notFound('schedule'));
  });

  it("other user haven't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    const task = _.find(outputData.tasks, {
      name: PhaseName.Schedule + TaskName.TestName
    });
    const schedule = _.find(outputData.schedules, {
      name: ScheduleName.TestName
    });

    const { errors } = await execQuery<TQuery>(
      UPDATE_SCHEDULE_WORK_TIME_MUTATION,
      {
        scheduleId: _.get(schedule, 'id'),
        input: {
          taskId: _.get(task, 'id')
        }
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('no provided data for update', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    const schedule = _.find(outputData.schedules, {
      name: ScheduleName.TestName
    });

    const { errors } = await execQuery<TQuery>(
      UPDATE_SCHEDULE_WORK_TIME_MUTATION,
      {
        scheduleId: _.get(schedule, 'id'),
        input: {}
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(`No provided data to update.`));
  });
});
