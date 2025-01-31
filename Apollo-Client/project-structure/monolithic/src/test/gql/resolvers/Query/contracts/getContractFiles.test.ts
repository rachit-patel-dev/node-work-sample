import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const GET_CONTRACT_FILES = `query ($contractId: ID!) {
  getContractFiles(contractId: $contractId) {
    id
  }
}`;

describe('gql/resolvers/Query/getContract/Files', () => {
  it('it should allow to get my contract files', async () => {
    const currentUser = await getCurrentUser('for-get@test.com', 'c9caf642-6cbf-4371-a97e-ca756339eaaa');
    const { data, errors } = await execQuery(
      GET_CONTRACT_FILES,
      { contractId: '9a5b0bf3-b985-438d-a0eb-a033adb2b925' },
      currentUser
    );

    assert.ok(!errors, 'there are no errors');
    assert.equal(data!.getContractFiles[0].id, '1b3557b9-cf7b-4a2a-a3e0-775ca3183838');
  });
});
