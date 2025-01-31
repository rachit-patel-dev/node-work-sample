import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const GET_CONTRACT_QUERY = `query ($contractId: ID!) {
  getContract(contractId: $contractId) {
    id
  }
}`;

describe('gql/resolvers/Query/getContract', () => {
  it('should allow to get my project', async () => {
    const currentUser = await getCurrentUser('for-get@test.com', 'c9caf642-6cbf-4371-a97e-ca756339eaaa');
    const contractId = '9a5b0bf3-b985-438d-a0eb-a033adb2b925';
    const { data, errors } = await execQuery(GET_CONTRACT_QUERY, { contractId }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.getContract.id, contractId);
  });
});
