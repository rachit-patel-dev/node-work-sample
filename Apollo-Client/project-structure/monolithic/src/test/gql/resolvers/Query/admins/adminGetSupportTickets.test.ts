import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const ADMIN_GET_SUPPORT_TICKETS_QUERY = `query ($limit: Int, $page: Int) {
  adminGetSupportTickets(limit: $limit, page: $page) {
    tickets {
      id
    }
    pagination {
      total
    }
  }
}`;

describe('gql/resolvers/Query/adminGetSupportTickets', () => {
  it('should allow to get support tickets', async () => {
    const currentUser = await getCurrentUser('admin@test.com', '1f24a50c-20ee-4191-b2cb-9d0a74db32c5');
    const { data, errors } = await execQuery(ADMIN_GET_SUPPORT_TICKETS_QUERY, {}, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.adminGetSupportTickets.tickets.length > 0);
    assert.ok(data!.adminGetSupportTickets.pagination.total > 0);
  });
});
