/*external modules*/
import _ from 'lodash';
import async from 'async';
import assert from 'assert';
import moment from 'moment';
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
import { canBeAutoRequestPayout } from '../../../../../../gql/resolvers/Mutation/payments/helpres/canBeAutoRequestPayout';
/*other*/
import { Test } from '../../../../../helpers/Test';

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  FundPhase = 'FundPhase'
}
const enum PhaseName {
  NotAutoRequest = 'NOTAUTOREQUEST',
  NotRequested = 'NOTREQUESTED',
  NotApproved = 'NOTAPPROVED',
  NotFunded = 'NOTFUNDED',
  WithNotAllTaskInDone = 'WITHNOTALLTASKINDONE',
  PayoutAlreadyRequested = 'PAYOUTALREADYREQUESTED',
  SomeChargeNotSucceeded = 'SOMECHARGENOTSUCCEEDED',
  ChargeWithNullAvailableAt = 'CHARGEWITHNULLAVAILABLEAT',
  ChargeWithAvailableAtInFuture = 'CHARGEWITHAVAILABLEATINFUTURE',
  ToRequest = 'TOREQUEST'
}
export enum TaskName {
  First = 'FIRST',
  Second = 'SECOND'
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

describe('gql/resolvers/Mutation/payments/helpers/canBeAutoRequestPayout', () => {
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
      name: ContractName.FundPhase
    },
    phases: [
      {
        name: PhaseName.NotAutoRequest,
        order: 1000,
        autoPayoutRequest: false,
        tasks: []
      },
      {
        name: PhaseName.NotRequested,
        order: 1000,
        chargeRequestedAt: null,
        autoPayoutRequest: true,
        tasks: []
      },
      {
        name: PhaseName.NotApproved,
        order: 1000,
        chargeRequestedAt: new Date(),
        chargeApprovedAt: null,
        autoPayoutRequest: true,
        tasks: []
      },
      {
        name: PhaseName.NotFunded,
        order: 1000,
        chargeRequestedAt: new Date(),
        chargeApprovedAt: new Date(),
        autoPayoutRequest: true,
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
                status: PaymentOperationStatus.Failed
              }
            }
          }
        ]
      },
      {
        name: PhaseName.WithNotAllTaskInDone,
        order: 1000,
        chargeRequestedAt: new Date(),
        chargeApprovedAt: new Date(),
        autoPayoutRequest: true,
        tasks: [
          {
            name: TaskName.First,
            materialCost: 1,
            laborCost: 1,
            otherCost: 1,
            markupPercent: 5,
            order: 500,
            status: TaskStatus.Todo,
            assignees: [Email.Pro],
            payment: null
          }
        ]
      },
      {
        name: PhaseName.PayoutAlreadyRequested,
        order: 1000,
        chargeRequestedAt: new Date(),
        chargeApprovedAt: new Date(),
        autoPayoutRequest: true,
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
                status: PaymentOperationStatus.Pending
              }
            }
          }
        ]
      },
      {
        name: PhaseName.SomeChargeNotSucceeded,
        order: 1000,
        chargeRequestedAt: new Date(),
        chargeApprovedAt: new Date(),
        autoPayoutRequest: true,
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
              charge: {
                availableAt: new Date(),
                status: PaymentOperationStatus.Pending
              }
            }
          }
        ]
      },
      {
        name: PhaseName.ChargeWithNullAvailableAt,
        order: 1000,
        chargeRequestedAt: new Date(),
        chargeApprovedAt: new Date(),
        autoPayoutRequest: true,
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
              charge: {
                availableAt: null,
                status: PaymentOperationStatus.Succeeded
              }
            }
          }
        ]
      },
      {
        name: PhaseName.ChargeWithAvailableAtInFuture,
        order: 1000,
        chargeRequestedAt: new Date(),
        chargeApprovedAt: new Date(),
        autoPayoutRequest: true,
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
              charge: {
                availableAt: moment()
                  .add(1, 'day')
                  .toDate(),
                status: PaymentOperationStatus.Succeeded
              }
            }
          }
        ]
      },
      {
        name: PhaseName.ToRequest,
        order: 1000,
        chargeRequestedAt: new Date(),
        chargeApprovedAt: new Date(),
        autoPayoutRequest: true,
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
              charge: {
                availableAt: new Date(),
                status: PaymentOperationStatus.Succeeded
              }
            }
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
        name: ContractName.FundPhase
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
          ...(phaseInput as any)
        });

        await Promise.all(
          _.map(phaseInput.tasks, async taskInput => {
            const data = {
              creatorId: proUser.lastRoleId,
              ...(taskInput as any)
            };

            if (!_.isEmpty(_.get(taskInput, 'assignees'))) {
              data.assignees = _.map(_.get(taskInput, 'assignees'), userEmail => {
                const user = _.find(users, { email: userEmail });
                if (!user) throw GraphQLError.notFound(`user by ${userEmail}`);

                return user.lastRoleId!;
              }) as any[];
            }

            await phaseGenerate.addTask(data);

            if (_.isEmpty(_.get(taskInput, 'payment'))) return;

            let task = _.last(phaseGenerate.phase?.tasks)!;

            if (_.get(taskInput, 'payment')) {
              const paymentGenerate = new Test.PaymentGenerate(client, ctx);
              await paymentGenerate.createCharge({
                amount: getTaskTotal(task),
                stripeId: 'px_' + _.get(task, 'name'),
                ..._.get(taskInput, ['payment', 'charge'])
              });
              await paymentGenerate.createPayment(_.get(taskInput, 'payment'));

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
            }
          })
        );

        return phaseGenerate.phase!;
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
  it('should allow to auto request payout', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const phase = _.find(outputData.phases, { name: PhaseName.ToRequest });
    if (!phase) throw GraphQLError.notFound('phase');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: proUser
        };

        const canBeRequest = await canBeAutoRequestPayout(
          client,
          {
            phaseId: phase.id
          },
          ctx as any
        );

        if (!canBeRequest) {
          throw new GraphQLError(`Must be allow auto request payout.`);
        }
      });
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  // error
  it('charge availableAt in future', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const phase = _.find(outputData.phases, { name: PhaseName.ChargeWithAvailableAtInFuture });
    if (!phase) throw GraphQLError.notFound('phase');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: proUser
        };

        const canBeRequest = await canBeAutoRequestPayout(
          client,
          {
            phaseId: phase.id
          },
          ctx as any
        );

        if (!canBeRequest) {
          throw new GraphQLError('Charge availableAt in future');
        }
      });
    } catch (e) {
      error = e;
      Test.Check.error(e, new GraphQLError('Charge availableAt in future'));
    } finally {
      assert(error !== null, 'Must be error.');
    }
  });

  it('charge have null availableAt', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const phase = _.find(outputData.phases, { name: PhaseName.ChargeWithNullAvailableAt });
    if (!phase) throw GraphQLError.notFound('phase');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: proUser
        };

        const canBeRequest = await canBeAutoRequestPayout(
          client,
          {
            phaseId: phase.id
          },
          ctx as any
        );

        if (!canBeRequest) {
          throw new GraphQLError('Charge have null availableAt');
        }
      });
    } catch (e) {
      error = e;
      Test.Check.error(e, new GraphQLError('Charge have null availableAt'));
    } finally {
      assert(error !== null, 'Must be error.');
    }
  });

  it('some charge not Succeeded', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const phase = _.find(outputData.phases, { name: PhaseName.SomeChargeNotSucceeded });
    if (!phase) throw GraphQLError.notFound('phase');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: proUser
        };

        const canBeRequest = await canBeAutoRequestPayout(
          client,
          {
            phaseId: phase.id
          },
          ctx as any
        );

        if (!canBeRequest) {
          throw new GraphQLError('Charge not Succeeded');
        }
      });
    } catch (e) {
      error = e;
      Test.Check.error(e, new GraphQLError('Charge not Succeeded'));
    } finally {
      assert(error !== null, 'Must be error.');
    }
  });

  it('payout already requested', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const phase = _.find(outputData.phases, { name: PhaseName.PayoutAlreadyRequested });
    if (!phase) throw GraphQLError.notFound('phase');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: proUser
        };

        const canBeRequest = await canBeAutoRequestPayout(
          client,
          {
            phaseId: phase.id
          },
          ctx as any
        );

        if (!canBeRequest) {
          throw new GraphQLError('Payout already requested');
        }
      });
    } catch (e) {
      error = e;
      Test.Check.error(e, new GraphQLError('Payout already requested'));
    } finally {
      assert(error !== null, 'Must be error.');
    }
  });

  it('not all tasks in Done', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const phase = _.find(outputData.phases, { name: PhaseName.WithNotAllTaskInDone });
    if (!phase) throw GraphQLError.notFound('phase');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: proUser
        };

        const canBeRequest = await canBeAutoRequestPayout(
          client,
          {
            phaseId: phase.id
          },
          ctx as any
        );

        if (!canBeRequest) {
          throw new GraphQLError('Not all tasks in Done');
        }
      });
    } catch (e) {
      error = e;
      Test.Check.error(e, new GraphQLError('Not all tasks in Done'));
    } finally {
      assert(error !== null, 'Must be error.');
    }
  });

  it('phase must be funded', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const phase = _.find(outputData.phases, { name: PhaseName.NotFunded });
    if (!phase) throw GraphQLError.notFound('phase');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: proUser
        };

        const canBeRequest = await canBeAutoRequestPayout(
          client,
          {
            phaseId: phase.id
          },
          ctx as any
        );

        if (!canBeRequest) {
          throw new GraphQLError('Phase must be funded');
        }
      });
    } catch (e) {
      error = e;
      Test.Check.error(e, new GraphQLError('Phase must be funded'));
    } finally {
      assert(error !== null, 'Must be error.');
    }
  });

  it('phase fund request not approved', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const phase = _.find(outputData.phases, { name: PhaseName.NotApproved });
    if (!phase) throw GraphQLError.notFound('phase');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: proUser
        };

        const canBeRequest = await canBeAutoRequestPayout(
          client,
          {
            phaseId: phase.id
          },
          ctx as any
        );

        if (!canBeRequest) {
          throw new GraphQLError('Phase request charge not approved.');
        }
      });
    } catch (e) {
      error = e;
      Test.Check.error(e, new GraphQLError('Phase request charge not approved.'));
    } finally {
      assert(error !== null, 'Must be error.');
    }
  });

  it('phase fund not requested', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const phase = _.find(outputData.phases, { name: PhaseName.NotRequested });
    if (!phase) throw GraphQLError.notFound('phase');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: proUser
        };

        const canBeRequest = await canBeAutoRequestPayout(
          client,
          {
            phaseId: phase.id
          },
          ctx as any
        );

        if (!canBeRequest) {
          throw new GraphQLError('Phase fund not requested');
        }
      });
    } catch (e) {
      error = e;
      Test.Check.error(e, new GraphQLError('Phase fund not requested'));
    } finally {
      assert(error !== null, 'Must be error.');
    }
  });

  it('phase not auto requested', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const phase = _.find(outputData.phases, { name: PhaseName.NotAutoRequest });
    if (!phase) throw GraphQLError.notFound('phase');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: proUser
        };

        const canBeRequest = await canBeAutoRequestPayout(
          client,
          {
            phaseId: phase.id
          },
          ctx as any
        );

        if (!canBeRequest) {
          throw new GraphQLError('Payout not auto requested.');
        }
      });
    } catch (e) {
      error = e;
      Test.Check.error(e, new GraphQLError('Payout not auto requested.'));
    } finally {
      assert(error !== null, 'Must be error.');
    }
  });

  it(`phase not found`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const phase = _.find(outputData.phases, { name: PhaseName.ToRequest });
    if (!phase) throw GraphQLError.notFound('phase');

    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: homeUser
        };

        await canBeAutoRequestPayout(client, { phaseId: phase.contractId }, ctx as any);
      });
    } catch (e) {
      Test.Check.error(e, GraphQLError.notFound('phase'));
    }
  });
});
