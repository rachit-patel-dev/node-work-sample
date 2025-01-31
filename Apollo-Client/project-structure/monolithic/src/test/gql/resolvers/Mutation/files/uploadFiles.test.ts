import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { Mime } from '../../../../../utils/mime';

const UPLOAD_MUTATION = `mutation ($files: [FileUploadInput!]!) {
  uploadFiles(files: $files) {
    id
    uploadPolicy {
      bucket
      baseUrl
      signature
      policy
      key
      GoogleAccessId
    }
  }
}`;

describe('gql/resolvers/Mutation/uploadFiles', () => {
  it('should allow to upload multiple files', async () => {
    const currentUser = await getCurrentUser('for-create@test.com', '184ac629-1755-4f6d-aa6d-8558ae90d5da');
    const { data, errors } = await execQuery(
      UPLOAD_MUTATION,
      {
        files: [
          { name: '1.png', mime: Mime.PNG },
          { name: '2.pdf', mime: Mime.PDF }
        ]
      },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');

    assert.ok(data!.uploadFiles[0].id, 'it should return id');
    assert.ok(data!.uploadFiles[1].id, 'it should return id');

    assert.ok(data!.uploadFiles[0].uploadPolicy.signature, 'it should return upload policy');
    assert.ok(data!.uploadFiles[1].uploadPolicy.signature, 'it should return upload policy');
  });
});
