import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { CollaboratorPermission } from '../../../../../db/types/collaborator';
import { Contract } from '../../../../../gql/resolvers/Types/Contract';

const GET_MANAGE_CONTRACTS_QUERY = `query {
  getManageContracts {
    id
    currentUserPermission
  }
}`;

describe('gql/resolvers/Query/getManageContracts', () => {
  it('should allow to get my contracts', async () => {
    const currentUser = await getCurrentUser('for-get@test.com', '36debf90-5b75-4794-adb0-ccfd26a88a32');
    const { data, errors } = await execQuery<{
      getManageContracts: Contract[];
    }>(GET_MANAGE_CONTRACTS_QUERY, {}, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.ok(
      data!.getManageContracts.some((contract: Contract) => contract.id === '9a5b0bf3-b985-438d-a0eb-a033adb2b925')
    );
    assert.equal(data!.getManageContracts[0].currentUserPermission, CollaboratorPermission.Full);
  });
});
