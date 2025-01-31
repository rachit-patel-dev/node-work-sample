import * as assert from 'assert';
import { execQuery } from '../../../../index';

const INIT_RESET_PASSWORD_MUTATION = `mutation ($email: String!) {
  initResetPassword(email: $email)
}`;

describe('gql/resolvers/Mutation/initResetPassword', () => {
  it('should allow to init password reset', async () => {
    const { data, errors } = await execQuery(
      INIT_RESET_PASSWORD_MUTATION,
      { email: 'update-old-password@test.com' },
      null
    );

    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.initResetPassword);
  });
});
