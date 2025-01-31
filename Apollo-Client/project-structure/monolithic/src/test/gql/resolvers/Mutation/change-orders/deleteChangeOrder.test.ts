import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const DELETE_CHANGE_ORDER_MUTATION = `mutation ($changeOrderId: ID!) {
  deleteChangeOrder(changeOrderId: $changeOrderId)
}`;

describe('gql/resolvers/Mutation/deleteChangeOrder', () => {
  it('should allow to delete change order', async () => {
    const currentUser = await getCurrentUser('for-delete@test.com', '513d56e7-1fcb-4536-a6ee-00f65391797e');
    const { data, errors } = await execQuery(
      DELETE_CHANGE_ORDER_MUTATION,
      { changeOrderId: 'c8b7cf28-271e-43fd-b287-5494c2155c62' },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.deleteChangeOrder, true);
  });
});
