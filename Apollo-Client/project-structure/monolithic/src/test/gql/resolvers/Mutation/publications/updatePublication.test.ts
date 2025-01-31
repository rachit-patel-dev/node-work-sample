import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { PublicationInput } from '../../../../../gql/resolvers/Types/Publication/inputs/PublicationInput';

const UPDATE_PUBLICATION_MUTATION = `mutation ($publicationId: ID!, $input: PublicationInput!, $files: [ID!]!) {
  updatePublication(publicationId: $publicationId, input: $input, files: $files) {
    id
    name
    files {
      id
    }
  }
}`;

describe(`gql/resolvers/Mutation/updatePublication`, () => {
  it('should allow to update my publication', async () => {
    const currentUser = await getCurrentUser('for-update@test.com', 'fa3d2aee-fb21-4dc6-8512-aab474dc5165');
    const publicationId = 'd989a950-05ed-4f1b-b182-ccd9a6c00e8f';
    const input: PublicationInput = {
      name: 'updatedPublication',
      publishedAt: new Date()
    };
    const files = ['ec6fd5ab-0929-4fb5-bad7-da8078453bf1'];

    const { data, errors } = await execQuery(UPDATE_PUBLICATION_MUTATION, { publicationId, input, files }, currentUser);

    assert.ok(!errors, 'there shoud be no errors');
    assert.equal(data!.updatePublication.id, publicationId);
    assert.equal(data!.updatePublication.name, input.name);
    assert.equal(data!.updatePublication.files[0].id, files[0]);
  });
});
