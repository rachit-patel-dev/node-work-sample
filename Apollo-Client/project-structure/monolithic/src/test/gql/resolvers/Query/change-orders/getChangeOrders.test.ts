import * as assert from 'assert';
import { getCurrentUser, execQuery } from '../../../index';

const GET_CHANGE_ORDERS = `query ($contractId: ID!, $statuses: [ChangeOrderStatus!]) {
  getChangeOrders(contractId: $contractId, statuses: $statuses) {
    id
    status

    tasksVersions {
      id
    }
  }
}`;

describe('gql/resolvers/Query/getChangeOrders', () => {
  it('should allow to get change orders', async () => {
    const currentUser = await getCurrentUser('for-get@test.com', '36debf90-5b75-4794-adb0-ccfd26a88a32');
    const { data, errors } = await execQuery(
      GET_CHANGE_ORDERS,
      {
        contractId: '9a5b0bf3-b985-438d-a0eb-a033adb2b925',
        statuses: ['Open']
      },
      currentUser
    );

    assert.ok(!errors, JSON.stringify(errors));
    assert.equal(data!.getChangeOrders[0].id, 'f388686f-5c23-4e1b-9707-6e90d6cdc717');
    assert.equal(data!.getChangeOrders[0].tasksVersions[0].id, 'c74edd33-0558-453b-9038-de00b36f540e');
  });
});
