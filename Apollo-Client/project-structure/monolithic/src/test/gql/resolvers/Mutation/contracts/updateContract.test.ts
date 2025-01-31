import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { ContractInput } from '../../../../../gql/resolvers/Types/Contract/inputs/ContractInput';

const UPDATE_CONTRACT_MUTATION = `mutation ($contractId: ID!, $input: ContractInput!) {
  updateContract(contractId: $contractId, input: $input) {
    id
    name
    relativeDates
    workingDays {
      mon
      tue
      wed
      thu
      fri
      sat
      sun
      holidays
    }
  }
}`;

describe('gql/resolvers/Mutation/updateContract', () => {
  it('should allow to update my contract', async () => {
    const currentUser = await getCurrentUser('for-update@test.com', 'fa3d2aee-fb21-4dc6-8512-aab474dc5165');
    const input: ContractInput = {
      relativeDates: true,
      name: 'just testing',
      // graphql 🤦‍♂️
      workingDays: Object.assign(Object.create(null), {
        mon: false,
        tue: true,
        wed: true,
        thu: false,
        fri: true,
        sat: true,
        sun: false,
        holidays: false
      })
    };
    const { data, errors } = await execQuery(
      UPDATE_CONTRACT_MUTATION,
      {
        contractId: '8e24afe7-192b-4e4e-8931-2fd54a801a26',
        input
      },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.updateContract.name, input.name);
    assert.equal(data!.updateContract.relativeDates, input.relativeDates);
    assert.deepStrictEqual(data!.updateContract.workingDays, input.workingDays);
  });
});
