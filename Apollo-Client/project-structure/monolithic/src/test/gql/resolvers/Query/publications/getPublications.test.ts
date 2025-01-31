import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const GET_PUBLICATIONS_QUERY = `query {
  getPublications {
    id
    roleId
  }
}`;

describe('gql/resolvers/Query/getPublications', () => {
  it('it should return my publications', async () => {
    const roleId = '36debf90-5b75-4794-adb0-ccfd26a88a32';
    const currentUser = await getCurrentUser('for-get@test.com', roleId);
    const { data, errors } = await execQuery(GET_PUBLICATIONS_QUERY, {}, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.getPublications[0].id, '140c3c84-2baa-4d53-b691-4d328d99d17d');
    assert.equal(data!.getPublications[0].roleId, roleId);
  });
});
