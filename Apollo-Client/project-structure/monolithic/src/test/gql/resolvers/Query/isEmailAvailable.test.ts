import * as assert from 'assert';
import { execQuery } from '../..';

const IS_EMAIL_AVAILABLE_QUERY = `query ($email: String!) {
  isEmailAvailable(email: $email)
}`;

describe('gql/resolvers/Query/isEmailAvailable', () => {
  it('should allow to check email', async () => {
    let result = await execQuery(IS_EMAIL_AVAILABLE_QUERY, {
      email: 'for-get@test.com'
    });

    assert.ok(!result.errors, 'there should be no errors');
    assert.equal(result.data!.isEmailAvailable, false);

    result = await execQuery(IS_EMAIL_AVAILABLE_QUERY, {
      email: 'available@test.com'
    });

    assert.ok(!result.errors, 'there should be no errors');
    assert.equal(result.data!.isEmailAvailable, true);
  });
});
