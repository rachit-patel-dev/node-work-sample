import * as assert from 'assert';
import { execQuery } from '../../../index';

const GET_INVITE_QUERY = `query ($key: String!) {
  getInvite(key: $key) {
    id
  }
}`;

describe(`gql/resolvers/Query/getInvite`, () => {
  it('should allow to get invite', async () => {
    const { data, errors } = await execQuery(GET_INVITE_QUERY, { key: 'getInviteSecret' }, null);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.getInvite.id, '348f2f42-54ad-400e-8a18-6f2206ff6d33');
  });
});
