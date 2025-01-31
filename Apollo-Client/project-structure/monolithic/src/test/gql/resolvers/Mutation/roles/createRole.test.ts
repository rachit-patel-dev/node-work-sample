import { execQuery, getCurrentUser } from '../../../index';
import { UserRole } from '../../../../../db/types/role';
import * as assert from 'assert';

const CREATE_ROLE_MUTATION = `mutation ($name: UserRole!, $data: JSON!) {
  createRole(name: $name, data: $data) {
    id
    userId
    name
    data
  }
}`;

describe('gql/resolvers/Mutation/createRole', () => {
  it('should allow to create role', async () => {
    const currentUser = await getCurrentUser('create-role@test.com');
    const roleData = { test: true };
    const { errors, data } = await execQuery(
      CREATE_ROLE_MUTATION,
      { name: UserRole.HomeOwner, data: roleData },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    assert.ok(data!.createRole.id, 'it should return id');
    assert.equal(data!.createRole.userId, currentUser.id);
    assert.equal(data!.createRole.name, UserRole.HomeOwner);
    assert.deepStrictEqual(data!.createRole.data, roleData);

    // It should not allow to create duplicated role
    const { errors: dErrors, data: dData } = await execQuery(
      CREATE_ROLE_MUTATION,
      { name: UserRole.HomeOwner, data: roleData },
      currentUser
    );

    assert.ok(dErrors, 'it should return error: ' + JSON.stringify(errors));
    assert.ok(!dData, 'there should not be any data');
  });
});
