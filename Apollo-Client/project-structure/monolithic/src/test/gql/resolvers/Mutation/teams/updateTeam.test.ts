import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { TeamInput } from '../../../../../gql/resolvers/TeamInput';
import { Team } from '../../../../../gql/resolvers/Team';

const UPDATE_TEAM_MUTATION = `mutation ($teamId: ID!, $input: TeamInput!) {
  updateTeam(teamId: $teamId, input: $input) {
    id
    name
  }
}`;

describe('gql/resolvers/Mutation/updateTeam', () => {
  it('should allow to update existing team', async () => {
    const currentUser = await getCurrentUser('for-update@test.com', '1db5cb80-60b1-4d87-a497-a003b58817d0');
    const teamId = '711db4e0-17c6-4cf2-8e42-774de2151f80';
    const input: TeamInput = { name: 'renamed' };
    const { errors, data } = await execQuery<{ updateTeam: Team }>(
      UPDATE_TEAM_MUTATION,
      { teamId, input },
      currentUser
    );

    assert.ok(!errors, JSON.stringify(errors));
    assert.equal(data!.updateTeam.id, teamId);
    assert.equal(data!.updateTeam.name, input.name);
  });
});
