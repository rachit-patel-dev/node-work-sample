import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const GET_ROLE_QUERY = `query ($roleId: ID!) {
  getRole(roleId: $roleId) {
    id
  }
}`;

describe('gql/resolvers/Query/getRole', () => {
  it('should allow to get my role', async () => {
    const currentUser = await getCurrentUser('for-get@test.com');
    const roleId = '36debf90-5b75-4794-adb0-ccfd26a88a32';
    const { data, errors } = await execQuery(GET_ROLE_QUERY, { roleId }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.getRole.id, roleId);
  });

  it("should not allow to get someone's else role", async () => {
    const currentUser = await getCurrentUser('for-get@test.com');
    const roleId = 'fa3d2aee-fb21-4dc6-8512-aab474dc5165';
    const { data, errors } = await execQuery(GET_ROLE_QUERY, { roleId }, currentUser);

    assert.ok(errors, 'there should be an error');
    assert.ok(!data, 'there should be no data');
  });
});
