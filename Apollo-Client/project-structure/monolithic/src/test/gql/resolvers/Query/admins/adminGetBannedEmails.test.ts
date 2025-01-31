import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const ADMIN_GET_BANNED_EMAILS_QUERY = `query {
  adminGetBannedEmails {
    id
    email
    attempts
    createdAt
  }
}`;

describe('gql/resolvers/Query/adminGetBannedEmails', () => {
  it('should return all banned emails', async () => {
    const currentUser = await getCurrentUser('admin@test.com', '1f24a50c-20ee-4191-b2cb-9d0a74db32c5');

    const { errors, data } = await execQuery(ADMIN_GET_BANNED_EMAILS_QUERY, {}, currentUser);

    assert.ok(!errors, JSON.stringify(errors));
    assert.equal(data!.adminGetBannedEmails[0].id, 1001);
    assert.equal(data!.adminGetBannedEmails[1].id, 1000);
  });
});
