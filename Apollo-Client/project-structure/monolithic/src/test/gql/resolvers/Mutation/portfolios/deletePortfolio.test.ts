import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const DELETE_PORTFOLIO_MUTATION = `mutation ($portfolioId: ID!) {
  deletePortfolio(portfolioId: $portfolioId)
}`;

describe('gql/resolvers/Mutation/deletePortfolio', () => {
  it('should allow to delete my portfolio', async () => {
    const currentUser = await getCurrentUser('for-delete@test.com', '513d56e7-1fcb-4536-a6ee-00f65391797e');
    const { data, errors } = await execQuery(
      DELETE_PORTFOLIO_MUTATION,
      { portfolioId: '5c21323b-59d4-4a15-9494-885ea24058a9' },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.deletePortfolio, true);
  });
});
