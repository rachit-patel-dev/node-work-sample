import * as assert from 'assert';
import { getCurrentUser, execQuery } from '../../../index';
import { PortfolioInput } from '../../../../../gql/resolvers/Types/Portfolio/inputs/PortfolioInput';
import { FileUpdateInput } from '../../../../../gql/resolvers/Types/File/inputs/UpdateInput';

const CREATE_PORTFOLIO_MUTATION = `mutation ($input: PortfolioInput!, $files: [FileUpdateInput!]!) {
  createPortfolio(input: $input, files: $files) {
    id
    name
    roleId

    files {
      id
      name
      description
      tags
    }
  }
}`;

describe('gql/resolvers/Mutation/createPortfolio', () => {
  it('should allow to create portfolio', async () => {
    const roleId = '184ac629-1755-4f6d-aa6d-8558ae90d5da';
    const currentUser = await getCurrentUser('for-create@test.com', roleId);
    const input: PortfolioInput = {
      name: 'test',
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
        id: '6e11e239-f775-43a1-89bd-9d2c239d5f03',
        description: 'Portfolio image',
        tags: ['nice']
      }
    ];
    const { data, errors } = await execQuery(CREATE_PORTFOLIO_MUTATION, { input, files }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.createPortfolio.name, input.name);
    assert.equal(data!.createPortfolio.roleId, roleId);
    assert.equal(data!.createPortfolio.files[0].id, files[0].id);
    assert.equal(data!.createPortfolio.files[0].name, 'createPortfolio.jpeg');
    assert.equal(data!.createPortfolio.files[0].tags.length, 1);
    assert.equal(data!.createPortfolio.files[0].description, files[0].description);
  });
});
