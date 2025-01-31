import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../..';

const GET_COMPANY_QUERY = `query {
  getCompany {
    id
    name
  }
}`;

describe('gql/resolvers/Query/companies/get', () => {
  it('should allow to get my company', async () => {
    const roleId = '36debf90-5b75-4794-adb0-ccfd26a88a32';
    const currentUser = await getCurrentUser('for-get@test.com', roleId);
    const { data, errors } = await execQuery(GET_COMPANY_QUERY, {}, currentUser);

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    assert.equal(data!.getCompany.id, '78351848-5285-4ab4-9ced-7157128be8b1');
    assert.equal(data!.getCompany.name, 'getCompany');
  });
});
