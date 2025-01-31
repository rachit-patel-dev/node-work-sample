/*external modules*/
import _ from 'lodash';
import async from 'async';
import moment from 'moment';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Payment } from '../../../../../gql/resolvers/Payment';
import { PaymentOperation, PaymentOperationStatus } from '../../../../../db/types/paymentOperation';
import { Task, TaskStatus } from '../../../../../db/types/task';
import { Collaborator, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { Contract, ContractPermissionResult } from '../../../../../db/types/contract';
import { getTaskTotal } from '../../../../../db/dataUtils/getTaskTotal';
import {
  PAYMENT_HISTORY_TABLE,
  PaymentHistoryAction,
  PaymentHistoryType
} from '../../../../../db/types/paymentHistory';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
import { PaymentModel } from '../../../../../db/models/PaymentModel';
/*GQL*/
import { execQuery } from '../../../index';
import { GraphQLError } from '../../../../../gql';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { releasePayouts: Payment[] };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  Payout = 'Payout'
}

type PopulatedPayment = Payment & { charge: PaymentOperation; payout?: PaymentOperation };

interface OutputData {
  users: Test.TUser[];
  collaborators: Collaborator[];
  phase: Test.TPhase;
  contract: Contract;
  payment: PopulatedPayment;
}

const requiredFieldSet: Test.TFieldSet<Payment> = {
  scalar: ['id', 'chargeId'],
  object: ['charge', 'task'],
  array: ['comments', 'files']
};
const RELEASE_PAYOUTS_MUTATION = `mutation ($payments: [ID!]!, $esign: EsignInput!) {
  releasePayouts(payments: $payments, esign: $esign) {
    id
    chargeId
    payoutRequestedAt
    approvedAt

    esignId

    charge {
      id
    }
    task {
      id
    }

    comments {
      id
    }
    files {
      id
    }
    history {
      id
      action
      type
      createdAt

      actionedBy {
        id
      }
      pro {
        id
      }
    }
  }
}`;

describe('gql/resolvers/Mutation/payments/releasePayout', () => {
  it.skip('is same "gql/resolvers/Mutation/releasePayouts"', () => {});
});

describe('gql/resolvers/Mutation/payments/releasePayouts', () => {
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
      name: ContractName.Payout
    },
    phase: {
      name: 'decision',
      order: 1000
    },
    tasks: [
      {
        name: 'task 1',
        materialCost: 100,
        laborCost: 100,
        otherCost: 100,
        markupPercent: 20,
        order: 500,
        status: TaskStatus.Done
      }
    ],
    charge: {
      availableAt: new Date(),
      status: PaymentOperationStatus.Succeeded
    },
    payment: {
      payoutRequestedAt: new Date()
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
        partnerId: proUser.lastRoleId
      });

      const project = projectGenerate.project!;

      const contract = _.find(project.contracts, {
        name: ContractName.Payout
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

      const phaseGenerate = new Test.PhaseGenerate(client, ctx);
      await phaseGenerate.create({
        contractId: contract.id,
        ...inputData.phase
      });
      await async.each(inputData.tasks, async task => {
        await phaseGenerate.addTask({
          creatorId: proUser.lastRoleId,
          ...task
        });
      });

      const phase = phaseGenerate.phase!;
      if (_.isEmpty(phase.tasks)) throw GraphQLError.notFound('tasks');

      const payments: Array<Payment & { charge: PaymentOperation; payout?: PaymentOperation }> = await async.map(
        phase.tasks!,
        async task => {
          const paymentGenerate = new Test.PaymentGenerate(client, ctx);
          await paymentGenerate.createCharge({
            amount: getTaskTotal(task as Task),
            stripeId: 'px_' + _.get(task, 'name'),
            ...inputData.charge
          });
          await paymentGenerate.createPayment(inputData.payment);

          const payment = paymentGenerate.payment;

          await phaseGenerate.updateTask({
            id: _.get(task, 'id'),
            paymentId: _.get(payment, 'id')
          });

          return {
            ...payment,
            charge: paymentGenerate.charge,
            payout: paymentGenerate.payout
          };
        }
      );

      return {
        users,
        phase,
        collaborators,
        contract,
        payment: payments[0]
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      await client.query(
        sql`
            DELETE
            FROM ${PAYMENT_HISTORY_TABLE}
            WHERE true
        `
      );

      // because of "violates foreign key constraint "esignId" on table "Payment""
      await PaymentModel.update.exec(
        client,
        {
          id: _.get(outputData, ['payment', 'id']),
          esignId: null
        },
        ctx
      );

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
  it('should allow to release payouts', async () => {
    const pro = _.find(outputData.users, { email: Email.Pro });

    const collaboratorUserFullHome = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });

    const { data, errors } = await execQuery<TQuery>(
      RELEASE_PAYOUTS_MUTATION,
      {
        payments: [_.get(outputData, ['payment', 'id'])],
        esign: {
          signature: 'pro'
        }
      },
      collaboratorUserFullHome
    );

    Test.Check.noErrors(errors);

    const result = data?.releasePayouts;
    if (!result) throw GraphQLError.notFound('data');

    requiredFieldSet.scalar!.push('esignId');

    Test.Check.data(
      result,
      {
        id: _.get(outputData, ['payment', 'id']),
        payoutRequestedAt: {
          $check: '===',
          $value: new Date(),
          $func: date => moment(date).format('YYYY.MM.DD HH')
        },
        approvedAt: {
          $check: '===',
          $value: new Date(),
          $func: date => moment(date).format('YYYY.MM.DD HH')
        },
        task: {
          id: _.get(_.first(outputData.phase!.tasks), ['id'])
        },
        history: {
          0: {
            action: PaymentHistoryAction.PayoutApproved,
            type: PaymentHistoryType.User,
            createdAt: {
              $check: '===',
              $value: new Date(),
              $func: (date: Date) => moment(date).format('YYYY.MM.DD HH:M')
            },
            actionedBy: {
              id: _.get(collaboratorUserFullHome, 'lastRoleId')
            },
            pro: {
              id: _.get(pro, 'lastRoleId')
            }
          }
        }
      },
      requiredFieldSet
    );
  });

  // error
  describe('', () => {
    const ctx = { sql, events: [] };

    let homeUser: Test.TUser | undefined;
    let payment: Payment | undefined;

    before(async () => {
      homeUser = _.find(outputData.users, { email: Email.Home });
      payment = _.get(outputData, 'payment');

      await getClient(async client => {
        await PaymentModel.update.exec(
          client,
          {
            id: _.get(payment, 'id')!,
            payoutId: _.get(payment, ['charge', 'id'])
          },
          ctx
        );
      });
    });

    after(async () => {
      await getClient(async client => {
        await PaymentModel.update.exec(
          client,
          {
            id: _.get(payment, 'id')!,
            payoutId: null
          },
          ctx
        );
      });
    });

    it('payout must not be released', async () => {
      const { errors } = await execQuery<TQuery>(
        RELEASE_PAYOUTS_MUTATION,
        {
          payments: [_.get(payment, 'id')],
          esign: {
            signature: 'home'
          }
        },
        homeUser
      );

      Test.Check.error(errors, new GraphQLError('Payout is released already'));
    });
  });

  describe('', () => {
    const ctx = { sql, events: [] };

    let homeUser: Test.TUser | undefined;
    let payment: Payment | undefined;

    before(async () => {
      homeUser = _.find(outputData.users, { email: Email.Home });
      payment = _.get(outputData, 'payment');

      await getClient(async client => {
        await PaymentModel.update.exec(
          client,
          {
            id: _.get(payment, 'id')!,
            payoutRequestedAt: null
          },
          ctx
        );
      });
    });

    after(async () => {
      await getClient(async client => {
        await PaymentModel.update.exec(
          client,
          {
            id: _.get(payment, 'id')!,
            payoutRequestedAt: payment?.payoutRequestedAt
          },
          ctx
        );
      });
    });

    it('payout must be requested', async () => {
      const { errors } = await execQuery<TQuery>(
        RELEASE_PAYOUTS_MUTATION,
        {
          payments: [_.get(payment, 'id')],
          esign: {
            signature: 'home'
          }
        },
        homeUser
      );

      Test.Check.error(errors, new GraphQLError('Payout is not requested yet'));
    });
  });

  it('only full home owner user have access', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });

    const { errors } = await execQuery<TQuery>(
      RELEASE_PAYOUTS_MUTATION,
      {
        payments: [_.get(outputData, ['payment', 'id'])],
        esign: {
          signature: 'pro'
        }
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.BadRole, 403));
  });

  it(`payments not found`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const { errors } = await execQuery<TQuery>(
      RELEASE_PAYOUTS_MUTATION,
      {
        payments: [_.get(homeUser, 'id')],
        esign: {
          signature: 'home'
        }
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('payments'));
  });
});
