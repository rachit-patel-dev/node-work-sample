import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const ADMIN_CREATE_BANNED_EMAIL_MUTATION = `mutation($email: String!) {
  adminCreateBannedEmail(email: $email) {
    id
    email
    attempts
    createdAt

    bannedBy {
      id
    }
  }
}`;

describe('gql/resolvers/Mutation/adminCreateBannedEmail', () => {
  it('should allow to ban email', async () => {
    const currentUser = await getCurrentUser('admin@test.com', '1f24a50c-20ee-4191-b2cb-9d0a74db32c5');
    const email = 'ban-it@test.com';

    const { errors, data } = await execQuery(ADMIN_CREATE_BANNED_EMAIL_MUTATION, { email }, currentUser);

    assert.ok(!errors, JSON.stringify(errors));
    assert.equal(data!.adminCreateBannedEmail.email, email);
  });
});
