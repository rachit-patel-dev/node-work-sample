import * as assert from 'assert';
import { getCurrentUser, execQuery } from '../../../index';

const DELETE_INSURANCE_MUTATION = `mutation ($insuranceId: ID!) {
  deleteInsurance(insuranceId: $insuranceId)
}`;

describe('gql/resolvers/Mutation/deleteInsurance', () => {
  it('should allow to delete my insurance', async () => {
    const currentUser = await getCurrentUser('for-delete@test.com', '513d56e7-1fcb-4536-a6ee-00f65391797e');
    const { data, errors } = await execQuery(
      DELETE_INSURANCE_MUTATION,
      { insuranceId: '99943d9e-66ec-4e94-9a43-74898b356ada' },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.deleteInsurance, 'it should return true');
  });
});
