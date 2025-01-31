/*external modules*/
import _ from 'lodash';
import moment from 'moment';
import async from 'async';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../../db';
import { UserRole } from '../../../../../../db/types/role';
import { Collaborator, COLLABORATOR_TABLE, CollaboratorPermission } from '../../../../../../db/types/collaborator';
import { InviteType } from '../../../../../../db/types/invite';
import { Contract, ContractPermissionResult, ContractStatus } from '../../../../../../db/types/contract';
import { TaskStatus } from '../../../../../../db/types/task';
/*models*/
import { UserModel } from '../../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../../../index';
import { GraphQLError } from '../../../../../../gql';
import { Phase } from '../../../../../../gql/resolvers/Types/Phase/Phase';
import { Task } from '../../../../../../gql/resolvers/Types/Task/Task';
/*other*/
import { Test } from '../../../../../helpers/Test';

type TQuery = { addTaskAssignees: Task };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ProjectName {
  First = 'FIRST'
}
const enum ContractName {
  Hired = 'Hired'
}
const enum PhaseName {
  First = 'FIRST'
}
const enum TaskName {
  First = 'FIRST',
  Second = 'SECOND',
  Third = 'THIRD'
}

type PopulatedPhase = Phase & {
  tasks: Array<Task>;
};
type PopulatedContract = Contract & {
  phases: Array<PopulatedPhase>;
};

interface OutputData {
  users: Test.TUser[];
  contract: PopulatedContract;
  collaborators: Collaborator[];
}

const requiredFieldSet: Test.TFieldSet<Task> = {
  scalar: [
    'id',
    'name',
    'description',
    'divisionTrade',
    'room',
    'materialCost',
    'laborCost',
    'otherCost',
    'markupPercent',
    'startDate',
    'endDate',
    'phaseId',
    'creatorId',
    'order',
    'status',
    'createdAt',
    'updatedAt'
  ],
  object: ['phase', 'creator'],
  array: ['files', 'comments', 'decisions', 'taskReminders', 'schedules', 'assignees']
};

const ADD_TASK_ASSIGNEES_MUTATION = `mutation ($taskId: ID!, $assignees: [ID!]!) {
  addTaskAssignees(taskId: $taskId, assignees: $assignees) {
    id
    name
    description
    divisionTrade
    room
    materialCost
    laborCost
    otherCost
    markupPercent
    startDate
    endDate
    phaseId
    creatorId
    order
    status
    createdAt
    updatedAt

    phase {
      id
      name
    }
    creator {
      id
      name
    }

    files {
      id
    }
    comments {
      id
    }
    decisions {
      id
    }
    taskReminders {
      id
    }
    schedules {
      id
    }
    assignees {
      id
      name
    }
  }
}`;

describe('gql/resolvers/Mutation/tasks/assignees/addAssignees', () => {
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
        email: Email.Collaborator + CollaboratorPermission.Read + UserRole.HomeOwner,
        role: {
          name: UserRole.HomeOwner
        }
      },
      {
        email: Email.Collaborator + CollaboratorPermission.Write + UserRole.HomeOwner,
        role: {
          name: UserRole.HomeOwner
        }
      }
    ],
    collaborators: [
      {
        permissions: CollaboratorPermission.Read,
        invite: {
          firstName: 'test home 1',
          inviteMessage: 'test home message 1',
          type: InviteType.ProjectOwnerInvite,
          userRole: UserRole.HomeOwner
        }
      },
      {
        permissions: CollaboratorPermission.Write,
        invite: {
          firstName: 'test home 2',
          inviteMessage: 'test home message 2',
          type: InviteType.ProjectOwnerInvite,
          userRole: UserRole.HomeOwner
        }
      }
    ],
    project: {
      name: ProjectName.First,
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.Hired,
      status: ContractStatus.Hired,
      phases: [
        {
          name: PhaseName.First,
          order: 0,
          tasks: [
            {
              name: TaskName.First,
              status: TaskStatus.Todo,
              description: 'test description',
              divisionTrade: 'test divisionTrade',
              materialCost: 100,
              laborCost: 100,
              otherCost: 100,
              markupPercent: 20,
              order: 0
            },
            {
              name: TaskName.Second,
              status: TaskStatus.Todo,
              description: 'test description 2',
              divisionTrade: 'test divisionTrade 2',
              materialCost: 100,
              laborCost: 100,
              otherCost: 100,
              markupPercent: 20,
              order: 1
            },
            {
              name: TaskName.Third,
              status: TaskStatus.Todo,
              description: 'test description 3',
              divisionTrade: 'test divisionTrade 3',
              materialCost: 100,
              laborCost: 100,
              otherCost: 100,
              markupPercent: 20,
              order: 2
            }
          ]
        }
      ]
    }
  };

  before(async () => {
    const ctx = { sql, events: [] };

    outputData = await getClientTransaction(async client => {
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
        status: inputData.contract.status,
        partnerId: proUser.lastRoleId
      });
      const project = projectGenerate.project!;

      const contract = _.find(project.contracts, {
        name: inputData.contract.name
      });
      if (!contract) throw GraphQLError.notFound('contract');

      const phases: Array<PopulatedPhase> = await async.map(inputData.contract.phases, async phaseInput => {
        const phaseGenerate = new Test.PhaseGenerate(client, ctx);
        await phaseGenerate.create({
          contractId: contract.id,
          ...phaseInput
        });

        await async.each(phaseInput.tasks, async taskInput => {
          await phaseGenerate.addTask({
            creatorId: proUser.lastRoleId,
            ...taskInput
          });
        });

        const phase = phaseGenerate.phase!;
        if (_.isEmpty(phase.tasks)) throw GraphQLError.notFound('tasks');

        return phase;
      });

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

      return {
        users,
        collaborators,
        contract: {
          ...contract,
          phases
        }
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      await Promise.all(
        _.map([outputData.contract], async contract => {
          await getClient(async client => {
            await client.query(
              ctx.sql`
                DELETE
                FROM ${COLLABORATOR_TABLE}
                WHERE "contractId" = ${contract.id}
              `
            );
          });
        })
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
  it('should allow to owner user add assignees', async () => {
    const contract = outputData.contract;

    const phase = _.find(contract.phases, { name: PhaseName.First });
    if (!phase) throw GraphQLError.notFound('phase');

    const firstTask = _.find(phase.tasks, { name: TaskName.First });
    if (!firstTask) throw GraphQLError.notFound('task');

    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const { data, errors } = await execQuery<TQuery>(
      ADD_TASK_ASSIGNEES_MUTATION,
      {
        taskId: firstTask.id,
        assignees: [proUser.lastRoleId]
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.addTaskAssignees;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        ..._.pick(firstTask, requiredFieldSet.scalar!),
        startDate: {
          $check: '===',
          $value: firstTask.startDate,
          $func: (value: any) => moment(value).format('YYYY:MM:DD HH:mm')
        },
        endDate: {
          $check: '===',
          $value: firstTask.endDate,
          $func: (value: any) => moment(value).format('YYYY:MM:DD HH:mm')
        },
        createdAt: {
          $check: '===',
          $value: firstTask.createdAt,
          $func: (value: any) => moment(value).format('YYYY:MM:DD HH:mm')
        },
        updatedAt: {
          $check: '===',
          $value: new Date(),
          $func: (value: any) => moment(value).format('YYYY:MM:DD HH:mm')
        }
      },
      requiredFieldSet
    );

    Test.Check.data(result.assignees, {
      id: proUser.lastRoleId,
      name: proUser.role!.name
    });
  });

  it('should allow to owner collaborator user add assignees', async () => {
    const contract = outputData.contract;

    const phase = _.find(contract.phases, { name: PhaseName.First });
    if (!phase) throw GraphQLError.notFound('phase');

    const secondTask = _.find(phase.tasks, { name: TaskName.Second });
    if (!secondTask) throw GraphQLError.notFound('task');

    const collaboratorWriteHome = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Write + UserRole.HomeOwner
    });
    if (!collaboratorWriteHome) throw GraphQLError.notFound('collaborator write home');

    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const { data, errors } = await execQuery<TQuery>(
      ADD_TASK_ASSIGNEES_MUTATION,
      {
        taskId: secondTask.id,
        assignees: [proUser.lastRoleId, collaboratorWriteHome.lastRoleId]
      },
      collaboratorWriteHome
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.addTaskAssignees;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        ..._.pick(secondTask, requiredFieldSet.scalar!),
        startDate: {
          $check: '===',
          $value: secondTask.startDate,
          $func: (value: any) => moment(value).format('YYYY:MM:DD HH:mm')
        },
        endDate: {
          $check: '===',
          $value: secondTask.endDate,
          $func: (value: any) => moment(value).format('YYYY:MM:DD HH:mm')
        },
        createdAt: {
          $check: '===',
          $value: secondTask.createdAt,
          $func: (value: any) => moment(value).format('YYYY:MM:DD HH:mm')
        },
        updatedAt: {
          $check: '===',
          $value: new Date(),
          $func: (value: any) => moment(value).format('YYYY:MM:DD HH:mm')
        }
      },
      requiredFieldSet
    );

    const passedRoles = [proUser, collaboratorWriteHome];
    Test.Check.data(result.assignees, assignee => {
      const roleByAssignee = _.find(passedRoles, { lastRoleId: assignee.id });
      if (!roleByAssignee) throw GraphQLError.notFound('role by assignee');

      return {
        id: roleByAssignee.lastRoleId,
        name: roleByAssignee.role!.name
      };
    });
  });

  it('should allow to pro user add assignees', async () => {
    const contract = outputData.contract;

    const phase = _.find(contract.phases, { name: PhaseName.First });
    if (!phase) throw GraphQLError.notFound('phase');

    const thirdTask = _.find(phase.tasks, { name: TaskName.Third });
    if (!thirdTask) throw GraphQLError.notFound('task');

    const collaboratorWriteHome = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Write + UserRole.HomeOwner
    });
    if (!collaboratorWriteHome) throw GraphQLError.notFound('collaborator write home');

    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const { data, errors } = await execQuery<TQuery>(
      ADD_TASK_ASSIGNEES_MUTATION,
      {
        taskId: thirdTask.id,
        assignees: [proUser.lastRoleId, homeUser.lastRoleId, collaboratorWriteHome.lastRoleId]
      },
      proUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.addTaskAssignees;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        ..._.pick(thirdTask, requiredFieldSet.scalar!),
        startDate: {
          $check: '===',
          $value: thirdTask.startDate,
          $func: (value: any) => moment(value).format('YYYY:MM:DD HH:mm')
        },
        endDate: {
          $check: '===',
          $value: thirdTask.endDate,
          $func: (value: any) => moment(value).format('YYYY:MM:DD HH:mm')
        },
        createdAt: {
          $check: '===',
          $value: thirdTask.createdAt,
          $func: (value: any) => moment(value).format('YYYY:MM:DD HH:mm')
        },
        updatedAt: {
          $check: '===',
          $value: new Date(),
          $func: (value: any) => moment(value).format('YYYY:MM:DD HH:mm')
        }
      },
      requiredFieldSet
    );

    const passedRoles = [proUser, homeUser, collaboratorWriteHome];
    Test.Check.data(result.assignees, assignee => {
      const roleByAssignee = _.find(passedRoles, { lastRoleId: assignee.id });
      if (!roleByAssignee) throw GraphQLError.notFound('role by assignee');

      return {
        id: roleByAssignee.lastRoleId,
        name: roleByAssignee.role!.name
      };
    });
  });

  // error
  // it('owner cannot assign other owners', async () => {
  //   const contract = outputData.contract;
  //
  //   const phase = _.find(contract.phases, { name: PhaseName.First });
  //   if (!phase) throw GraphQLError.notFound('phase');
  //
  //   const firstTask = _.find(phase.tasks, { name: TaskName.First });
  //   if (!firstTask) throw GraphQLError.notFound('task');
  //
  //   const homeUser = _.find(outputData.users, { email: Email.Home });
  //   if (!homeUser) throw GraphQLError.notFound('home user');
  //
  //   const collaboratorWriteHome = _.find(outputData.users, {
  //     email: Email.Collaborator + CollaboratorPermission.Write + UserRole.HomeOwner
  //   });
  //   if (!collaboratorWriteHome) throw GraphQLError.notFound('collaborator write home');
  //
  //   const { errors } = await execQuery<TQuery>(
  //     ADD_TASK_ASSIGNEES_MUTATION,
  //     {
  //       taskId: firstTask.id,
  //       assignees: [collaboratorWriteHome.lastRoleId]
  //     },
  //     homeUser
  //   );
  //
  //   Test.Check.error(errors, new GraphQLError(`Owner cannot assign other owners`));
  // });

  it("collaborator with access below write haven't access", async () => {
    const contract = outputData.contract;

    const phase = _.find(contract.phases, { name: PhaseName.First });
    if (!phase) throw GraphQLError.notFound('phase');

    const firstTask = _.find(phase.tasks, { name: TaskName.First });
    if (!firstTask) throw GraphQLError.notFound('task');

    const collaboratorReadHome = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Read + UserRole.HomeOwner
    });
    if (!collaboratorReadHome) throw GraphQLError.notFound('collaborator read home');

    const { errors } = await execQuery<TQuery>(
      ADD_TASK_ASSIGNEES_MUTATION,
      {
        taskId: firstTask.id,
        assignees: []
      },
      collaboratorReadHome
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.BadPermission, 403));
  });

  it("other user haven't access to contract", async () => {
    const contract = outputData.contract;

    const phase = _.find(contract.phases, { name: PhaseName.First });
    if (!phase) throw GraphQLError.notFound('phase');

    const firstTask = _.find(phase.tasks, { name: TaskName.First });
    if (!firstTask) throw GraphQLError.notFound('task');

    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('other user');

    const { errors } = await execQuery<TQuery>(
      ADD_TASK_ASSIGNEES_MUTATION,
      {
        taskId: firstTask.id,
        assignees: []
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });
});
