import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const UPDATE_ROLE_MUTATION = `mutation ($data: JSON!) {
  updateRole(data: $data) {
    id
    data
  }
}`;

describe('gql/resolvers/Mutation/updateRole', () => {
  it('should allow to update my role', async () => {
    const roleId = 'fa3d2aee-fb21-4dc6-8512-aab474dc5165';
    const currentUser = await getCurrentUser('for-update@test.com', roleId);
    const updatedData = { updated: true, arr: ['ok'] };
    const { data, errors } = await execQuery(UPDATE_ROLE_MUTATION, { data: updatedData }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.updateRole.id, roleId);
    assert.deepStrictEqual(data!.updateRole.data, updatedData);

    const { data: mergedData, errors: mergedErrors } = await execQuery(
      UPDATE_ROLE_MUTATION,
      { data: { newField: 'yes', arr: ['ok', 'no'] } },
      currentUser
    );

    assert.ok(!mergedErrors, 'there should be no errors');
    assert.equal(mergedData!.updateRole.id, roleId);
    assert.deepStrictEqual(mergedData!.updateRole.data, {
      updated: true,
      newField: 'yes',
      arr: ['ok', 'no']
    });
  });
});
