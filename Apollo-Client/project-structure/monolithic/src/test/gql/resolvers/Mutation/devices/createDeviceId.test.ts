import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const CREATE_DEVICE_ID_MUTATION = `mutation ($deviceId: UserDeviceId!) {
  createDeviceId(deviceId: $deviceId)
}`;

describe('gql/resolvers/Mutation/createDeviceId', () => {
  it('should add device token', async () => {
    const currentUser = await getCurrentUser('for-create@test.com', '184ac629-1755-4f6d-aa6d-8558ae90d5da');
    const deviceId = { token: 'ios-device', type: 'iOS' };
    const { data, errors } = await execQuery(CREATE_DEVICE_ID_MUTATION, { deviceId }, currentUser);

    assert.ok(!errors, JSON.stringify(errors));
    assert.ok(data!.createDeviceId);
  });
});
