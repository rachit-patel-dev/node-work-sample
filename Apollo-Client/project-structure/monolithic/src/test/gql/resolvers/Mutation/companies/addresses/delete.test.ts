import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../..';

const DELETE_COMPANY_ADDRESS_MUTATION = `mutation ($addressId: ID!) {
  deleteAddress(addressId: $addressId)
}`;

describe('gql/resolvers/Mutation/companies/addresses/delete', () => {
  it('should allow to delete my company address', async () => {
    const currentUser = await getCurrentUser(
      'for-delete@test.com',
      'fa3d2aee-fb21-4dc6-8512-aab474dc5165'
    );
    const addressId = 'fa3d2aee-fb21-4dc6-8512-aab474dc5154';
    const { errors, data } = await execQuery(
      DELETE_COMPANY_ADDRESS_MUTATION,
      { addressId },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    assert.ok(data!.deleteAddress, 'it should return true');
  });
});
