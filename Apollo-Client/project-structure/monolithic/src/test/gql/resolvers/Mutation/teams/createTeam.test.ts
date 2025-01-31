import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { TeamInput } from '../../../../../gql/resolvers/TeamInput';

const CREATE_TEAM_MUTATION = `mutation ($input: TeamInput!) {
  createTeam(input: $input) {
    id
    name
    description
    owner {
      id
    }
    members {
      id
    }
  }
}`;

describe('gql/resolvers/Mutation/createTeam', () => {
  it('should allow to create team', async () => {
    const roleId = '184ac629-1755-4f6d-aa6d-8558ae90d5da';
    const currentUser = await getCurrentUser('for-create@test.com', roleId);
    const input: TeamInput = {
      name: 'New team by pro',
      description: 'Testing createTeam mutation'
    };
    const { data, errors } = await execQuery(CREATE_TEAM_MUTATION, { input }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.createTeam.id, 'id must be present');
    assert.equal(data!.createTeam.name, input.name);
    assert.equal(data!.createTeam.description, input.description);
    assert.equal(data!.createTeam.owner.id, roleId);
    assert.equal(data!.createTeam.members.length, 0);
  });
});
