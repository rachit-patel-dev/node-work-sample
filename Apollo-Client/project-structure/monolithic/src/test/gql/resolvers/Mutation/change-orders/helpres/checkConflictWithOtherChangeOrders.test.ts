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
/*models*/
import { UserModel } from '../../../../../../db/models/UserModel';
import { CollaboratorModel } from '../../../../../../db/models/CollaboratorModel';
import { ChangeOrderModel } from '../../../../../../db/models/ChangeOrderModel';
import { TaskVersionModel } from '../../../../../../db/models/TaskVersionModel';
/*GQL*/
import { GraphQLError } from '../../../../../../gql';
import { Task } from '../../../../../../gql/resolvers/Types/Task/Task';
import { checkConflictWithOtherChangeOrders } from '../../../../../../gql/resolvers/Mutation/change-orders/helpers/checkConflictWithOtherChangeOrders';
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

describe('gql/resolvers/Mutation/change-order/helpers/checkConflictWithOtherChangeOrders', () => {
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
      },
      {
        name: PhaseName.Second,
        order: 1000,
        tasks: []
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

    let homeUser!: Test.TUser;

    let task!: Task;
    let contract!: Contract;

    let changeOrder!: ChangeOrder;

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

        await TaskVersionModel.create.exec(
          client,
          {
            ...task,
            taskId: task.id,
            laborCost: 12345,
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

    it('should allow to create another one CO (if task cost updated)', async () => {
      let error = null;
      try {
        await getClient(async client => {
          const ctx = {
            sql,
            events: []
          };

          await checkConflictWithOtherChangeOrders(
            client,
            {
              tasks: [
                {
                  ...task,
                  description: 'new desc'
                } as any
              ]
            },
            ctx as any
          );
        });
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });
  });

  describe('', () => {
    const ctx = { sql, events: [] };

    let homeUser!: Test.TUser;

    let task!: Task;
    let contract!: Contract;

    let changeOrder!: ChangeOrder;

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

        await TaskVersionModel.create.exec(
          client,
          {
            ...task,
            taskId: task.id,
            name: 'test',
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

    it('should allow to create another one CO', async () => {
      let error = null;
      try {
        await getClient(async client => {
          const ctx = {
            sql,
            events: []
          };

          await checkConflictWithOtherChangeOrders(
            client,
            {
              tasks: [
                {
                  ...task,
                  description: 'new desc'
                } as any
              ]
            },
            ctx as any
          );
        });
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });
  });

  describe('', () => {
    const ctx = { sql, events: [] };

    let homeUser!: Test.TUser;

    let task!: Task;
    let contract!: Contract;

    let changeOrder!: ChangeOrder;

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

        await TaskVersionModel.create.exec(
          client,
          {
            ...task,
            taskId: task.id,
            name: 'test',
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

    it('should allow to create another one CO (with omit change orders)', async () => {
      let error = null;
      try {
        await getClient(async client => {
          const ctx = {
            sql,
            events: []
          };

          await checkConflictWithOtherChangeOrders(
            client,
            {
              tasks: [
                {
                  ...task,
                  name: 'new desc'
                } as any
              ],
              omitChangeOrders: [changeOrder.id]
            },
            ctx as any
          );
        });
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });
  });

  // error
  describe('', () => {
    const ctx = { sql, events: [] };

    let homeUser!: Test.TUser;

    let task!: Task;
    let contract!: Contract;

    let changeOrder!: ChangeOrder;

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

        await TaskVersionModel.create.exec(
          client,
          {
            ...task,
            taskId: task.id,
            materialCost: 12345,
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

    it('error if updated task cost already updated in other CO', async () => {
      let error = null;
      try {
        await getClient(async client => {
          const ctx = {
            sql,
            events: []
          };

          await checkConflictWithOtherChangeOrders(
            client,
            {
              tasks: [
                {
                  id: task.id,
                  laborCost: 12345
                } as any
              ]
            },
            ctx as any
          );
        });
      } catch (e) {
        error = e;
        Test.Check.error(e, new GraphQLError(`New change order conflict with other change order.`));
      } finally {
        assert(error !== null, 'Must be error.');
      }
    });
  });

  describe('', () => {
    const ctx = { sql, events: [] };

    let homeUser!: Test.TUser;

    let task!: Task;
    let contract!: Contract;

    let changeOrder!: ChangeOrder;

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

        await TaskVersionModel.create.exec(
          client,
          {
            ...task,
            taskId: task.id,
            name: 'test',
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

    it('error if updated col. already updated in other CO', async () => {
      let error = null;
      try {
        await getClient(async client => {
          const ctx = {
            sql,
            events: []
          };

          await checkConflictWithOtherChangeOrders(
            client,
            {
              tasks: [
                {
                  id: task.id,
                  name: 'NEW 2'
                } as any
              ]
            },
            ctx as any
          );
        });
      } catch (e) {
        error = e;
        Test.Check.error(e, new GraphQLError(`New change order conflict with other change order.`));
      } finally {
        assert(error !== null, 'Must be error.');
      }
    });
  });

  describe('', () => {
    const ctx = { sql, events: [] };

    let homeUser!: Test.TUser;

    let task!: Task;
    let phase!: Phase;
    let contract!: Contract;

    let changeOrder!: ChangeOrder;

    before(async () => {
      homeUser = _.find(outputData.users, { email: Email.Home })!;
      if (!homeUser) throw GraphQLError.notFound('home user');

      task = _.get(outputData, 'task');
      phase = _.find(outputData.phases, { name: PhaseName.Second })!;
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

        await TaskVersionModel.create.exec(
          client,
          {
            ...task,
            taskId: task.id,
            phaseId: phase.id,
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

    it('error if updated col. phaseName but in other CO updated phaseId', async () => {
      let error = null;
      try {
        await getClient(async client => {
          const ctx = {
            sql,
            events: []
          };

          await checkConflictWithOtherChangeOrders(
            client,
            {
              tasks: [
                {
                  id: task.id,
                  phaseName: 'NEW 2'
                } as any
              ]
            },
            ctx as any
          );
        });
      } catch (e) {
        error = e;
        Test.Check.error(e, new GraphQLError(`New change order conflict with other change order.`));
      } finally {
        assert(error !== null, 'Must be error.');
      }
    });
  });

  describe('', () => {
    const ctx = { sql, events: [] };

    let homeUser!: Test.TUser;

    let task!: Task;
    let contract!: Contract;

    let changeOrder!: ChangeOrder;

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

        await TaskVersionModel.create.exec(
          client,
          {
            ...task,
            taskId: task.id,
            phaseName: 'NEW',
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

    it('error if updated col. phaseId but in other CO updated phaseName', async () => {
      let error = null;
      try {
        await getClient(async client => {
          const ctx = {
            sql,
            events: []
          };

          await checkConflictWithOtherChangeOrders(
            client,
            {
              tasks: [
                {
                  id: task.id,
                  phaseId: task.id
                } as any
              ]
            },
            ctx as any
          );
        });
      } catch (e) {
        error = e;
        Test.Check.error(e, new GraphQLError(`New change order conflict with other change order.`));
      } finally {
        assert(error !== null, 'Must be error.');
      }
    });
  });

  describe('', () => {
    const ctx = { sql, events: [] };

    let homeUser!: Test.TUser;

    let task!: Task;
    let contract!: Contract;

    let changeOrder!: ChangeOrder;

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

        await TaskVersionModel.create.exec(
          client,
          {
            ...task,
            taskId: task.id,
            phaseName: 'NEW',
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

    it('error if again update phaseName', async () => {
      let error = null;
      try {
        await getClient(async client => {
          const ctx = {
            sql,
            events: []
          };

          await checkConflictWithOtherChangeOrders(
            client,
            {
              tasks: [
                {
                  id: task.id,
                  phaseName: 'NEW 2'
                } as any
              ]
            },
            ctx as any
          );
        });
      } catch (e) {
        error = e;
        Test.Check.error(e, new GraphQLError(`New change order conflict with other change order.`));
      } finally {
        assert(error !== null, 'Must be error.');
      }
    });
  });

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

        await checkConflictWithOtherChangeOrders(
          client,
          {
            tasks: [
              {
                id: task.phaseId
              } as any
            ]
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
