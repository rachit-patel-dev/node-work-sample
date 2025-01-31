import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../..';

const HIDE_MATCHED_PROS_MUTATION = `mutation ($projectId: ID!, $pros: [ID!]!) {
  hideMatchedPros(projectId: $projectId, pros: $pros) {
    id
    partner {
      id
    }
    score
  }
}`;

describe('gql/resolvers/Mutation/hideMatchedPros', () => {
  it('should allow to hide matched pros', async () => {
    const currentUser = await getCurrentUser(
      'for-update@test.com',
      '1db5cb80-60b1-4d87-a497-a003b58817d0'
    );
    const pros = ['fa3d2aee-fb21-4dc6-8512-aab474dc5165'];
    const projectId = '888ddadd-b03f-40c3-a01d-8ac548d41f0f';

    const { data, errors } = await execQuery(
      HIDE_MATCHED_PROS_MUTATION,
      { projectId, pros },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.hideMatchedPros);
  });
});
