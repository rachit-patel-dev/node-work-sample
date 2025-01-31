/*external modules*/
import * as argon2 from 'argon2';
import _ from 'lodash';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Contract } from '../../../../../db/types/contract';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { getStripeDashboardUrl: string };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Other = 'other@test.com'
}

const enum ContractName {
  Stripe = 'Stripe'
}

interface OutputData {
  users: Test.TUser[];
  contract: Contract;
}

const GET_STRIPE_DASHBOARD_URL_QUERY = `query($password: String) {
  getStripeDashboardUrl(password: $password)
}`;

describe('gql/resolvers/Query/stripes/getDashboardUrl', () => {
  let outputData: OutputData;

  const inputData = {
    users: [
      {
        email: Email.Home,
        password: Email.Home,
        role: {
          name: UserRole.HomeOwner,
          stripeId: 'acct_1HjNjzHHPtbfILag'
        }
      },
      {
        email: Email.Pro,
        password: Email.Pro,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.Other,
        password: Email.Other,
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
      name: ContractName.Stripe
    }
  };

  before(async () => {
    const ctx = { sql, events: [] };
    outputData = await getClientTransaction(async client => {
      const users = await Promise.all(
        _.map(inputData.users, async userData => {
          const userGenerate = new Test.UserGenerate(client, ctx);

          await userGenerate.create({
            email: userData.email,
            password: await argon2.hash(userData.password)
          });
          await userGenerate.setRole({
            name: userData.role.name,
            stripeId: userData.role.stripeId
          });

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
        name: ContractName.Stripe
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
  it('should allow to get dashboard url', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('user');

    const { data, errors } = await execQuery<TQuery>(
      GET_STRIPE_DASHBOARD_URL_QUERY,
      {
        password: Email.Home
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.getStripeDashboardUrl;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      {
        getStripeDashboardUrl: [result]
      },
      {
        getStripeDashboardUrl: {
          $check: 'every',
          $value: (value: string) => value.startsWith('https://connect.stripe.com/express/')
        }
      }
    );
  });

  // error
  it('stripe not connected', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      GET_STRIPE_DASHBOARD_URL_QUERY,
      {
        password: Email.Other
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError('Stripe is not connected to this account yet'));
  });

  it('user password must be valid', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      GET_STRIPE_DASHBOARD_URL_QUERY,
      {
        password: '1234'
      },
      otherUser
    );

    Test.Check.error(errors, GraphQLError.unauthorized());
  });

  it('user password required', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      GET_STRIPE_DASHBOARD_URL_QUERY,
      {
        password: undefined
      },
      otherUser
    );

    Test.Check.error(errors, GraphQLError.unauthorized());
  });

  it('user not found', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      GET_STRIPE_DASHBOARD_URL_QUERY,
      {
        password: '12345'
      },
      {
        ...otherUser,
        id: otherUser.lastRoleId
      }
    );

    Test.Check.error(errors, GraphQLError.notFound('user'));
  });
});
