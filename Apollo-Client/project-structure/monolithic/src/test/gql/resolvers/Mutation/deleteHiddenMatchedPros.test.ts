import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../..';

const DELETE_HIDDEN_MATCHED_PROS_MUTATION = `mutation ($projectId: ID!, $pros: [ID!]!) {
  deleteHiddenMatchedPros(projectId: $projectId, pros: $pros) {
    id
  }
}`;

describe('gql/resolvers/Mutation/deleteHiddenMatchedPros', () => {
  it('should allow to delete previously hidden matched pro', async () => {
    const currentUser = await getCurrentUser(
      'for-update@test.com',
      '1db5cb80-60b1-4d87-a497-a003b58817d0'
    );
    const pros = ['fa3d2aee-fb21-4dc6-8512-aab474dc5165'];
    const projectId = '608f1bcf-c990-47a1-8e92-1141a4276745';

    const { data, errors } = await execQuery(
      DELETE_HIDDEN_MATCHED_PROS_MUTATION,
      { projectId, pros },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.equal(
      data!.deleteHiddenMatchedPros[0].id,
      '513d56e7-1fcb-4536-a6ee-00f65391797e'
    );
  });
});
