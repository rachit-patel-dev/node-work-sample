import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { CollaboratorPermission } from '../../../../../db/types/collaborator';
import { UserRole } from '../../../../../db/types/role';

const ADD_COLLABORATOR_MUTATION = `mutation (
  $contractId: ID!,
  $email: String!,
  $role: UserRole!
) {
  addCollaborator(contractId: $contractId, email: $email, role: $role) {
    permissions
    email
    userRole
    invitedBy {
      id
    }
    contract {
      id
    }
    role {
      id
    }
    approvedBy {
      id
    }
  }
}`;

describe('gql/resolvers/Mutation/addCollaborator', () => {
  it('should allow to add existing user', async () => {
    const roleId = 'b79207c2-9db1-47f8-9f8d-5e06b170f413';
    const currentUser = await getCurrentUser('for-create@test.com', roleId);
    const contractId = '797cab2a-3776-492b-b04e-726ea405d90f';
    const { data, errors } = await execQuery(
      ADD_COLLABORATOR_MUTATION,
      {
        contractId,
        email: 'add-collaborator@test.com',
        role: UserRole.HomeOwner
      },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.addCollaborator.email, 'add-collaborator@test.com');
    assert.equal(data!.addCollaborator.userRole, UserRole.HomeOwner);
    assert.equal(data!.addCollaborator.permissions, CollaboratorPermission.Read);
    assert.equal(data!.addCollaborator.invitedBy.id, roleId);
    assert.equal(data!.addCollaborator.contract.id, contractId);
    assert.equal(data!.addCollaborator.role.id, 'bd1c521f-9e47-4c78-a8bc-7881b5a03ae8');
    assert.equal(data!.addCollaborator.approvedBy.id, roleId);
  });

  it('should allow to add non-existing user', async () => {
    const roleId = '184ac629-1755-4f6d-aa6d-8558ae90d5da';
    const currentUser = await getCurrentUser('for-create@test.com', roleId);
    const contractId = '797cab2a-3776-492b-b04e-726ea405d90f';
    const email = 'add-collaborator-not-exists@test.com';
    const role = UserRole.HomeOwner;
    const { data, errors } = await execQuery(ADD_COLLABORATOR_MUTATION, { contractId, email, role }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.addCollaborator.role, null);
    assert.equal(data!.addCollaborator.approvedBy, null);
    assert.equal(data!.addCollaborator.email, email);
    assert.equal(data!.addCollaborator.userRole, role);
  });
});
