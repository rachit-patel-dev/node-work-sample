import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../../index';

const CREATE_CONTRACT_FILE_MUTATION = `mutation ($files: [ID!]!, $contractId: ID!) {
  createContractFiles(files: $files, contractId: $contractId) {
    id
    contract {
      id
    }
  }
}`;

describe('gql/resolvers/Mutation/createContractFile', () => {
  it('should allow to add file to contract', async () => {
    const currentUser = await getCurrentUser('for-update@test.com', '1db5cb80-60b1-4d87-a497-a003b58817d0');
    const contractId = '8e24afe7-192b-4e4e-8931-2fd54a801a26';
    const files = ['c7e505f6-4da3-42f0-82e8-70faa7a1555e'];
    const { data, errors } = await execQuery(CREATE_CONTRACT_FILE_MUTATION, { contractId, files }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.createContractFiles[0].id, files[0]);
    assert.equal(data!.createContractFiles[0].contract.id, contractId);
  });
});
