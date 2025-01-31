import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { Contract } from '../../../../../gql/resolvers/Types/Contract';

const GET_CONTRACTS_QUERY = `query {
  getContracts {
    id
  }
}`;

describe('gql/resolvers/Query/getContracts', () => {
  it('should allow to get my contracts', async () => {
    const currentUser = await getCurrentUser('for-get@test.com', '36debf90-5b75-4794-adb0-ccfd26a88a32');
    const { data, errors } = await execQuery<{ getContracts: Contract[] }>(GET_CONTRACTS_QUERY, {}, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.getContracts.some((contract: Contract) => contract.id === '9a5b0bf3-b985-438d-a0eb-a033adb2b925'));
  });
});
