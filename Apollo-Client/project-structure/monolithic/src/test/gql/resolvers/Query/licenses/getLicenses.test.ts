import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const GET_LICENSES_QUERY = `query {
  getLicenses {
    id
  }
}`;

describe('gql/resolvers/Query/getLicenses', () => {
  it('should allow to get my licenses', async () => {
    const currentUser = await getCurrentUser('for-get@test.com', '36debf90-5b75-4794-adb0-ccfd26a88a32');
    const { data, errors } = await execQuery(GET_LICENSES_QUERY, {}, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.getLicenses[0].id, 'c83a24e7-bbcb-4baa-b2ea-123a5b984fdf');
  });
});
