/*external modules*/
import _ from 'lodash';
import moment from 'moment';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Contract, ContractPermissionResult } from '../../../../../db/types/contract';
import { Collaborator, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { Task } from '../../../../../db/types/task';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { Schedule } from '../../../../../gql/resolvers/Types/Schedule';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { createScheduleWorkTime: Schedule };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}

const enum ContractName {
  Schedule = 'Schedule'
}

const enum TaskName {
  TestName = 'TestName'
}

interface OutputData {
  users: Test.TUser[];
  contract: Contract;
  collaborators: Collaborator[];
  tasks: Task[];
}

const requiredFieldSet: Test.TFieldSet<Schedule> = {
  scalar: ['id', 'estimatedTime'],
  object: ['task', 'creator', 'worker'],
  array: ['period']
};

const CREATE_SCHEDULE_WORK_TIME_MUTATION = `mutation ($input: CreateScheduleWorkTimeInput!) {
  createScheduleWorkTime(input: $input) {
      id
      estimatedTime

      period

      task {
        id
      }
      creator {
        id
      }
      worker {
        id
      }
  }
}`;

describe('gql/resolvers/Mutation/schedule/create', () => {
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
      }
    },
    contract: {
      name: ContractName.Schedule
    },
    phase: {
      name: 'schedule',
      order: 1000
    },
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
        name: TaskName.TestName,
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
      }
    ],
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
        name: ContractName.Schedule
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

      const paymentGenerate = new Test.PaymentGenerate(client, ctx);
      await paymentGenerate.createCharge(inputData.payment.operation);
      await paymentGenerate.createPayment(inputData.payment);

      const phaseGenerate = new Test.PhaseGenerate(client, ctx);

      await phaseGenerate.create({
        contractId: contract.id,
        ...inputData.phase
      });

      await Promise.all(
        _.map(inputData.tasks, async taskData => {
          const assignees = _.map(taskData.assignees, assigneeEmail => {
            const user = _.find(users, { email: assigneeEmail });
            if (!user) {
              throw new GraphQLError(`Not found assignee by email: ${assigneeEmail}.`);
            }
            return user.lastRoleId;
          });

          await phaseGenerate.addTask({
            creatorId: homeUser.lastRoleId,
            ...taskData,
            assignees
          });
        })
      );

      const phase = phaseGenerate.phase!;

      if (!phase.tasks) throw GraphQLError.notFound('tasks');
      const tasks = phase.tasks;

      return {
        users,
        contract,
        collaborators,
        tasks
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
  it('should allow to create schedule', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const collaboratorUser = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Read + UserRole.Pro
    });
    const task = _.find(outputData.tasks, { name: TaskName.TestName });
    if (!task) throw GraphQLError.notFound('task');

    const schedule = {
      taskId: _.get(task, 'id'),
      roleId: _.get(collaboratorUser, 'lastRoleId'),
      estimatedTime: 8,
      startDate: task.startDate,
      endDate: task.endDate
    };

    const { data, errors } = await execQuery<TQuery>(
      CREATE_SCHEDULE_WORK_TIME_MUTATION,
      {
        input: schedule
      },
      proUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.createScheduleWorkTime;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        estimatedTime: _.get(schedule, 'estimatedTime'),
        period: {
          0: {
            $check: 'equal',
            $value: _.get(schedule, 'startDate'),
            $func: (date: Date) => moment(date).format('YYYY.MM.DD')
          },
          '-1': {
            $check: 'equal',
            $value: _.get(schedule, 'endDate'),
            $func: (date: Date) => moment(date).format('YYYY.MM.DD')
          }
        },
        'task.id': _.get(task, 'id'),
        'creator.id': _.get(proUser, 'lastRoleId'),
        'worker.id': _.get(collaboratorUser, 'lastRoleId')
      },
      requiredFieldSet
    );
  });

  // error
  it('endDate cannot be after task endDate', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const task = _.find(outputData.tasks, { name: TaskName.TestName });
    if (!task) throw GraphQLError.notFound('task');

    const { errors } = await execQuery<TQuery>(
      CREATE_SCHEDULE_WORK_TIME_MUTATION,
      {
        input: {
          taskId: _.get(task, 'id'),
          roleId: _.get(proUser, 'lastRoleId'),
          ..._.get(inputData, 'schedule')
        }
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError(`Schedule end date cannot be later than the end of the task.`));
  });

  it('startDate cannot be before task startDate', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const task = _.find(outputData.tasks, { name: TaskName.TestName });
    if (!task) throw GraphQLError.notFound('task');

    const { errors } = await execQuery<TQuery>(
      CREATE_SCHEDULE_WORK_TIME_MUTATION,
      {
        input: {
          taskId: _.get(task, 'id'),
          roleId: _.get(proUser, 'lastRoleId'),
          estimatedTime: 8,
          startDate: moment(task.startDate).subtract(1, 'day'),
          endDate: moment()
        }
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError(`Schedule start date cannot be earlier than the start of the task.`));
  });

  it('schedule can create only Pro with Full access', async () => {
    const collaboratorUser = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Read + UserRole.Pro
    });
    const task = _.find(outputData.tasks, { name: TaskName.TestName });

    const { errors } = await execQuery<TQuery>(
      CREATE_SCHEDULE_WORK_TIME_MUTATION,
      {
        input: {
          taskId: _.get(task, 'id'),
          roleId: _.get(collaboratorUser, 'lastRoleId'),
          ..._.get(inputData, 'schedule')
        }
      },
      collaboratorUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.BadPermission, 403));
  });

  it('worker user must be Pro', async () => {
    const proUser = _.find(outputData.users, {
      email: Email.Pro
    });
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const task = _.find(outputData.tasks, { name: TaskName.TestName });

    const { errors } = await execQuery<TQuery>(
      CREATE_SCHEDULE_WORK_TIME_MUTATION,
      {
        input: {
          taskId: _.get(task, 'id'),
          roleId: _.get(homeUser, 'lastRoleId'),
          ..._.get(inputData, 'schedule')
        }
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.BadRole, 403));
  });

  it("other user haven't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    const task = _.find(outputData.tasks, { name: TaskName.TestName });

    const { errors } = await execQuery<TQuery>(
      CREATE_SCHEDULE_WORK_TIME_MUTATION,
      {
        input: {
          taskId: _.get(task, 'id'),
          roleId: _.get(otherUser, 'lastRoleId'),
          ..._.get(inputData, 'schedule')
        }
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('startDate cannot be after endDate', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    const task = _.find(outputData.tasks, { name: TaskName.TestName });

    const { errors } = await execQuery<TQuery>(
      CREATE_SCHEDULE_WORK_TIME_MUTATION,
      {
        input: {
          taskId: _.get(task, 'id'),
          roleId: _.get(otherUser, 'lastRoleId'),
          estimatedTime: 8,
          startDate: moment().add(1, 'day'),
          endDate: moment()
        }
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError("Start Date can't be after End Date."));
  });
});
