import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { Collaborator } from '../../../../../db/types/collaborator';

const ADD_TEAM_MEMBER_COLLABORATORS_MUTATION = `mutation ($contractId: ID!, $teamMembersIds: [ID!]!) {
  addTeamMemberCollaborators(contractId: $contractId, teamMembersIds: $teamMembersIds) {
    id
    roleId
    contractId
  }
}`;

describe('gql/resolvers/Mutation/addTeamMemberCollaborators', () => {
  it('should allow to add collaborators from the team', async () => {
    const currentUser = await getCurrentUser('for-create@test.com', '184ac629-1755-4f6d-aa6d-8558ae90d5da');
    const contractId = 'dd5c7e18-9202-4133-adbe-6237bc85d86c';
    const teamMembersIds = ['d18d1b1e-4584-478a-a44f-57686ab2caac'];
    const { errors, data } = await execQuery<{
      addTeamMemberCollaborators: Collaborator[];
    }>(ADD_TEAM_MEMBER_COLLABORATORS_MUTATION, { contractId, teamMembersIds }, currentUser);

    assert.ok(!errors, JSON.stringify(errors));
    assert.equal(teamMembersIds.length, data!.addTeamMemberCollaborators.length);
    for (const collaborator of data!.addTeamMemberCollaborators) {
      assert.equal(contractId, collaborator.contractId);
    }
  });
});
