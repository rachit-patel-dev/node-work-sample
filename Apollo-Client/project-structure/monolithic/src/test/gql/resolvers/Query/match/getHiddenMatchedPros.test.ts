import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const GET_HIDDEN_MATCHED_PROS_QUERY = `query ($projectId: ID!) {
  getHiddenMatchedPros(projectId: $projectId) {
    id
  }
}`;

describe('gql/resolvers/Query/getHiddenMatchedPros', () => {
  it('should allow to get hidden matched pros', async () => {
    const currentUser = await getCurrentUser('for-update@test.com', '1db5cb80-60b1-4d87-a497-a003b58817d0');
    const projectId = 'a4c1172f-e66e-4392-8d2e-531759f26b07';

    const { data, errors } = await execQuery(GET_HIDDEN_MATCHED_PROS_QUERY, { projectId }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.getHiddenMatchedPros[0].id, 'fa3d2aee-fb21-4dc6-8512-aab474dc5165');
  });
});
