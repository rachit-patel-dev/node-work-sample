import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../../index';
import { redis } from '../../../../../../db/redis';
import * as argon2 from 'argon2';

const RESET_PASSWORD_MUTATION = `mutation ($token: String!, $password: String!) {
  resetPassword(token: $token, password: $password) {
    token
    user {
      id
    }
  }
}`;

describe('gql/resolvers/Mutation/auth/basic/resetPassword', () => {
  it('should allow to reset password', async () => {
    const currentUser = await getCurrentUser('reset-password@test.com');
    const token = 'fake-token';
    await redis.set(`reset-password:${token}`, currentUser.id);
    const password = 'yolo1234';
    const { data, errors } = await execQuery(RESET_PASSWORD_MUTATION, {
      token,
      password
    });

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    assert.ok(data!.resetPassword.token);

    const updatedUser = await getCurrentUser(currentUser.email);
    assert.equal(currentUser.jwtVersion + 1, updatedUser.jwtVersion);
    assert.ok(await argon2.verify(updatedUser.password!, password));
  });
});
