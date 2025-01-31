import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const DELETE_DEVICE_ID_MUTATION = `mutation ($token: String!) {
  deleteDeviceId(token: $token)
}`;

describe('gql/resolvers/Mutation/deleteDeviceId', () => {
  it('should clear device token', async () => {
    const currentUser = await getCurrentUser('for-delete@test.com', 'e8335aa7-1ccf-48c3-8033-205a7734c4b8');
    const token = 'ios-device';
    const { data, errors } = await execQuery(DELETE_DEVICE_ID_MUTATION, { token }, currentUser);

    assert.ok(!errors, JSON.stringify(errors));
    assert.ok(data!.deleteDeviceId);
  });
});
