import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { ContractStatus } from '../../../../../db/types/contract';

const ACCEPT_ESTIMATE_MUTATION = `mutation ($contractId: ID!, $esign: EsignInput!) {
  acceptEstimate(contractId: $contractId, esign: $esign) {
    id
    status
    esign {
      signature
    }
    startedAt
  }
}`;

describe('gql/resolvers/Mutation/acceptEstimate', () => {
  it('should not allow to accept estimate with wrong password', async () => {
    const roleId = '1db5cb80-60b1-4d87-a497-a003b58817d0';
    const currentUser = await getCurrentUser('for-update@test.com', roleId);
    const { data, errors } = await execQuery(
      ACCEPT_ESTIMATE_MUTATION,
      {
        contractId: 'fcb125c6-b7dd-4897-92f5-1b9cc2b95d2c',
        esign: {
          signature: 'wrong',
          password: 'okie'
        }
      },
      currentUser
    );

    assert.ok(errors, 'there should be errors');
    assert.ok(!data, 'there should be no data');
  });

  it('should allow to accept estimate', async () => {
    const roleId = '1db5cb80-60b1-4d87-a497-a003b58817d0';
    const currentUser = await getCurrentUser('for-update@test.com', roleId);
    const signature = 'works';
    const { data, errors } = await execQuery(
      ACCEPT_ESTIMATE_MUTATION,
      {
        contractId: 'fcb125c6-b7dd-4897-92f5-1b9cc2b95d2c',
        esign: {
          signature,
          password: 'password'
        }
      },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.acceptEstimate.status, ContractStatus.Hired);
    assert.equal(data!.acceptEstimate.esign.signature, signature);
    assert.ok(data!.acceptEstimate.startedAt, 'there should be startedAt date');
  });
});
