import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const GET_FILES_QUERY = `query ($files: [ID!]!) {
  getFiles(files: $files) {
    id
    url
  }
}`;

describe('gql/resolvers/Query/getFiles', () => {
  it('should allow to get file', async () => {
    const files = ['fd67ad66-e8c7-4970-9e1a-884908aaee65'];
    const { data, errors } = await execQuery(
      GET_FILES_QUERY,
      { files },
      await getCurrentUser(undefined, '36debf90-5b75-4794-adb0-ccfd26a88a32')
    );

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.getFiles[0].id, files[0]);
    assert.ok(data!.getFiles[0].url, 'url must be present');
  });
});
