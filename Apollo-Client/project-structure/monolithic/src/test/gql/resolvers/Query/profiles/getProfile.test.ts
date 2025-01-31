import * as assert from 'assert';
import { execQuery } from '../../../index';
import { UserRole } from '../../../../../db/types/role';

const GET_PROFILE_QUERY = `query ($profileId: ID!) {
  getProfile(profileId: $profileId) {
    id
    name
  }
}`;

describe(`gql/resolvers/Query/getProfile`, () => {
  it('should allow to get profile', async () => {
    const profileId = '36debf90-5b75-4794-adb0-ccfd26a88a32';
    const { data, errors } = await execQuery(GET_PROFILE_QUERY, { profileId }, null);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.getProfile.id, profileId);
    assert.equal(data!.getProfile.name, UserRole.Pro);
  });
});
