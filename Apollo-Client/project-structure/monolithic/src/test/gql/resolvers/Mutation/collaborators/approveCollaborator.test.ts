import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const APPROVE_COLLABORATOR_MUTATION = `mutation ($collaboratorId: ID!) {
  approveCollaborator(collaboratorId: $collaboratorId) {
    id
    approvedBy {
      id
    }
  }
}`;

describe('gql/resolvers/Mutation/approveCollaborator', () => {
  it('should allow to approve collaborator', async () => {
    const roleId = 'fa3d2aee-fb21-4dc6-8512-aab474dc5165';
    const currentUser = await getCurrentUser('for-update@test.com', roleId);
    const collaboratorId = '78bdac83-d88f-4bce-9ed1-47ccdcb38408';
    const { data, errors } = await execQuery(APPROVE_COLLABORATOR_MUTATION, { collaboratorId }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.approveCollaborator.id, collaboratorId);
    assert.equal(data!.approveCollaborator.approvedBy.id, roleId);
  });
});
