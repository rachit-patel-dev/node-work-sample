import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const CREATE_PROJECT_MUTATION = `mutation ($matchData: JSON!) {
  createProject(matchData: $matchData) {
    id
    ownerId
    matchData
  }
}`;

describe('gql/resolvers/Mutation/createProject', () => {
  it('should allow to create project', async () => {
    const roleId = '184ac629-1755-4f6d-aa6d-8558ae90d5da';
    const currentUser = await getCurrentUser('for-create@test.com', roleId);
    const matchData = { scope: 'something' };

    const { errors, data } = await execQuery(CREATE_PROJECT_MUTATION, { matchData }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.createProject.id);
    assert.equal(data!.createProject.ownerId, roleId);
    assert.deepStrictEqual(data!.createProject.matchData, matchData);
  });
});
