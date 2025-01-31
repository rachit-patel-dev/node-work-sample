import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { PublicationInput } from '../../../../../gql/resolvers/Types/Publication/inputs/PublicationInput';

export const CREATE_PUBLICATION_MUTATION = `mutation ($input: PublicationInput!, $files: [ID!]!) {
  createPublication(input: $input, files: $files) {
    id
    name
    files {
      id
    }
  }
}`;

describe('gql/resolvers/Mutation/createPublication', () => {
  it('should allow to create an publication', async () => {
    const roleId = 'bc4372ff-fc79-49d1-af38-dd51394d3d9b';
    const currentUser = await getCurrentUser('for-create@test.com', roleId);
    const input: PublicationInput = {
      name: 'test',
      publishedAt: new Date()
    };
    const files = ['26bdfc8c-1650-4daf-b987-2c989b7f2f71'];
    const { data, errors } = await execQuery(CREATE_PUBLICATION_MUTATION, { input, files }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.createPublication.id, 'id must be present');
    assert.equal(data!.createPublication.name, input.name);
    assert.equal(data!.createPublication.files[0].id, files[0]);
  });
});
