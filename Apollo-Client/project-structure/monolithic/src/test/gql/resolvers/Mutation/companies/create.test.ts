import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../..';
import { CompanyInputCreate } from '../../../../../gql/resolvers/Types/Company';

const CREATE_COMPANY_MUTATION = `mutation ($input: CompanyInputCreate!) {
  createCompany(input: $input) {
    id
    name
    roleId
  }
}`;

describe('gql/resolvers/Mutation/companies/create', () => {
  it('should allow to create company', async () => {
    const roleId = '184ac629-1755-4f6d-aa6d-8558ae90d5da';
    const currentUser = await getCurrentUser('for-create@test.com', roleId);
    const input: CompanyInputCreate = {
      name: 'Test',
      establishmentYear: 1900,
      website: 'www.google.com',
      address: {
        phone: '123-123-123',
        street: 'st no',
        city: 'NY',
        state: 'NY',
        zip: '10001',
        lat: 40.73061,
        lon: -73.935242
      }
    };

    const { data, errors } = await execQuery(
      CREATE_COMPANY_MUTATION,
      { input },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    assert.ok(data!.createCompany.id, 'id must be present');
    assert.equal(data!.createCompany.roleId, roleId);
    assert.equal(data!.createCompany.name, input.name);
  });
});
