import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../../index';

const DELETE_TEAM_MEMBER_MUTATION = `mutation ($teamMemberId: ID!) {
  deleteTeamMember(teamMemberId: $teamMemberId)
}`;

describe('gql/resolvers/Mutation/deleteTeamMember', () => {
  it('should allow to delete team member', async () => {
    const currentUser = await getCurrentUser('for-delete@test.com', '513d56e7-1fcb-4536-a6ee-00f65391797e');
    const { errors, data } = await execQuery<{ deleteTeamMember: boolean }>(
      DELETE_TEAM_MEMBER_MUTATION,
      { teamMemberId: 'dea1a448-1867-410e-90e6-3fd7acd69b27' },
      currentUser
    );

    assert.ok(!errors, JSON.stringify(data));
    assert.ok(data!.deleteTeamMember, 'should be true');
  });
});
