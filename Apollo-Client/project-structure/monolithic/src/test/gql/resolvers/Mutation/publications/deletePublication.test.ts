import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const DELETE_PUBLICATION_MUTATION = `mutation ($publicationId: ID!) {
  deletePublication(publicationId: $publicationId)
}`;

describe('gql/resolvers/Mutation/deletePublication', () => {
  it('should allow to delete my publication', async () => {
    const currentUser = await getCurrentUser('for-delete@test.com', '513d56e7-1fcb-4536-a6ee-00f65391797e');
    const { data, errors } = await execQuery(
      DELETE_PUBLICATION_MUTATION,
      { publicationId: 'f551791e-1a08-43b0-9343-86ab06b2f98c' },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.deletePublication, 'it should return true');
  });
});
