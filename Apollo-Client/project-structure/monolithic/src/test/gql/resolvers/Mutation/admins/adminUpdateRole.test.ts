import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const ADMIN_UPDATE_ROLE_MUTATION = `mutation (
  $roleId: ID!,
  $hideInMatch: Boolean!,
  $discount: Boolean!
) {
  adminUpdateRole(roleId: $roleId, hideInMatch: $hideInMatch, discount: $discount) {
    id
    hideInMatch
    discount
  }
}`;

describe('gql/resolvers/Mutation/adminUpdateRole', () => {
  it('should allow admin to update role', async () => {
    const currentUser = await getCurrentUser('admin@test.com', '1f24a50c-20ee-4191-b2cb-9d0a74db32c5');
    const roleId = '36debf90-5b75-4794-adb0-ccfd26a88a32';
    const discount = true;
    const hideInMatch = true;
    const { data, errors } = await execQuery(
      ADMIN_UPDATE_ROLE_MUTATION,
      { roleId, discount, hideInMatch },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.adminUpdateRole.id, roleId);
    assert.equal(data!.adminUpdateRole.discount, discount);
    assert.equal(data!.adminUpdateRole.hideInMatch, hideInMatch);
  });
});
