import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { ContractActivityType } from '../../../../../db/types/contractActivity';

const GET_CONTRACT_ACTIVITIES_QUERY = `query ($contractId: ID!) {
  getContractActivities(contractId: $contractId) {
    id
    type
    role {
      id
    }
    contract {
      id
    }
  }
}`;

describe('gql/resolvers/Query/getContractActivities', () => {
  it('should allow to get contract activities', async () => {
    const currentUser = await getCurrentUser('for-get@test.com', 'c9caf642-6cbf-4371-a97e-ca756339eaaa');
    const contractId = '9a5b0bf3-b985-438d-a0eb-a033adb2b925';
    const { data, errors } = await execQuery(GET_CONTRACT_ACTIVITIES_QUERY, { contractId }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.getContractActivities.length, 1);
    const activity = data!.getContractActivities[0];
    assert.equal(activity.id, '917049d8-f3dc-4c23-a204-b12cc81641ef');
    assert.equal(activity.type, ContractActivityType.ContractStarted);
    assert.equal(activity.role.id, 'c9caf642-6cbf-4371-a97e-ca756339eaaa');
    assert.equal(activity.contract.id, contractId);
  });
});
