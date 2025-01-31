import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { ChangeOrderStatus } from '../../../../../db/types/changeOrder';

const APPROVE_CHANGE_ORDER_MUTATION = `mutation ($changeOrderId: ID!, $esign: EsignInput!) {
  approveChangeOrder(changeOrderId: $changeOrderId, esign: $esign) {
    status
    approvedAt
    esign {
      roleId
      signature
    }

    tasksVersions {
      name
      phase {
        id
      }
      files {
        id
      }

      task {
        name
        phase {
          id
        }
        files {
          id
        }
      }
    }
  }
}`;

describe('gql/resolvers/Mutation/approveChangeOrder', () => {
  it('should allow to approve change order', async () => {
    const roleId = '1db5cb80-60b1-4d87-a497-a003b58817d0';
    const currentUser = await getCurrentUser('for-update@test.com', roleId);
    const signature = 'Home Owner';
    const { data, errors } = await execQuery(
      APPROVE_CHANGE_ORDER_MUTATION,
      {
        changeOrderId: '2094ade1-2389-4bdf-b7e2-01e5a13fac2b',
        esign: {
          signature,
          password: 'password'
        }
      },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.approveChangeOrder.status, ChangeOrderStatus.Approved);
    assert.ok(data!.approveChangeOrder.approvedAt, 'approved date must be present');
    assert.equal(data!.approveChangeOrder.esign.roleId, roleId);
    assert.equal(data!.approveChangeOrder.esign.signature, signature);
    assert.equal(data!.approveChangeOrder.tasksVersions.length, 2);

    for (const taskVersion of data!.approveChangeOrder.tasksVersions) {
      assert.equal(taskVersion.name, taskVersion.task.name);
      assert.equal(taskVersion.phase.id, taskVersion.task.phase.id);
      assert.deepStrictEqual(taskVersion.files, taskVersion.task.files);
    }
  });
});
