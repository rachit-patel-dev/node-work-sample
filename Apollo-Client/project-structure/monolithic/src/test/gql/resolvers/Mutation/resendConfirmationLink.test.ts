import * as assert from 'assert';
import { execQuery } from '../..';

const RESEND_CONFIRMATION_LINK_MUTATION = `mutation {
  resendConfirmationLink
}`;

describe('gql/resolvers/Mutation/resendConfirmationLink', () => {
  it('should allow to resend confirmation link', async () => {
    const { data, errors } = await execQuery(
      RESEND_CONFIRMATION_LINK_MUTATION,
      {}
    );

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.resendConfirmationLink, true);
  });
});
