/*external modules*/
import _ from 'lodash';
import assert from 'assert';
/*DB*/
import { getClientTransaction, sql } from '../../../../../../db';
import { UserRole } from '../../../../../../db/types/role';
import {
  requiredOwnerData,
  requiredProData
} from '../../../../../../db/types/project';
/*models*/
import { UserModel } from '../../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../../..';
import { GraphQLError } from '../../../../../../gql';
import { UserWithToken } from '../../../../../../gql/resolvers/UserWithToken';
/*other*/
import { Test } from '../../../../../helpers/Test';

type TQuery = { register: UserWithToken };

enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Other = 'other@test.com'
}

const requiredFieldSet: Test.TFieldSet<UserWithToken> = {
  scalar: ['token'],
  object: ['user'],
  array: []
};

const REGISTER_MUTATION = `mutation ($email: String!, $password: String!, $role: UserRole!, $data: JSON!) {
  register(email: $email, password: $password, role: $role, data: $data) {
      token

      user {
        email
        lastRole {
          name
          data
        }
      }
  }
}`;

describe('gql/resolvers/Mutation/auth/basic/register', () => {
  const inputData = {
    users: [
      {
        email: Email.Other,
        role: {
          name: UserRole.Pro
        }
      }
    ],
    pro: {
      email: Email.Pro,
      password: 'test',
      role: UserRole.Pro,
      data: {
        proType: ['Architect'],
        specialties: ['EntertainmentAudioVisual']
      }
    },
    home: {
      email: Email.Home,
      password: 'test',
      role: UserRole.HomeOwner,
      data: {
        area: '1501To2000',
        type: 'AdditionExpansion',
        budget: '100kTo500',
        mindset: 'HaveSomeIdeas',
        duration: '11m',
        priority: {
          cost: 2,
          time: 3,
          design: 1
        },
        readiness: 'After3m',
        scopeMain: ['StorageRoom']
      }
    }
  };

  before(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      await Promise.all(
        _.map(inputData.users, async userData => {
          const userGenerate = new Test.UserGenerate(client, ctx);

          await userGenerate.create({ email: userData.email });
          await userGenerate.setRole({ name: userData.role.name });

          return userGenerate.user!;
        })
      );
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      await Promise.all(
        _.map(Object.values(Email), async userEmail => {
          const user = await UserModel.findByEmail.exec(
            client,
            {
              email: userEmail
            },
            ctx
          );
          if (!user) return;

          return UserModel.remove.exec(
            client,
            {
              userId: user.id
            },
            ctx
          );
        })
      );
    });
  });

  // success
  it('should allow to register Pro', async () => {
    const { data, errors } = await execQuery<TQuery>(
      REGISTER_MUTATION,
      inputData.pro,
      undefined
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.register;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        user: {
          email: _.get(inputData, ['pro', 'email']),
          'lastRole.name': _.get(inputData, ['pro', 'role'])
        }
      },
      requiredFieldSet
    );

    const roleData = result.user?.lastRole?.data;
    assert(
      _.isEqual(roleData, inputData.pro.data),
      'Invalid saved Pro answers.'
    );
  });

  it('should allow to register Owner', async () => {
    const { data, errors } = await execQuery<TQuery>(
      REGISTER_MUTATION,
      inputData.home,
      undefined
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.register;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        user: {
          email: _.get(inputData, ['home', 'email']),
          'lastRole.name': _.get(inputData, ['home', 'role'])
        }
      },
      requiredFieldSet
    );

    const roleData = result.user?.lastRole?.data;
    assert(
      _.isEqual(roleData, inputData.home.data),
      'Invalid saved Owner answers.'
    );
  });

  // error
  it('email already use', async () => {
    const { errors } = await execQuery<TQuery>(
      REGISTER_MUTATION,
      {
        ...inputData.home,
        email: Email.Other
      },
      undefined
    );

    Test.Check.error(
      errors,
      new GraphQLError(
        'The email you typed is already in use. Please type a different email or login with correct password.'
      )
    );
  });

  it('missing required Owner fields', async () => {
    const { errors } = await execQuery<TQuery>(
      REGISTER_MUTATION,
      {
        ...inputData.home,
        data: {}
      },
      undefined
    );

    Test.Check.error(
      errors,
      new GraphQLError(
        `Missing required fields. (${requiredOwnerData.join(', ')})`
      )
    );
  });

  it('missing required Pro fields', async () => {
    const { errors } = await execQuery<TQuery>(
      REGISTER_MUTATION,
      {
        ...inputData.pro,
        data: {}
      },
      undefined
    );

    Test.Check.error(
      errors,
      new GraphQLError(
        `Missing required fields. (${requiredProData.join(', ')})`
      )
    );
  });
});
