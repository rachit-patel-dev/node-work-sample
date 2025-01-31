import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const GET_MATCH_QUERY = `query ($projectId: ID!) {
  getMatch(projectId: $projectId) {
    partner {
      id
    }
    score
  }
}`;

describe('gql/resolvers/Query/getMatch', () => {
  it('should return all pros', async () => {
    const currentUser = await getCurrentUser('for-get@test.com', 'c9caf642-6cbf-4371-a97e-ca756339eaaa');
    const projectId = 'afaff0ea-54d2-4abc-8947-9f005a465270';
    const { data, errors } = await execQuery(GET_MATCH_QUERY, { projectId }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.getMatch.length > 0, 'there should be results');
  });
});
