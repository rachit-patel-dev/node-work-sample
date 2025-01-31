import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const GET_CURRENT_USER_QUERY = `query {
  getCurrentUser {
    id
    email
  }
}`;

describe('gql/resolvers/Query/getCurrentUser', () => {
  it('should return current user', async () => {
    const currentUser = await getCurrentUser();
    const { errors, data } = await execQuery(GET_CURRENT_USER_QUERY, {}, currentUser);

    assert.ok(!errors, 'there should be no errros');
    assert.equal(data!.getCurrentUser.id, currentUser.id);
  });

  it('should return error if no current user exists', async () => {
    const { errors, data } = await execQuery(GET_CURRENT_USER_QUERY, {}, null);

    assert.ok(errors, 'it should return error');
    assert.ok(!data, 'there should be not data present');
  });
});
