import * as assert from 'assert';
import { authenticator } from 'otplib';
import { execQuery, getCurrentUser } from '../../../../index';
import * as jwt from '../../../../../../auth/jwt';
import { config } from '../../../../../../config';

const RESET_PASSWORD_PROTECTED_MUTATION = `mutation (
  $token: String!,
  $oldPassword: String,
  $tfaCode: String,
  $recoveryCode: String
) {
  resetPasswordProtected(
    token: $token,
    oldPassword: $oldPassword,
    tfaCode: $tfaCode,
    recoveryCode: $recoveryCode
  ) {
    token
    user {
      id
      hasTfa
    }
  }
}`;

describe('gql/resolvers/Mutation/auth/tfa/resetPasswor', () => {
  const oldPassword = 'password';
  const tfaSecret = 'PA4GE6KMNE3XKMBVK54E44CCORYEM4LY';

  function genToken(userId: string) {
    return jwt.sign({ user: userId, password: 'newpassword', jwtVersion: 0 }, config.secrets.jwtSecret, {
      claims: { sub: 'tfa-reset-password' }
    });
  }

  it('should allow to reset password with tfa code and old password', async () => {
    const currentUser = await getCurrentUser('for-2fa-code-reset@test.com');
    const { errors, data } = await execQuery(
      RESET_PASSWORD_PROTECTED_MUTATION,
      {
        token: genToken(currentUser.id),
        oldPassword,
        tfaCode: authenticator.generate(tfaSecret)
      },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    assert.equal(data!.resetPasswordProtected.user.hasTfa, true);
  });

  it('should allow to reset password with recovery code and old password', async () => {
    const currentUser = await getCurrentUser('for-2fa-recovery-code-password-reset@test.com');
    const { errors, data } = await execQuery(
      RESET_PASSWORD_PROTECTED_MUTATION,
      {
        token: genToken(currentUser.id),
        oldPassword,
        recoveryCode: 'be9b2b79b2b92b8f'
      },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    assert.equal(data!.resetPasswordProtected.user.hasTfa, true);
  });

  it('should allow to reset password with recovery code', async () => {
    const currentUser = await getCurrentUser('for-2fa-recovery-code-reset@test.com');
    const { errors, data } = await execQuery(
      RESET_PASSWORD_PROTECTED_MUTATION,
      {
        token: genToken(currentUser.id),
        recoveryCode: 'be9b2b79b2b92b8f'
      },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    assert.equal(data!.resetPasswordProtected.user.hasTfa, false);
  });
});
