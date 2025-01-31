import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const ADMING_GET_CONTRACTS_QUERY = `query ($limit: Int, $page: Int) {
  adminGetContracts(limit: $limit, page: $page) {
    contracts {
      id
    }
    pagination {
      total
    }
  }
}`;

describe('gql/resolvers/Query/adminGetContracts', () => {
  it('should allow to get contracts for admin', async () => {
    const currentUser = await getCurrentUser('admin@test.com', '1f24a50c-20ee-4191-b2cb-9d0a74db32c5');
    const { data, errors } = await execQuery(ADMING_GET_CONTRACTS_QUERY, {}, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.adminGetContracts.contracts.length > 0);
    assert.ok(data!.adminGetContracts.pagination.total > 0);
  });
});
