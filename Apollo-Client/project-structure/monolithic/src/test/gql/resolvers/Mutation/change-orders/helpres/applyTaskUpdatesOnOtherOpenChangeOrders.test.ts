/*external modules*/
import _ from 'lodash';
import async from 'async';
import assert from 'assert';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../../db';
import { UserRole } from '../../../../../../db/types/role';
import { TaskStatus } from '../../../../../../db/types/task';
import { Collaborator, CollaboratorPermission } from '../../../../../../db/types/collaborator';
import { InviteType } from '../../../../../../db/types/invite';
import { Contract } from '../../../../../../db/types/contract';
import { ChangeOrder, ChangeOrderReason, ChangeOrderStatus } from '../../../../../../db/types/changeOrder';
import { Phase } from '../../../../../../db/types/phase';
import { TaskVersion } from '../../../../../../db/types/taskVersion';
/*models*/
import { UserModel } from '../../../../../../db/models/UserModel';
import { CollaboratorModel } from '../../../../../../db/models/CollaboratorModel';
import { ChangeOrderModel } from '../../../../../../db/models/ChangeOrderModel';
import { TaskVersionModel } from '../../../../../../db/models/TaskVersionModel';
/*GQL*/
import { GraphQLError } from '../../../../../../gql';
import { Task } from '../../../../../../gql/resolvers/Types/Task/Task';
import { applyTaskUpdatesOnOtherOpenChangeOrders } from '../../../../../../gql/resolvers/Mutation/change-orders/helpers/applyTaskUpdatesOnOtherOpenChangeOrders';
/*other*/
import { Test } from '../../../../../helpers/Test';

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  ChangeOrder = 'ChangeOrder'
}
const enum PhaseName {
  First = 'FIRST',
  Second = 'SECOND'
}
export enum TaskName {
  First = 'FIRST'
}

type PopulatedPhase = Phase & {
  tasks: Array<Task>;
};

interface OutputData {
  users: Test.TUser[];
  collaborators: Collaborator[];
  contract: Contract;
  task: Task;
  phases: PopulatedPhase[];
}

describe('gql/resolvers/Mutation/change-order/helpers/applyTaskUpdatesOnOtherOpenChangeOrders', () => {
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
      }
    ],
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.ChangeOrder
    },
    phases: [
      {
        name: PhaseName.First,
        order: 1000,
        tasks: [
          {
            name: TaskName.First,
            materialCost: 1,
            laborCost: 1,
            otherCost: 1,
            markupPercent: 5,
            order: 500,
            status: TaskStatus.Done
          }
        ]
      }
    ]
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
        partnerId: proUser.lastRoleId
      });

      const project = projectGenerate.project!;

      const contract = _.find(project.contracts, {
        name: ContractName.ChangeOrder
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

      const phases: Array<PopulatedPhase> = await async.map(inputData.phases, async phaseInput => {
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

        return phaseGenerate.phase!;
      });

      const firstPhase = _.find(phases, { name: PhaseName.First })!;
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      return {
        users,
        collaborators,
        contract,
        phases,
        task: _.flatten(firstPhase.tasks)[0]
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

    const taskVersionUpdateData = {
      name: 'test',
      description: 'textst'
    };

    let homeUser!: Test.TUser;

    let task!: Task;
    let contract!: Contract;

    let changeOrder!: ChangeOrder;
    let otherTaskVersion!: TaskVersion;

    before(async () => {
      homeUser = _.find(outputData.users, { email: Email.Home })!;
      if (!homeUser) throw GraphQLError.notFound('home user');

      task = _.get(outputData, 'task');
      contract = _.get(outputData, 'contract');

      await getClientTransaction(async client => {
        changeOrder = await ChangeOrderModel.create.exec(
          client,
          {
            contractId: contract.id,
            requesterId: homeUser.lastRoleId,
            reason: ChangeOrderReason.Upgrade,
            status: ChangeOrderStatus.Open
          },
          ctx
        );

        otherTaskVersion = await TaskVersionModel.create.exec(
          client,
          {
            ...task,
            taskId: task.id,
            ...taskVersionUpdateData,
            changeOrderId: changeOrder.id
          },
          ctx
        );
      });
    });

    after(async () => {
      await getClientTransaction(async client => {
        await ChangeOrderModel.close.exec(
          client,
          {
            changeOrderId: changeOrder.id
          },
          ctx
        );
      });
    });

    it('should allow to apply task updates on other CO', async () => {
      let error = null;
      try {
        await getClient(async client => {
          const ctx = {
            sql,
            events: []
          };

          const taskUpdateData = {
            laborCost: 50,
            otherCost: 50,
            markupPercent: 50
          };

          await applyTaskUpdatesOnOtherOpenChangeOrders(
            client,
            {
              task: {
                ...task,
                ...taskUpdateData
              } as any
            },
            ctx as any
          );

          await getClient(async client => {
            const updatedTaskVersion = await TaskVersionModel.findById.exec(
              client,
              {
                taskVersionId: otherTaskVersion.id
              },
              ctx
            );
            if (!updatedTaskVersion) throw GraphQLError.notFound('task version');

            assert(
              _.isEqual(
                _.omit(updatedTaskVersion, [...Object.keys(taskUpdateData), 'updatedAt']),
                _.omit(otherTaskVersion, [...Object.keys(taskUpdateData), 'updatedAt'])
              ),
              `Invalid update other task version (after "applyTaskUpdatesOnOtherOpenChangeOrders" fields do not meet expectations)`
            );

            assert(
              _.isEqual(_.pick(updatedTaskVersion, Object.keys(taskUpdateData)), taskUpdateData),
              `Updated other task version have not actual fields`
            );
          });
        });
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });
  });

  // error
  it(`task not found`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const task = _.get(outputData, 'task');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: []
        };

        await applyTaskUpdatesOnOtherOpenChangeOrders(
          client,
          {
            task: {
              id: task.phaseId
            } as any
          },
          ctx as any
        );
      });
    } catch (e) {
      error = e;
      Test.Check.error(e, GraphQLError.notFound('task'));
    } finally {
      assert(error !== null, 'Must be error.');
    }
  });
});
