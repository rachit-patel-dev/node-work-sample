import * as assert from 'assert';
import { execQuery } from '../../../../index';

const LOGIN_MUTATION = `mutation ($email: String!, $password: String!) {
  login(email: $email, password: $password) {
    token
    user {
      id
    }
  }
}`;

describe('gql/resolvers/Mutation/login', () => {
  it('should allow to login with existing user', async () => {
    const { data, errors } = await execQuery(LOGIN_MUTATION, { email: 'default@test.com', password: 'password' }, null);

    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.login.token, 'token must be present');
    assert.equal(data!.login.user.id, '0281c17b-8460-4221-843f-546cd0268b46');
  });

  it('should return error if password is not correct', async () => {
    const { data, errors } = await execQuery(
      LOGIN_MUTATION,
      { email: 'default@test.com', password: 'random-string' },
      null
    );

    assert.ok(errors, 'it should return errors');
    assert.ok(!data, 'there should be no data');
  });
});
