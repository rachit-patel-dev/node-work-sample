import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../..';

const ADD_USERS_TO_PROJECT_MUTATION = `mutation ($projectId: ID!, $partners: [ID!]!, $message: String!) {
  addUsersToProject(projectId: $projectId, partners: $partners, message: $message) {
    id
    contracts {
      partnerId
      workingDays {
        mon
      }
    }
  }
}`;

describe('gql/resolvers/Mutation/projects/addPros', () => {
  it('should allow to add user to project', async () => {
    const currentUser = await getCurrentUser(
      'for-update@test.com',
      '1db5cb80-60b1-4d87-a497-a003b58817d0'
    );
    const projectId = 'a4c1172f-e66e-4392-8d2e-531759f26b07';
    const partners = ['fa3d2aee-fb21-4dc6-8512-aab474dc5165'];
    const message = 'Hello';

    const { data, errors } = await execQuery(
      ADD_USERS_TO_PROJECT_MUTATION,
      { projectId, partners, message },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.addUsersToProject.id, projectId);
    assert.ok(
      data!.addUsersToProject.contracts[0].workingDays.mon,
      'it should be true'
    );
    assert.equal(data!.addUsersToProject.contracts[0].partnerId, partners[0]);
  });
});
