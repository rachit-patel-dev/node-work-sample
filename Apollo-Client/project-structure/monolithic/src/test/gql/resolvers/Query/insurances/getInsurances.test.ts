import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const GET_INSURANCES_QUERY = `query {
  getInsurances {
    id
  }
}`;

describe('gql/resolvers/Query/getInsurances', () => {
  it('should allow to get my insurances', async () => {
    const roleId = '36debf90-5b75-4794-adb0-ccfd26a88a32';
    const currentUser = await getCurrentUser('for-get@test.com', roleId);
    const { data, errors } = await execQuery(GET_INSURANCES_QUERY, {}, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.getInsurances[0].id, '9ebf1de9-19b3-490d-b1b4-466d2fd8036a');
  });
});
