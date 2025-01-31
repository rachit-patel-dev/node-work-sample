import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const GET_COLLABORATORS_QUERY = `query ($contractId: ID!) {
  getCollaborators(contractId: $contractId) {
    id
  }
}`;

describe('gql/resolvers/Query/getCollaborators', () => {
  it('should allow to get collaborators', async () => {
    const currentUser = await getCurrentUser('for-get@test.com', 'c9caf642-6cbf-4371-a97e-ca756339eaaa');
    const { data, errors } = await execQuery(
      GET_COLLABORATORS_QUERY,
      { contractId: '9a5b0bf3-b985-438d-a0eb-a033adb2b925' },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.getCollaborators[0].id, '16ffe4ae-71a9-430e-a7a0-b08c7f9d7d55');
  });
});
