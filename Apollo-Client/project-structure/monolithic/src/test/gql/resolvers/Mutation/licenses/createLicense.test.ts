import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { LicenseInput } from '../../../../../gql/resolvers/LicenseInput';

const CREATE_LICENSE_MUTATION = `mutation ($input: LicenseInput!) {
  createLicense(input: $input) {
    id
    number
    verifiedAt
  }
}`;

describe('gql/resolvers/Mutation/createLicense', () => {
  it('should allow to create a license', async () => {
    const roleId = 'bc4372ff-fc79-49d1-af38-dd51394d3d9b';
    const currentUser = await getCurrentUser('for-create@test.com', roleId);
    const input: LicenseInput = {
      type: 'Architect',
      number: '111111',
      state: 'NY',
      issuedAt: new Date(),
      expiresAt: new Date()
    };
    const { data, errors } = await execQuery(CREATE_LICENSE_MUTATION, { input }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.ok(data!.createLicense.id, 'id must be present');
    assert.equal(data!.createLicense.verifiedAt, null);
    assert.equal(data!.createLicense.number, input.number);
  });
});
