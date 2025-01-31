import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { CollaboratorPermission } from '../../../../../db/types/collaborator';

const UPDATE_COLLABORATOR_MUTATION = `mutation ($collaboratorId: ID!, $permissions: CollaboratorPermission!) {
  updateCollaborator(collaboratorId: $collaboratorId, permissions: $permissions) {
    id
    permissions
  }
}`;

describe('gql/resolvers/Mutation/updateCollaborator', () => {
  it('should allow to update collaborator', async () => {
    const currentUser = await getCurrentUser('for-update@test.com', 'fa3d2aee-fb21-4dc6-8512-aab474dc5165');
    const collaboratorId = '2e9bf81b-908d-48fa-be04-9ed6514fb106';
    const permissions = CollaboratorPermission.Write;
    const { data, errors } = await execQuery(
      UPDATE_COLLABORATOR_MUTATION,
      { collaboratorId, permissions },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.updateCollaborator.id, collaboratorId);
    assert.equal(data!.updateCollaborator.permissions, permissions);
  });
});
