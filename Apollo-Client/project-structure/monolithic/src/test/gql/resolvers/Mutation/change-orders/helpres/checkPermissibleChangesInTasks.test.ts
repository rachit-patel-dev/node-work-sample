/*external modules*/
import _ from 'lodash';
import async from 'async';
import assert from 'assert';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../../db';
import { UserRole } from '../../../../../../db/types/role';
import { Payment } from '../../../../../../gql/resolvers/Payment';
import { PaymentOperation, PaymentOperationStatus } from '../../../../../../db/types/paymentOperation';
import { TaskStatus } from '../../../../../../db/types/task';
import { Collaborator, CollaboratorPermission } from '../../../../../../db/types/collaborator';
import { InviteType } from '../../../../../../db/types/invite';
import { Contract } from '../../../../../../db/types/contract';
import { getTaskTotal } from '../../../../../../db/dataUtils/getTaskTotal';
import { buildDataLoader } from '../../../../../../db/dataLoaders';
/*models*/
import { UserModel } from '../../../../../../db/models/UserModel';
import { CollaboratorModel } from '../../../../../../db/models/CollaboratorModel';
/*GQL*/
import { GraphQLError } from '../../../../../../gql';
import { Phase } from '../../../../../../gql/resolvers/Types/Phase/Phase';
import { Task } from '../../../../../../gql/resolvers/Types/Task/Task';
import { TaskInput } from '../../../../../../gql/resolvers/Types/Task/inputs/TaskInput';
import { WhoCanSeeFiles } from '../../../../../../gql/resolvers/Types/File';
import { checkPermissibleChangesInTasks } from '../../../../../../gql/resolvers/Mutation/change-orders/helpers/checkPermissibleChangesInTasks';
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
  FirstFunded = 'FIRSTFUNDED',
  SecondFunded = 'SECONDFUNDED',
  FirstUnfunded = 'FIRSTUNFUNDED',
  SecondUnfunded = 'SECONDUNFUNDED'
}
export enum TaskName {
  First = 'FIRST',
  Second = 'SECOND',
  Third = 'THIRD',
  Four = 'FOUR'
}

type PopulatedPhase = Phase & {
  tasks: Array<Task & { payment: Payment & { charge: PaymentOperation; payout?: PaymentOperation } }>;
};

interface OutputData {
  users: Test.TUser[];
  collaborators: Collaborator[];
  phases: Array<PopulatedPhase>;
  contract: Contract;
}

describe('gql/resolvers/Mutation/change-order/helpers/checkPermissibleChangesInTasks', () => {
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
        name: PhaseName.FirstFunded,
        order: 1000,
        tasks: [
          {
            name: TaskName.First,
            materialCost: 1,
            laborCost: 1,
            otherCost: 1,
            markupPercent: 5,
            order: 500,
            status: TaskStatus.Done,
            assignees: [Email.Pro],
            payment: {
              payoutRequestedAt: new Date(),
              charge: {
                availableAt: new Date(),
                status: PaymentOperationStatus.Succeeded
              }
            }
          },
          {
            name: TaskName.Second,
            materialCost: 1,
            laborCost: 1,
            otherCost: 1,
            markupPercent: 5,
            order: 500,
            status: TaskStatus.Done,
            assignees: [Email.Pro],
            payment: {
              charge: {
                availableAt: new Date(),
                status: PaymentOperationStatus.Succeeded
              }
            }
          },
          {
            name: TaskName.Third,
            materialCost: 0,
            laborCost: 0,
            otherCost: 0,
            markupPercent: 0,
            order: 500,
            status: TaskStatus.Done,
            assignees: [Email.Pro],
            payment: {
              charge: {
                availableAt: new Date(),
                status: PaymentOperationStatus.Succeeded
              }
            }
          },
          {
            name: TaskName.Four,
            materialCost: 0,
            laborCost: 0,
            otherCost: 0,
            markupPercent: 0,
            order: 500,
            status: TaskStatus.Done,
            assignees: [Email.Pro],
            payment: {
              charge: {
                availableAt: new Date(),
                status: PaymentOperationStatus.Succeeded
              }
            }
          }
        ]
      },
      {
        name: PhaseName.SecondFunded,
        order: 1000,
        tasks: [
          {
            name: TaskName.First,
            materialCost: 1,
            laborCost: 1,
            otherCost: 1,
            markupPercent: 5,
            order: 500,
            status: TaskStatus.Done,
            assignees: [Email.Pro],
            payment: {
              payoutRequestedAt: new Date(),
              charge: {
                availableAt: new Date(),
                status: PaymentOperationStatus.Succeeded
              }
            }
          }
        ]
      },
      {
        name: PhaseName.FirstUnfunded,
        order: 1000,
        tasks: [
          {
            name: TaskName.First,
            materialCost: 1,
            laborCost: 1,
            otherCost: 1,
            markupPercent: 5,
            order: 500,
            status: TaskStatus.Done,
            assignees: [Email.Pro],
            payment: {}
          }
        ]
      },
      {
        name: PhaseName.SecondUnfunded,
        order: 1000,
        tasks: [
          {
            name: TaskName.First,
            materialCost: 1,
            laborCost: 1,
            otherCost: 1,
            markupPercent: 5,
            order: 500,
            status: TaskStatus.Done,
            assignees: [Email.Pro],
            payment: {}
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

      const phases: OutputData['phases'] = await async.map(inputData.phases, async phaseInput => {
        const phaseGenerate = new Test.PhaseGenerate(client, ctx);
        await phaseGenerate.create({
          contractId: contract.id,
          ...phaseInput
        });

        await async.each(phaseInput.tasks, async taskInput => {
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

          if (_.isEmpty(taskInput.payment)) return;

          let task = _.last(phaseGenerate.phase?.tasks)!;
          const taskAmount = getTaskTotal(task);

          const paymentGenerate = new Test.PaymentGenerate(client, ctx);
          await paymentGenerate.createCharge({
            amount: taskAmount,
            stripeId: taskAmount > 0 ? 'px_' + _.get(task, 'name') : 'none',
            ..._.get(taskInput, ['payment', 'charge'])
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
        });

        const phase = phaseGenerate.phase!;
        if (_.isEmpty(phase.tasks)) throw GraphQLError.notFound('tasks');

        return phase;
      });

      return {
        users,
        phases,
        collaborators,
        contract
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
  it('should allow to move task from unfunded phase to unfunded', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const firstUnfundedPhase = _.find(outputData.phases, { name: PhaseName.FirstUnfunded });
    if (!firstUnfundedPhase) throw GraphQLError.notFound('first unfunded phase');

    const secondUnfundedPhase = _.find(outputData.phases, { name: PhaseName.SecondUnfunded });
    if (!secondUnfundedPhase) throw GraphQLError.notFound('second unfunded phase');

    const task = _.find(firstUnfundedPhase.tasks, { name: TaskName.First });
    if (!task) throw GraphQLError.notFound('task');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: proUser
        };

        const data: TaskInput[] = [
          {
            ...task,
            phaseName: secondUnfundedPhase.name,
            files: [],
            assignees: [],
            whoCanSeeFiles: WhoCanSeeFiles.MinPermission
          }
        ];

        await checkPermissibleChangesInTasks(
          client,
          { tasks: data, contractId: firstUnfundedPhase.contractId },
          ctx as any
        );
      });
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  it('should allow to move task from funded phase to unfunded', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const fundedPhase = _.find(outputData.phases, { name: PhaseName.FirstFunded });
    if (!fundedPhase) throw GraphQLError.notFound('funded phase');

    const unfundedPhase = _.find(outputData.phases, { name: PhaseName.FirstUnfunded });
    if (!unfundedPhase) throw GraphQLError.notFound('unfunded phase');

    const task = _.find(fundedPhase.tasks, { name: TaskName.Second });
    if (!task) throw GraphQLError.notFound('task');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: proUser
        };

        const data: TaskInput[] = [
          {
            ...task,
            phaseId: unfundedPhase.id,
            files: [],
            assignees: [],
            whoCanSeeFiles: WhoCanSeeFiles.MinPermission
          }
        ];

        await checkPermissibleChangesInTasks(client, { tasks: data, contractId: unfundedPhase.contractId }, ctx as any);
      });
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  it('should allow to update task on funded phase', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const fundedPhase = _.find(outputData.phases, { name: PhaseName.FirstFunded });
    if (!fundedPhase) throw GraphQLError.notFound('funded phase');

    const task = _.find(fundedPhase.tasks, { name: TaskName.First });
    if (!task) throw GraphQLError.notFound('task');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: proUser
        };

        const data: TaskInput[] = [
          {
            ...task,
            description: 'new desc',
            name: 'updated',
            files: [],
            assignees: [],
            whoCanSeeFiles: WhoCanSeeFiles.MinPermission
          }
        ];

        await checkPermissibleChangesInTasks(client, { tasks: data, contractId: fundedPhase.contractId }, ctx as any);
      });
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  it('should allow to update task cost if prev cost equal 0 (on funded phase)', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const fundedPhase = _.find(outputData.phases, { name: PhaseName.FirstFunded });
    if (!fundedPhase) throw GraphQLError.notFound('funded phase');

    const task = _.find(fundedPhase.tasks, { name: TaskName.Third });
    if (!task) throw GraphQLError.notFound('task');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: proUser
        };

        const data: TaskInput[] = [
          {
            ...task,
            materialCost: 5,
            laborCost: 5,
            otherCost: 5,
            files: [],
            assignees: [],
            whoCanSeeFiles: WhoCanSeeFiles.MinPermission
          }
        ];

        await checkPermissibleChangesInTasks(client, { tasks: data, contractId: fundedPhase.contractId }, ctx as any);
      });
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  it('should allow to move task on new phase', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const unfundedPhase = _.find(outputData.phases, { name: PhaseName.FirstUnfunded });
    if (!unfundedPhase) throw GraphQLError.notFound('unfunded phase');

    const task = _.find(unfundedPhase.tasks, { name: TaskName.First });
    if (!task) throw GraphQLError.notFound('task');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: proUser
        };

        const data: TaskInput[] = [
          {
            ...task,
            phaseName: 'New phase',
            files: [],
            assignees: [],
            whoCanSeeFiles: WhoCanSeeFiles.MinPermission
          }
        ];

        await checkPermissibleChangesInTasks(client, { tasks: data, contractId: unfundedPhase.contractId }, ctx as any);
      });
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  it('should allow to create task on new phase', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const unfundedPhase = _.find(outputData.phases, { name: PhaseName.FirstUnfunded });
    if (!unfundedPhase) throw GraphQLError.notFound('unfunded phase');

    const task = _.find(unfundedPhase.tasks, { name: TaskName.First });
    if (!task) throw GraphQLError.notFound('task');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: proUser
        };

        const data: TaskInput[] = [
          {
            ..._.omit(task, ['id']),
            phaseName: 'New phase',
            files: [],
            assignees: [],
            whoCanSeeFiles: WhoCanSeeFiles.MinPermission
          }
        ];

        await checkPermissibleChangesInTasks(client, { tasks: data, contractId: unfundedPhase.contractId }, ctx as any);
      });
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  // error
  it(`cannot create task on funded phase`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const fundedPhase = _.find(outputData.phases, { name: PhaseName.FirstFunded });
    if (!fundedPhase) throw GraphQLError.notFound('funded phase');

    const task = _.find(fundedPhase.tasks, { name: TaskName.First });
    if (!task) throw GraphQLError.notFound('task');

    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: homeUser
        };

        const data: TaskInput[] = [
          {
            ..._.omit(task, ['id']),
            files: [],
            assignees: [],
            whoCanSeeFiles: WhoCanSeeFiles.MinPermission
          }
        ];

        await checkPermissibleChangesInTasks(client, { tasks: data, contractId: fundedPhase.contractId }, ctx as any);
      });
    } catch (e) {
      Test.Check.error(e, new GraphQLError(`Phases already funded.`));
    }
  });

  it(`cannot update task cost if task funded`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const fundedPhase = _.find(outputData.phases, { name: PhaseName.FirstFunded });
    if (!fundedPhase) throw GraphQLError.notFound('funded phase');

    const task = _.find(fundedPhase.tasks, { name: TaskName.Four });
    if (!task) throw GraphQLError.notFound('task');

    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: homeUser
        };

        const data: TaskInput[] = [
          {
            ...task,
            materialCost: 100,
            laborCost: 1000,
            otherCost: 1000,
            files: [],
            assignees: [],
            whoCanSeeFiles: WhoCanSeeFiles.MinPermission
          }
        ];

        await checkPermissibleChangesInTasks(client, { tasks: data, contractId: fundedPhase.contractId }, ctx as any);
      });
    } catch (e) {
      Test.Check.error(e, new GraphQLError(`Task already funded.`));
    }
  });

  it(`cannot update task cost on funded phase`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const fundedPhase = _.find(outputData.phases, { name: PhaseName.FirstFunded });
    if (!fundedPhase) throw GraphQLError.notFound('funded phase');

    const task = _.find(fundedPhase.tasks, { name: TaskName.First });
    if (!task) throw GraphQLError.notFound('task');

    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: homeUser
        };

        const data: TaskInput[] = [
          {
            ...task,
            materialCost: 100,
            laborCost: 1000,
            otherCost: 1000,
            files: [],
            assignees: [],
            whoCanSeeFiles: WhoCanSeeFiles.MinPermission
          }
        ];

        await checkPermissibleChangesInTasks(client, { tasks: data, contractId: fundedPhase.contractId }, ctx as any);
      });
    } catch (e) {
      Test.Check.error(e, new GraphQLError(`Task already funded.`));
    }
  });

  it(`cannot move task from unfunded phase to funded`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const fundedPhase = _.find(outputData.phases, { name: PhaseName.FirstFunded });
    if (!fundedPhase) throw GraphQLError.notFound('funded phase');

    const unfundedPhase = _.find(outputData.phases, { name: PhaseName.FirstUnfunded });
    if (!unfundedPhase) throw GraphQLError.notFound('unfunded phase');

    const task = _.find(unfundedPhase.tasks, { name: TaskName.First });
    if (!task) throw GraphQLError.notFound('task');

    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: homeUser
        };

        const data: TaskInput[] = [
          {
            ...task,
            phaseId: fundedPhase.id,
            files: [],
            assignees: [],
            whoCanSeeFiles: WhoCanSeeFiles.All
          }
        ];

        await checkPermissibleChangesInTasks(client, { tasks: data, contractId: unfundedPhase.contractId }, ctx as any);
      });
    } catch (e) {
      Test.Check.error(e, new GraphQLError(`Cannot move task from unfunded phase to funded.`));
    }
  });

  it(`cannot move paid task`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const fundedPhase = _.find(outputData.phases, { name: PhaseName.FirstFunded });
    if (!fundedPhase) throw GraphQLError.notFound('funded phase');

    const secondPhase = _.find(outputData.phases, { name: PhaseName.SecondUnfunded });
    if (!secondPhase) throw GraphQLError.notFound('second phase');

    const task = _.find(fundedPhase.tasks, { name: TaskName.First });
    if (!task) throw GraphQLError.notFound('task');

    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: homeUser
        };

        const data: TaskInput[] = [
          {
            ...task,
            phaseId: secondPhase.id,
            files: [],
            assignees: [],
            whoCanSeeFiles: WhoCanSeeFiles.NoOne
          }
        ];

        await checkPermissibleChangesInTasks(client, { tasks: data, contractId: fundedPhase.contractId }, ctx as any);
      });
    } catch (e) {
      Test.Check.error(e, new GraphQLError('Task already paid or payout requested.'));
    }
  });

  it(`phase not found`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const fundedPhase = _.find(outputData.phases, { name: PhaseName.FirstUnfunded });
    if (!fundedPhase) throw GraphQLError.notFound('funded phase');

    const task = _.find(fundedPhase.tasks, { name: TaskName.First });
    if (!task) throw GraphQLError.notFound('task');

    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: homeUser
        };

        const data: TaskInput[] = [
          {
            ...task,
            phaseId: task.id,
            files: [],
            assignees: [],
            whoCanSeeFiles: WhoCanSeeFiles.MinPermission
          }
        ];

        await checkPermissibleChangesInTasks(client, { tasks: data, contractId: fundedPhase.contractId }, ctx as any);
      });
    } catch (e) {
      Test.Check.error(e, GraphQLError.notFound('phase'));
    }
  });

  it(`task not found`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const fundedPhase = _.find(outputData.phases, { name: PhaseName.FirstFunded });
    if (!fundedPhase) throw GraphQLError.notFound('funded phase');

    const task = _.find(fundedPhase.tasks, { name: TaskName.First });
    if (!task) throw GraphQLError.notFound('task');

    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: homeUser
        };

        const data: TaskInput[] = [
          {
            ...task,
            id: task.phaseId,
            files: [],
            assignees: [],
            whoCanSeeFiles: WhoCanSeeFiles.MinPermission
          }
        ];

        await checkPermissibleChangesInTasks(client, { tasks: data, contractId: fundedPhase.contractId }, ctx as any);
      });
    } catch (e) {
      Test.Check.error(e, GraphQLError.notFound('task'));
    }
  });
});
