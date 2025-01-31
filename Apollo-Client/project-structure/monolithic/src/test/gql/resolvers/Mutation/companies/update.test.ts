import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { CompanyInputUpdate } from '../../../../../gql/resolvers/Types/Company';

const UPDATE_COMPANY_MUTATION = `mutation ($companyId: ID!, $input: CompanyInputUpdate!) {
  updateCompany(companyId: $companyId, input: $input) {
    name
    establishmentYear
    website
  }
}`;

describe('gql/resolvers/Mutation/companies/update', () => {
  it('should allow to edit my company', async () => {
    const currentUser = await getCurrentUser(
      'for-update@test.com',
      'fa3d2aee-fb21-4dc6-8512-aab474dc5165'
    );
    const companyId = 'bc7186da-4fa8-4ce8-b8d4-25d6607107e5';
    const input: CompanyInputUpdate = {
      name: 'updated',
      establishmentYear: 1900,
      website: 'www.google.com'
    };

    const { data, errors } = await execQuery(
      UPDATE_COMPANY_MUTATION,
      { companyId, input },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    const { ...updatedInput } = input;
    assert.deepStrictEqual(
      // Hack because graphql returns null-prototype based objects
      Object.assign({}, data!.updateCompany),
      updatedInput
    );
  });
});
