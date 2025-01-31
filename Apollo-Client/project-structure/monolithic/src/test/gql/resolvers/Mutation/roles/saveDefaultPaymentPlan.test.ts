/*external modules*/
import _ from 'lodash';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Contract, ContractPaymentPlan } from '../../../../../db/types/contract';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { Role } from '../../../../../gql/resolvers/Role';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { saveDefaultPaymentPlan: Role };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}

const enum ContractName {
  PaymentPlan = 'PaymentPlan'
}

interface OutputData {
  users: Test.TUser[];
  contract: Contract;
}

const requiredFieldSet: Test.TFieldSet<Role> = {
  scalar: ['id', 'name', 'userId', 'discount', 'showInMatch', 'hideInMatch'],
  object: [],
  array: []
};

const SAVE_DEFAULT_PAYMENT_PLAN_MUTATION = `mutation($plan: ContractPaymentPlan!) {
  saveDefaultPaymentPlan(plan: $plan) {
    id
    name
    userId
    discount
    showInMatch
    hideInMatch

    defaultPaymentPlan
  }
}`;

describe('gql/resolvers/Mutation/roles/saveDefaultPaymentPlan', () => {
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
      name: ContractName.PaymentPlan
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
        name: ContractName.PaymentPlan
      });
      if (!contract) throw GraphQLError.notFound('contract');

      return {
        users,
        contract
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
  it('should allow to set default payment plan', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('user');

    const { data, errors } = await execQuery<TQuery>(
      SAVE_DEFAULT_PAYMENT_PLAN_MUTATION,
      {
        plan: ContractPaymentPlan.MonthlySubscription
      },
      proUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.saveDefaultPaymentPlan;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        id: proUser.lastRoleId,
        userId: proUser.id,
        defaultPaymentPlan: ContractPaymentPlan.MonthlySubscription
      },
      requiredFieldSet
    );
  });

  // error
  it('role must be only Pro', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      SAVE_DEFAULT_PAYMENT_PLAN_MUTATION,
      {
        plan: ContractPaymentPlan.Transaction
      },
      {
        ...homeUser
      }
    );

    Test.Check.error(errors, GraphQLError.forbidden());
  });

  it('role not found', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      SAVE_DEFAULT_PAYMENT_PLAN_MUTATION,
      {
        plan: ContractPaymentPlan.Transaction
      },
      {
        ...otherUser,
        lastRoleId: otherUser.id
      }
    );

    Test.Check.error(errors, GraphQLError.notFound('role'));
  });
});
