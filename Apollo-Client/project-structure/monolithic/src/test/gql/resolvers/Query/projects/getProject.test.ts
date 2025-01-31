import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const GET_PROJECT_QUERY = `query ($projectId: ID!) {
  getProject(projectId: $projectId) {
    id
  }
}`;

describe('gql/resolvers/Query/getProject', () => {
  it('should allow to get my project', async () => {
    const currentUser = await getCurrentUser('for-get@test.com', 'c9caf642-6cbf-4371-a97e-ca756339eaaa');
    const projectId = 'afaff0ea-54d2-4abc-8947-9f005a465270';
    const { errors, data } = await execQuery(GET_PROJECT_QUERY, { projectId }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.getProject.id, projectId);
  });

  it("should not allow to get someone's else project", async () => {
    const currentUser = await getCurrentUser('for-create@test.com', 'b79207c2-9db1-47f8-9f8d-5e06b170f413');
    const projectId = 'afaff0ea-54d2-4abc-8947-9f005a465270';
    const { errors, data } = await execQuery(GET_PROJECT_QUERY, { projectId }, currentUser);

    assert.ok(errors, 'there should be an error');
    assert.ok(!data, 'there should be no data');
  });
});
