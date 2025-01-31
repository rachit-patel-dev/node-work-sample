import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const ADMIN_DELETE_BANNED_EMAIL_MUTATION = `mutation($bannedEmailId: ID!) {
  adminDeleteBannedEmail(bannedEmailId: $bannedEmailId)
}`;

describe('gql/resolvers/Mutation/adminDeleteBannedEmail', () => {
  it('should allow to delete banned email', async () => {
    const currentUser = await getCurrentUser('admin@test.com', '1f24a50c-20ee-4191-b2cb-9d0a74db32c5');
    const bannedEmailId = 999;

    const { errors, data } = await execQuery(ADMIN_DELETE_BANNED_EMAIL_MUTATION, { bannedEmailId }, currentUser);

    assert.ok(!errors, JSON.stringify(errors));
    assert.ok(data!.adminDeleteBannedEmail, 'it should return true');
  });
});
