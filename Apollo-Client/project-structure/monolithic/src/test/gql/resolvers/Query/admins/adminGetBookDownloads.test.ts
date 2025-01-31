import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const ADMIN_GET_BOOK_DOWNLOADS_QUERY = `query {
  adminGetBookDownloads {
    id
    fullName
    email
    occupation
    createdAt
    updatedAt
  }
}`;

describe('gql/resolvers/Mutation/adminGetBookDownloads', () => {
  it('should allow to get book downloads', async () => {
    const currentUser = await getCurrentUser('admin@test.com', '1f24a50c-20ee-4191-b2cb-9d0a74db32c5');
    const { errors, data } = await execQuery(ADMIN_GET_BOOK_DOWNLOADS_QUERY, {}, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.adminGetBookDownloads[0].id, '87c4eb86-2ae9-4559-b148-66446c688ede');
    assert.equal(data!.adminGetBookDownloads[1].id, '9ed29741-d346-4a40-96b7-23cf5d477581');
  });
});
