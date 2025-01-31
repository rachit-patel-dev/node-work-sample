import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { Project } from '../../../../../gql/resolvers/Project';

const GET_PROJECTS_QUERY = `query {
  getProjects {
    id
  }
}`;

describe('gql/resolvers/Query/getProjects', () => {
  it('should allow get my projects', async () => {
    const currentUser = await getCurrentUser('for-get@test.com', 'c9caf642-6cbf-4371-a97e-ca756339eaaa');
    const { data, errors } = await execQuery<{ getProjects: Project[] }>(GET_PROJECTS_QUERY, {}, currentUser);

    assert.ok(!errors, JSON.stringify(errors));
    const project = data!.getProjects.find((project: Project) => project.id === 'afaff0ea-54d2-4abc-8947-9f005a465270');
    assert.ok(project, JSON.stringify(data!.getProjects));
  });
});
