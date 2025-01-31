/*external modules*/
import _ from 'lodash';
import async from 'async';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { PaymentOperation, PaymentOperationStatus } from '../../../../../db/types/paymentOperation';
import { TaskStatus } from '../../../../../db/types/task';
import { Collaborator, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { Contract, ContractPermissionResult } from '../../../../../db/types/contract';
import { getTaskTotal } from '../../../../../db/dataUtils/getTaskTotal';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
import { PaymentOperationModel } from '../../../../../db/models/PaymentOperationModel';
/*GQL*/
import { execQuery } from '../../../index';
import { GraphQLError } from '../../../../../gql';
import { Payment } from '../../../../../gql/resolvers/Payment';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { retryFailedCharges: Payment[] };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  Retry = 'Retry'
}

type PopulatedPayment = Payment & { charge: PaymentOperation; payout?: PaymentOperation };

interface OutputData {
  users: Test.TUser[];
  collaborators: Collaborator[];
  phase: Test.TPhase;
  contract: Contract;
  payments: PopulatedPayment[];
}

const requiredFieldSet: Test.TFieldSet<Payment> = {
  scalar: ['id', 'chargeId'],
  object: ['charge', 'task'],
  array: ['comments', 'files']
};

const RETRY_FAILED_CHARGES_MUTATION = `mutation ($payments: [ID!]!) {
  retryFailedCharges(payments: $payments) {
    id
    chargeId
    payoutRequestedAt

    charge {
      id
      ownerError
      proError
      retries
      status
      autoRetryOn
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
  }
}`;

describe('gql/resolvers/Mutation/retryFailedCharge', () => {
  it.skip('is same "gql/resolvers/Mutation/retryFailedCharges"', () => {});
});

describe('gql/resolvers/Mutation/retryFailedCharges', () => {
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
      name: ContractName.Retry
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
        status: TaskStatus.Done,
        payment: {
          payoutRequestedAt: new Date(),
          charge: {
            availableAt: new Date(),
            status: PaymentOperationStatus.Failed
          }
        }
      }
    ]
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

      const collaboratorUserFullPro = _.find(users, {
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.Pro
      });
      if (!collaboratorUserFullPro) throw GraphQLError.notFound('collaborator full pro');

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
        name: ContractName.Retry
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
      await async.each(inputData.tasks, async taskInput => {
        await phaseGenerate.addTask({
          creatorId: proUser.lastRoleId,
          ...taskInput
        });

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
      });

      const phase = phaseGenerate.phase!;
      if (_.isEmpty(phase.tasks)) throw GraphQLError.notFound('tasks');

      const payments = _.map(phase.tasks, 'payment');

      return {
        users,
        phase,
        collaborators,
        payments,
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

  //success
  it('should allow to retry failed charges', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const { data, errors } = await execQuery<TQuery>(
      RETRY_FAILED_CHARGES_MUTATION,
      {
        payments: _.map(outputData.payments, 'id')
      },
      homeUser
    );

    Test.Check.noErrors(errors);

    const result = data?.retryFailedCharges;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        charge: {
          ownerError: null,
          proError: null,
          retries: 0,
          status: PaymentOperationStatus.Failed,
          autoRetryOn: null
        },
        task: {
          id: _.get(_.last(outputData.phase!.tasks), ['id'])
        }
      },
      requiredFieldSet
    );
  });

  // error
  describe('', () => {
    const ctx = { sql, events: [] };

    let homeUser: Test.TUser | undefined;
    let payments: PopulatedPayment[] | undefined;

    before(async () => {
      homeUser = _.find(outputData.users, { email: Email.Home });
      payments = _.get(outputData, 'payments');

      await getClient(async client => {
        await async.each(payments!, async payment => {
          await PaymentOperationModel.update.exec(
            client,
            {
              id: _.get(payment, ['charge', 'id']),
              status: PaymentOperationStatus.Succeeded
            },
            ctx
          );
        });
      });
    });

    after(async () => {
      await getClient(async client => {
        await async.each(payments!, async payment => {
          await PaymentOperationModel.update.exec(
            client,
            {
              id: _.get(payment, ['charge', 'id']),
              status: _.get(payment, ['charge', 'status'])
            },
            ctx
          );
        });
      });
    });

    it('cannot retry charge that are not failed', async () => {
      const { errors } = await execQuery<TQuery>(
        RETRY_FAILED_CHARGES_MUTATION,
        {
          payments: _.map(payments, 'id')
        },
        homeUser
      );

      Test.Check.error(errors, new GraphQLError(`You cannot retry charge that are not failed`));
    });
  });

  it('only full home owner have access', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });

    const { errors } = await execQuery<TQuery>(
      RETRY_FAILED_CHARGES_MUTATION,
      {
        payments: _.map(outputData.payments, 'id')
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.BadRole, 403));
  });

  it(`payments not found`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const { errors } = await execQuery<TQuery>(
      RETRY_FAILED_CHARGES_MUTATION,
      {
        payments: [_.get(homeUser, 'id')]
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('payments'));
  });
});
