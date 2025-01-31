import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const GET_TEAMS_QUERY = `query {
  getTeams {
    id
    name
    description
    createdAt
    updatedAt
    owner {
      id
    }
    members {
      id
    }
  }
}`;

describe('gql/resolvers/Query/getTeams', () => {
  it('should allow to get teams', async () => {
    const currentUser = await getCurrentUser('for-get@test.com', '36debf90-5b75-4794-adb0-ccfd26a88a32');
    const { data, errors } = await execQuery(GET_TEAMS_QUERY, {}, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.getTeams[0].id, '082c6942-be22-4b6b-8acf-54fcfa770f86');
    assert.equal(data!.getTeams[0].members.length, 0);
    assert.equal(data!.getTeams[1].id, 'af046793-fbc1-4fc5-a007-33f28645b363');
    assert.equal(data!.getTeams[1].members.length, 1);
  });
});
