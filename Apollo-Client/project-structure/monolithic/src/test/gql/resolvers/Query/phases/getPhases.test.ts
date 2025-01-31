import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const GET_PHASES_QUERY = `query ($contractId: ID!) {
  getPhases(contractId: $contractId) {
    id
  }
}`;

describe('gql/resolvers/Query/getPhases', () => {
  it('should allow to get my contract phases', async () => {
    const currentUser = await getCurrentUser('for-get@test.com', 'c9caf642-6cbf-4371-a97e-ca756339eaaa');
    const { data, errors } = await execQuery(
      GET_PHASES_QUERY,
      { contractId: '9a5b0bf3-b985-438d-a0eb-a033adb2b925' },
      currentUser
    );

    assert.ok(!errors, 'there should be no erros');
    assert.ok(data!.getPhases[0].id, 'c2060e44-1e6d-47d9-9414-06d72ff85206');
    assert.ok(data!.getPhases[1].id, '7b097423-9fb7-4a03-b0aa-69476fb0953c');
    assert.ok(data!.getPhases[2].id, 'b5efd77c-dbdb-4490-936f-69eb1abc191e');
  });
});
