import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const GET_PORTFOLIOS_QUERY = `query ($roleId: ID!) {
  getPortfolios(roleId: $roleId) {
    id
    roleId
  }
}`;

describe('gql/resolvers/Query/getPortfolios', () => {
  it('should allow to get portfolios', async () => {
    const roleId = '36debf90-5b75-4794-adb0-ccfd26a88a32';
    const currentUser = await getCurrentUser('for-get@test.com', roleId);
    const { errors, data } = await execQuery(GET_PORTFOLIOS_QUERY, { roleId }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.getPortfolios[0].id, '8bb87346-012a-49c1-8be8-69391e60b65e');
    assert.equal(data!.getPortfolios[0].roleId, roleId);
  });
});
