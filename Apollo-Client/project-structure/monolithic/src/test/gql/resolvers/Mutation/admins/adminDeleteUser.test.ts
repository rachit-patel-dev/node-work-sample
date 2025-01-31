import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const ADMIN_DELETE_USER_MUTATION = `mutation($userId: ID!) {
  adminDeleteUser(userId: $userId)
}`;

describe('gql/resolvers/Mutation/adminDeleteUser', () => {
  it('should allow to delete user', async () => {
    const currentUser = await getCurrentUser('admin@test.com', '1f24a50c-20ee-4191-b2cb-9d0a74db32c5');
    const userId = 'd62c781e-3973-4dc6-b190-62ecbab496a7';

    const { errors, data } = await execQuery<{ adminDeleteUser: boolean }>(
      ADMIN_DELETE_USER_MUTATION,
      { userId },
      currentUser
    );

    assert.ok(!errors, JSON.stringify(errors));
    assert.ok(data!.adminDeleteUser, 'it should return true');
  });
});
