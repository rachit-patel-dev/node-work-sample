import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const GET_CHANGE_ORDER_QUERY = `query ($changeOrderId: ID!) {
  getChangeOrder(changeOrderId: $changeOrderId) {
    id
  }
}`;

describe('gql/resolvers/Query/getChangeOrder', () => {
  it('should allow to get change order', async () => {
    const currentUser = await getCurrentUser('for-get@test.com', '36debf90-5b75-4794-adb0-ccfd26a88a32');
    const changeOrderId = 'f388686f-5c23-4e1b-9707-6e90d6cdc717';
    const { data, errors } = await execQuery(GET_CHANGE_ORDER_QUERY, { changeOrderId }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.getChangeOrder.id, changeOrderId);
  });
});
