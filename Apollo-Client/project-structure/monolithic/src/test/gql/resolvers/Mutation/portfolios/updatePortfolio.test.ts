import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { PortfolioInput } from '../../../../../gql/resolvers/Types/Portfolio/inputs/PortfolioInput';
import { FileUpdateInput } from '../../../../../gql/resolvers/Types/File/inputs/UpdateInput';

const UPDATE_PORTFOLIO_MUTATION = `mutation (
  $portfolioId: ID!,
  $input: PortfolioInput!,
  $files: [FileUpdateInput!]!
) {
  updatePortfolio(portfolioId: $portfolioId, input: $input, files: $files) {
    id
    name

    files {
      id
      description
    }
  }
}`;

describe('gql/resolvers/Mutation/updatePortfolio', () => {
  it('should allow to update my portfolio', async () => {
    const currentUser = await getCurrentUser('for-update@test.com', 'fa3d2aee-fb21-4dc6-8512-aab474dc5165');
    const portfolioId = '7497e568-66b3-4bcd-b60f-630985f84abd';
    const input: PortfolioInput = {
      name: 'update test',
      description: 'go',
      style: 'best',
      cost: 1000000,
      size: 1000,
      startDate: new Date(),
      endDate: new Date(),
      city: 'NY',
      state: 'NY',
      scope: 'New home',
      scopeDetails: ['details']
    };
    const files: FileUpdateInput[] = [
      {
        id: '0a17c33a-88db-4b8e-af5f-61d0a6614770',
        description: 'gogogogo'
      }
    ];
    const { data, errors } = await execQuery(UPDATE_PORTFOLIO_MUTATION, { portfolioId, input, files }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.updatePortfolio.name, input.name);
    assert.equal(data!.updatePortfolio.files[0].id, files[0].id);
    assert.equal(data!.updatePortfolio.files[0].description, files[0].description);
  });
});
