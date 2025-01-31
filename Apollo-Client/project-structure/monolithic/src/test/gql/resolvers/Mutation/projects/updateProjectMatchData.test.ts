import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const UPDATE_PROJECT_MATCH_DATA_MUTATION = `mutation ($projectId: ID!, $matchData: JSON!) {
  updateProjectMatchData(projectId: $projectId, matchData: $matchData) {
    id
    matchData
  }
}`;

describe('gql/resolvers/Mutation/updateProjectMatchData', () => {
  it('should allow to update the project', async () => {
    const currentUser = await getCurrentUser('for-update@test.com', '1db5cb80-60b1-4d87-a497-a003b58817d0');
    const projectId = '888ddadd-b03f-40c3-a01d-8ac548d41f0f';
    const matchData = { updated: true };

    const { errors, data } = await execQuery(UPDATE_PROJECT_MATCH_DATA_MUTATION, { projectId, matchData }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.updateProjectMatchData.id, projectId);
    assert.deepStrictEqual(data!.updateProjectMatchData.matchData, matchData);
  });

  it('should not allow to update the project you are not owner of', async () => {
    const currentUser = await getCurrentUser('for-create@test.com', 'b79207c2-9db1-47f8-9f8d-5e06b170f413');
    const projectId = '888ddadd-b03f-40c3-a01d-8ac548d41f0f';
    const matchData = { updated: true };

    const { errors, data } = await execQuery(UPDATE_PROJECT_MATCH_DATA_MUTATION, { projectId, matchData }, currentUser);

    assert.ok(errors, 'there should be errors');
    assert.ok(!data, 'there should be no data');
  });
});
