import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../../index';
import { verify } from '../../../../../../auth/jwt';
import { config } from '../../../../../../config';

const UPDATE_USER_PASSWORD_MUTATION = `mutation ($oldPassword: String, $newPassword: String!) {
  updateUserPassword(oldPassword: $oldPassword, newPassword: $newPassword) {
    token
    user {
      hasPassword
    }
  }
}`;

type JwtPayload = { id: string; jwtVersion: number };

describe('gql/resolvers/Mutation/auth/basic/updatePassword', () => {
  it('should allow to update old password', async () => {
    const currentUser = await getCurrentUser('update-old-password@test.com');
    const { data, errors } = await execQuery(
      UPDATE_USER_PASSWORD_MUTATION,
      { oldPassword: 'password', newPassword: 'password10' },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    const payload = verify<JwtPayload>(data!.updateUserPassword.token, config.secrets.jwtSecret);
    assert.equal(payload.jwtVersion, currentUser.jwtVersion + 1);
    assert.equal(data!.updateUserPassword.user.hasPassword, true);
  });

  it('should allow to set password', async () => {
    const currentUser = await getCurrentUser('set-new-password@test.com');
    const { data, errors } = await execQuery(UPDATE_USER_PASSWORD_MUTATION, { newPassword: 'password' }, currentUser);

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    const payload = verify<JwtPayload>(data!.updateUserPassword.token, config.secrets.jwtSecret);
    assert.equal(payload.jwtVersion, currentUser.jwtVersion + 1);
    assert.equal(data!.updateUserPassword.user.hasPassword, true);
  });
});
