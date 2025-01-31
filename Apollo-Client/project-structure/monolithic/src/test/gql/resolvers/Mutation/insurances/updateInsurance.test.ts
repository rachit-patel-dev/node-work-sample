import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { InsuranceInput } from '../../../../../gql/resolvers/Types/Insurance/inputs/InsuranceInput';

const UPDATE_INSURANCE_MUTATION = `mutation ($insuranceId: ID!, $input: InsuranceInput!, $files: [ID!]!) {
  updateInsurance(insuranceId: $insuranceId, input: $input, files: $files) {
    id
    company
    files {
      id
    }
  }
}`;

describe('gql/resolvers/Mutation/updateInsurance', () => {
  it('should allow to update my insurance', async () => {
    const currentUser = await getCurrentUser('for-update@test.com', 'fa3d2aee-fb21-4dc6-8512-aab474dc5165');
    const insuranceId = '0f9b4caa-b0b1-440a-a314-d9c69f508acf';
    const input: InsuranceInput = {
      company: 'updatedInsurance',
      number: 'no 299',
      expiresAt: new Date(),
      amount: 99999999
    };
    const files = ['26be941d-5cee-42e7-8c2a-e6a9e37cb0b4'];

    const { data, errors } = await execQuery(UPDATE_INSURANCE_MUTATION, { insuranceId, input, files }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.updateInsurance.id, insuranceId);
    assert.equal(data!.updateInsurance.company, input.company);
    assert.equal(data!.updateInsurance.files[0].id, files[0]);
  });
});
