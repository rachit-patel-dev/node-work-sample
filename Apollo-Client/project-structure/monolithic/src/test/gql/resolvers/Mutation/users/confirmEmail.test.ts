import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import * as jwt from '../../../../../auth/jwt';
import { config } from '../../../../../config';

const CONFIRM_EMAIL_MUTATION = `mutation ($token: String!) {
  confirmEmail(token: $token)
}`;

describe('gql/resolvers/Mutation/confirmEmail', () => {
  it('it should allow to confirm email', async () => {
    const currentUser = await getCurrentUser('for-update@test.com');
    const token = jwt.sign(
      {
        id: '0749619e-0c68-44c8-8fbc-ce0dd629dd08',
        email: 'for-update@test.com'
      },
      config.secrets.jwtSecret,
      { claims: { sub: 'email' } }
    );
    const { data, errors } = await execQuery(CONFIRM_EMAIL_MUTATION, { token }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.confirmEmail, 'it should return true');
  });
});
