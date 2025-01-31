import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const DELETE_PROJECT_MUTATION = `mutation ($projectId: ID!) {
  deleteProject(projectId: $projectId)
}`;

describe('gql/resolvers/Mutation/deleteProject', () => {
  it('should allow to delete project', async () => {
    const projectId = 'db5e305f-f52b-4a60-96d9-4621ebed1ff8';
    const currentUser = await getCurrentUser('for-delete-project@test.com', 'bc4372ff-fc79-49d1-af38-dd51394d3d99');

    const { errors, data } = await execQuery<{ deleteProject: boolean }>(
      DELETE_PROJECT_MUTATION,
      { projectId },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    assert.equal(data!.deleteProject, true);
  });
});
