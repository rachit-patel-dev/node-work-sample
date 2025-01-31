import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const DELETE_TEAM_MUTATION = `mutation deleteTeam($teamId: ID!) {
  deleteTeam(teamId: $teamId)
}`;

describe('gql/resolvers/Mutation/deleteTeam', () => {
  it('should allow to delete team', async () => {
    const currentUser = await getCurrentUser('for-delete@test.com', '513d56e7-1fcb-4536-a6ee-00f65391797e');
    const { errors, data } = await execQuery<{ deleteTeam: boolean }>(
      DELETE_TEAM_MUTATION,
      { teamId: '6c8ee5f8-9e50-4311-bca2-9aa111936d1b' },
      currentUser
    );

    assert.ok(!errors, JSON.stringify(errors));
    assert.ok(data!.deleteTeam, 'should allow to delete team');
  });
});
