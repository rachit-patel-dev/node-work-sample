import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';

const UPDATE_USER_BASIC_INFO_MUTATION = `mutation ($firstName: String, $lastName: String, $phone: String, $about: String) {
  updateUserBasicInfo(firstName: $firstName, lastName: $lastName, phone: $phone, about: $about) {
    id
    email
    firstName
    lastName
    phone
    about
  }
}`;

describe('gql/resolvers/Mutation/updateUserBasicInfo', () => {
  it('should update info', async () => {
    const email = 'for-update@test.com';
    const currentUser = await getCurrentUser(email);
    const updatedInfo = {
      firstName: 'Updated',
      lastName: 'Owner',
      phone: '23232323232'
    };

    const { errors, data } = await execQuery(UPDATE_USER_BASIC_INFO_MUTATION, updatedInfo, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.ok(!data!.updateUserBasicInfo.about, 'there should be no value');
    assert.equal(data!.updateUserBasicInfo.email, email);
    assert.equal(data!.updateUserBasicInfo.firstName, updatedInfo.firstName);
    assert.equal(data!.updateUserBasicInfo.lastName, updatedInfo.lastName);
    assert.equal(data!.updateUserBasicInfo.phone, updatedInfo.phone);
  });
});
