import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const DELETE_FILES_MUTATION = `mutation ($files: [ID!]!) {
  deleteFiles(files: $files)
}`;

describe('gql/resolvers/Mutation/deleteFiles', () => {
  it('should allow to delete my file', async () => {
    const currentUser = await getCurrentUser('for-delete@test.com', '513d56e7-1fcb-4536-a6ee-00f65391797e');
    const files = ['007a57cc-14ea-4108-aeb1-b4129337f3e8'];
    const { data, errors } = await execQuery(DELETE_FILES_MUTATION, { files }, currentUser);

    assert.ok(!errors, 'there should be no error');
    assert.deepStrictEqual(data!.deleteFiles, files);
  });

  it('should not allow to delete someones else file', async () => {
    const currentUser = await getCurrentUser('for-delete@test.com', '513d56e7-1fcb-4536-a6ee-00f65391797e');
    const files = ['6ec452ef-c28c-4c39-acdc-e0bfadda8661'];
    const { data, errors } = await execQuery(DELETE_FILES_MUTATION, { files }, currentUser);

    assert.ok(!errors, 'there should be no error');
    assert.deepStrictEqual(data!.deleteFiles, []);
  });
});
