import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const DELETE_LICENSE_MUTATION = `mutation ($licenseId: ID!) {
  deleteLicense(licenseId: $licenseId)
}`;

describe('gql/resolvers/Mutation/deleteLicense', () => {
  it('should allow to delete my license', async () => {
    const currentUser = await getCurrentUser('for-delete@test.com', '513d56e7-1fcb-4536-a6ee-00f65391797e');
    const { data, errors } = await execQuery(
      DELETE_LICENSE_MUTATION,
      { licenseId: '398bb3fc-71d1-49b3-8ce1-524febb68544' },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.deleteLicense, 'it should return true');
  });
});
