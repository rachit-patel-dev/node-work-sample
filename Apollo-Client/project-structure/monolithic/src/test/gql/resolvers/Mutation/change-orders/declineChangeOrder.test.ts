import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { ChangeOrderStatus } from '../../../../../db/types/changeOrder';

const DECLINE_CHANGE_ORDER_MUTATION = `mutation (
  $changeOrderId: ID!,
  $reason: ChangeOrderDeclineReason!,
  $message: String
) {
  declineChangeOrder(changeOrderId: $changeOrderId, reason: $reason, message: $message) {
    status
    comments {
      subject
      text
      role {
        id
      }
    }
  }
}`;

describe('gql/resolvers/Mutation/declineChangeOrder', () => {
  it('should allow to decline change order', async () => {
    const roleId = '1db5cb80-60b1-4d87-a497-a003b58817d0';
    const currentUser = await getCurrentUser('for-update@test.com', roleId);
    const message = 'just for test';
    const { errors, data } = await execQuery(
      DECLINE_CHANGE_ORDER_MUTATION,
      {
        changeOrderId: '4f88883d-84a6-4057-955d-7458a61f0833',
        reason: ChangeOrderStatus.Deferred,
        message
      },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.declineChangeOrder.status, ChangeOrderStatus.Deferred);
    const comment = data!.declineChangeOrder.comments[0];
    assert.equal(comment.subject, ChangeOrderStatus.Deferred);
    assert.equal(comment.text, message);
    assert.equal(comment.role.id, roleId);
  });
});
