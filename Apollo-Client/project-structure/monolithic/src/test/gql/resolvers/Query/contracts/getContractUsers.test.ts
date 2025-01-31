import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { CollaboratorPermission } from '../../../../../db/types/collaborator';
import { UserRole } from '../../../../../db/types/role';

const GET_CONTRACTS_USERS_QUERY = `query (
  $contractId: ID!,
  $role: UserRole,
  $permissions: CollaboratorPermission
) {
  getContractUsers(contractId: $contractId, role: $role, permissions: $permissions) {
    id
  }
}`;

describe('gql/resolvers/Query/getContractUsers', () => {
  it('should allow to get contract users', async () => {
    const currentUser = await getCurrentUser('for-get@test.com', 'c9caf642-6cbf-4371-a97e-ca756339eaaa');
    const { data, errors } = await execQuery(
      GET_CONTRACTS_USERS_QUERY,
      {
        contractId: '9a5b0bf3-b985-438d-a0eb-a033adb2b925',
        role: UserRole.Pro,
        permissions: CollaboratorPermission.Write
      },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.getContractUsers[0].id, '36debf90-5b75-4794-adb0-ccfd26a88a32');
  });
});
