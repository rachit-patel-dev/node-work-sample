import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const COPY_ESTIMATE_MUTATION = `mutation ($fromContractId: ID!, $toContractId: ID!, $newStartDate: DateTime!) {
  copyEstimate(fromContractId: $fromContractId, toContractId: $toContractId, newStartDate: $newStartDate) {
    id
  }
}`;

describe('gql/resolvers/Mutation/copeEstimate', () => {
  it('should allow to copy estimate', async () => {
    const roleId = 'fa3d2aee-fb21-4dc6-8512-aab474dc5165';
    const currentUser = await getCurrentUser('for-update@test.com', roleId);
    const toContractId = '5fefe8c2-b14a-4c87-808c-3dda663528bc';
    const fromContractId = '1eca5468-cfdf-4a00-81d1-42f863e49a8c';

    const { data, errors } = await execQuery<{ copyEstimate: { id: string } }>(
      COPY_ESTIMATE_MUTATION,
      {
        fromContractId: fromContractId,
        toContractId: toContractId,
        newStartDate: new Date()
      },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors:' + JSON.stringify(errors));
    assert.ok(data!.copyEstimate.id, 'id must be present');
    assert.equal(
      data!.copyEstimate.id,
      toContractId,
      'returned id should be equal to a contract id we copy estimates to.'
    );
  });
});
