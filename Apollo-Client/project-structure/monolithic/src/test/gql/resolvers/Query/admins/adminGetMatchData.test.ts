import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { config } from '../../../../../config';

const ADMIN_GET_MATCH_DATA_MUTATION = `query {
  adminGetMatchData {
    proTypesDoc
    proSpecialtiesDoc
    updatedAt
  }
}`;

describe('gql/resolvers/Query/adminGetMatchData', () => {
  it('should allow to get match data', async function() {
    this.timeout(10000);

    const currentUser = await getCurrentUser('admin@test.com', '1f24a50c-20ee-4191-b2cb-9d0a74db32c5');
    const { data, errors } = await execQuery(ADMIN_GET_MATCH_DATA_MUTATION, {}, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.adminGetMatchData.proTypesDoc, config.matching.proTypesDoc);
    assert.equal(data!.adminGetMatchData.proSpecialtiesDoc, config.matching.proSpecialtiesDoc);
    assert.ok(data!.adminGetMatchData.updatedAt);
  });
});
