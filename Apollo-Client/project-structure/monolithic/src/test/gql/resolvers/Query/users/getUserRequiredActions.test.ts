/*external modules*/
import _ from 'lodash';
import async from 'async';
import assert from 'assert';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { PaymentOperationStatus } from '../../../../../db/types/paymentOperation';
import { TaskStatus } from '../../../../../db/types/task';
import { Contract } from '../../../../../db/types/contract';
import { ChangeOrder, ChangeOrderReason, ChangeOrderStatus } from '../../../../../db/types/changeOrder';
import { getTaskTotal } from '../../../../../db/dataUtils/getTaskTotal';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../../index';
import { GraphQLError } from '../../../../../gql';
import { Payment } from '../../../../../gql/resolvers/Payment';
import { UserRequiredActions } from '../../../../../gql/resolvers/UserRequiredActions';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { getUserRequiredActions: UserRequiredActions };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  Action = 'Action'
}

interface OutputData {
  users: Test.TUser[];
  contract: Contract;
  payments: Payment[];
  changeOrders: ChangeOrder[];
}

const requiredFieldSet: Test.TFieldSet<UserRequiredActions> = {
  array: ['changeOrders', 'payments']
};

const GET_USER_REQUIRED_ACTIONS_QUERY = `query ($contractId: ID!) {
  getUserRequiredActions(contractId: $contractId) {
    changeOrders {
      id
      no
      contractId
      status
      reason
      requesterId
    }
    payments {
      id
      chargeId
    }
  }
}`;

describe(`gql/resolvers/Query/getUserRequiredActions`, () => {
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
      }
    ],
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.Action,
      changeOrders: [
        {
          requester: Email.Home,
          status: ChangeOrderStatus.Open,
          reason: ChangeOrderReason.Descope,
          approvedAt: new Date()
        },
        {
          requester: Email.Pro,
          status: ChangeOrderStatus.Pending,
          reason: ChangeOrderReason.Upgrade,
          approvedAt: new Date()
        }
      ]
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
        name: ContractName.Action
      });
      if (!contract) throw GraphQLError.notFound('contract');

      const changeOrders: ChangeOrder[] = await async.map(inputData.contract.changeOrders, async inputCO => {
        const requester = _.find(users, { email: inputCO.requester });
        if (!requester) throw GraphQLError.notFound('requester');

        const changeOrderGenerate = new Test.ChangeOrderGenerate(client, ctx);
        await changeOrderGenerate.create({
          contractId: contract.id,
          requesterId: requester.lastRoleId,
          ...inputCO
        });

        return changeOrderGenerate.changeOrder!;
      });

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
        contract,
        payments,
        changeOrders
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
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
  it('should allow home user to get user required actions', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const { data, errors } = await execQuery<TQuery>(
      GET_USER_REQUIRED_ACTIONS_QUERY,
      {
        contractId: _.get(outputData, ['contract', 'id'])
      },
      homeUser
    );

    Test.Check.noErrors(errors);

    const result = data?.getUserRequiredActions;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.requiredFields(requiredFieldSet, result);

    const payments = _.get(result, 'payments');
    const changeOrders = _.get(result, 'changeOrders');

    Test.Check.data(payments, (payment: Payment) => {
      const foundedPayment = _.find(outputData.payments, { id: payment.id });
      if (!foundedPayment) throw GraphQLError.notFound(`payment by id: "${payment.id}"`);

      return _.pick(foundedPayment, ['chargeId']);
    });

    Test.Check.data(changeOrders, (changeOrder: ChangeOrder) => {
      if (changeOrder.status !== ChangeOrderStatus.Open) {
        throw new GraphQLError(`changeOrder by id: "${changeOrder.id}" must have status "Open"`);
      }

      const foundedChangeOrder = _.find(outputData.changeOrders, { id: changeOrder.id });
      if (!foundedChangeOrder) throw GraphQLError.notFound(`change order by id: "${changeOrder.id}"`);

      return _.pick(foundedChangeOrder, ['no', 'contractId', 'status', 'reason']);
    });
  });

  it('should allow pro user to get user required actions', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    const { data, errors } = await execQuery<TQuery>(
      GET_USER_REQUIRED_ACTIONS_QUERY,
      {
        contractId: _.get(outputData, ['contract', 'id'])
      },
      proUser
    );

    Test.Check.noErrors(errors);

    const result = data?.getUserRequiredActions;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.requiredFields(requiredFieldSet, result);

    const payments = _.get(result, 'payments');
    const changeOrders = _.get(result, 'changeOrders');

    assert.deepEqual(payments, [], 'payments for pro user must be empty');

    Test.Check.data(changeOrders, (changeOrder: ChangeOrder) => {
      if (changeOrder.status !== ChangeOrderStatus.Pending) {
        throw new GraphQLError(`changeOrder by id: "${changeOrder.id}" must have status "Pending"`);
      }

      const foundedChangeOrder = _.find(outputData.changeOrders, { id: changeOrder.id });
      if (!foundedChangeOrder) throw GraphQLError.notFound(`change order by id: "${changeOrder.id}"`);

      return {
        ..._.pick(foundedChangeOrder, ['no', 'contractId', 'status', 'reason']),
        requesterId: _.get(proUser, 'lastRoleId')
      };
    });
  });

  it(`should allow other user to get user required actions`, async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });

    const { data, errors } = await execQuery<TQuery>(
      GET_USER_REQUIRED_ACTIONS_QUERY,
      {
        contractId: _.get(outputData, ['contract', 'id'])
      },
      otherUser
    );

    Test.Check.noErrors(errors);

    const result = data?.getUserRequiredActions;
    if (!result) throw GraphQLError.notFound('data');

    assert.deepEqual(result.changeOrders, [], 'changeOrders for other user must be empty');
    assert.deepEqual(result.payments, [], 'payments for other user must be empty');
  });
});
