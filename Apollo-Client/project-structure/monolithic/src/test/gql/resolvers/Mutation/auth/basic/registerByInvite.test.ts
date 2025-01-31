import * as assert from 'assert';
import { execQuery } from '../../../../index';
import { InviteUserInput } from '../../../../../../gql/resolvers/InviteUserInput';

const REGISTER_BY_INVITE_MUTATION = `mutation (
  $key: String!,
  $input: InviteUserInput!
) {
  registerByInvite(key: $key, input: $input) {
    token
    user {
      email
      emailConfirmed
    }
  }
}`;

describe('gql/resolvers/Mutation/auth/basic/registerByInvite', () => {
  it('should allow to register by invite', async () => {
    const input: InviteUserInput = {
      firstName: 'Invite',
      lastName: 'Pro',
      phone: '111111111111',
      password: 'go'
    };
    const { data, errors } = await execQuery(
      REGISTER_BY_INVITE_MUTATION,
      { key: 'registerByInviteSecret', input },
      null
    );

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    assert.ok(data!.registerByInvite.token, 'token must exists');
    assert.equal(data!.registerByInvite.user.email, 'register-by-invite@test.com');
    assert.ok(data!.registerByInvite.user.emailConfirmed, 'email must be confirmed');
  });
});
