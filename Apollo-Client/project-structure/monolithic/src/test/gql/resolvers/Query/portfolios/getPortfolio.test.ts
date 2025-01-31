import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const GET_PORTFOLIO_QUERY = `query ($portfolioId: ID!) {
  getPortfolio(portfolioId: $portfolioId) {
    id
    roleId
  }
}`;

describe('gql/resolvers/Query/getPortfolio', () => {
  it('should allow to get portfolio', async () => {
    const roleId = '36debf90-5b75-4794-adb0-ccfd26a88a32';
    const currentUser = await getCurrentUser('for-get@test.com', roleId);
    const portfolioId = '8bb87346-012a-49c1-8be8-69391e60b65e';
    const { errors, data } = await execQuery(GET_PORTFOLIO_QUERY, { portfolioId }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.getPortfolio.id, portfolioId);
    assert.equal(data!.getPortfolio.roleId, roleId);
  });
});
