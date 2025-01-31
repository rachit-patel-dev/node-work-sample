import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { InsuranceInput } from '../../../../../gql/resolvers/Types/Insurance/inputs/InsuranceInput';

export const CREATE_INSURANCE_MUTATION = `mutation ($input: InsuranceInput!, $files: [ID!]!) {
  createInsurance(input: $input, files: $files) {
    id
    number
    files {
      id
    }
  }
}`;

describe('gql/resolvers/Mutation/createInsurance', () => {
  it('should allow to create an insurance', async () => {
    const roleId = 'bc4372ff-fc79-49d1-af38-dd51394d3d9b';
    const currentUser = await getCurrentUser('for-create@test.com', roleId);
    const input: InsuranceInput = {
      company: 'test',
      number: '11111111',
      amount: 100000000,
      expiresAt: new Date()
    };
    const files = ['0a6aeede-5045-4179-9f96-56e3d3d3d8d8'];
    const { data, errors } = await execQuery(CREATE_INSURANCE_MUTATION, { input, files }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.createInsurance.id, 'id must be present');
    assert.equal(data!.createInsurance.number, input.number);
    assert.equal(data!.createInsurance.files[0].id, files[0]);
  });
});
