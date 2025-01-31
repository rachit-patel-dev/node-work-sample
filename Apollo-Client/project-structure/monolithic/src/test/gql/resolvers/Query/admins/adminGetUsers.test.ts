import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { User } from '../../../../../db/types/user';
import { UserRole } from '../../../../../db/types/role';

const ADMIN_GET_USERS_QUERY = `query (
  $limit: Int,
  $page: Int,
  $query: String,
  $role: UserRole!,
  $sortBy: String,
  $sortDirection: SortDirection
) {
  adminGetUsers(
    limit: $limit,
    page: $page,
    query: $query,
    role: $role
    sortBy: $sortBy,
    sortDirection: $sortDirection
  ) {
    roles {
      id
      name

      user {
        email
      }
    }
    pagination {
      total
    }
  }
}`;

describe('gql/resolvers/Query/adminGetUsers', () => {
  let currentUser: User;
  before(async () => {
    currentUser = await getCurrentUser('admin@test.com', '1f24a50c-20ee-4191-b2cb-9d0a74db32c5');
  });

  it('should allow to get pros', async () => {
    const { data, errors } = await execQuery(
      ADMIN_GET_USERS_QUERY,
      {
        role: UserRole.Pro
      },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.adminGetUsers.pagination.total > 0);
    assert.equal(data!.adminGetUsers.roles[0].name, UserRole.Pro);
  });

  it('should allow to query by email', async () => {
    const query = 'for-update';
    const { data, errors } = await execQuery(
      ADMIN_GET_USERS_QUERY,
      {
        role: UserRole.HomeOwner,
        query,
        sortBy: 'lastSeenAt',
        sortDirection: 'Desc'
      },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.adminGetUsers.roles.length > 0);
    assert.ok(data!.adminGetUsers.roles[0].user.email.includes(query));
  });
});
