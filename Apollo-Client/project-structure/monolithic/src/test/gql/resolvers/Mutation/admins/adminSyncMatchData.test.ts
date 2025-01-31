import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { config } from '../../../../../config';

const ADMIN_SYNC_MATCH_DATA_MUTATION = `mutation {
  adminSyncMatchData {
    proTypesDoc
    proSpecialtiesDoc
    updatedAt
  }
}`;

describe('gql/resolvers/Mutation/adminSyncMatchData', () => {
  it('should allow to force sync match data', async function() {
    this.timeout(10000);

    const currentUser = await getCurrentUser('admin@test.com', '1f24a50c-20ee-4191-b2cb-9d0a74db32c5');
    const { data, errors } = await execQuery(ADMIN_SYNC_MATCH_DATA_MUTATION, {}, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.adminSyncMatchData.proTypesDoc, config.matching.proTypesDoc);
    assert.equal(data!.adminSyncMatchData.proSpecialtiesDoc, config.matching.proSpecialtiesDoc);
    assert.ok(data!.adminSyncMatchData.updatedAt);
  });
});
