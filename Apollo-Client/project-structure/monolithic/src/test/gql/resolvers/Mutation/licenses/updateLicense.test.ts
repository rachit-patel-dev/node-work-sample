import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { LicenseInput } from '../../../../../gql/resolvers/LicenseInput';

const UPDATE_LICENSE_MUTATION = `mutation ($licenseId: ID!, $input: LicenseInput!) {
  updateLicense(licenseId: $licenseId, input: $input) {
    id
    number
  }
}`;

describe('gql/resolvers/Mutation/updateLicense', () => {
  it('should allow to update my license', async () => {
    const currentUser = await getCurrentUser('for-update@test.com', 'fa3d2aee-fb21-4dc6-8512-aab474dc5165');
    const licenseId = 'd59006d2-182a-41f6-9b02-c3b1a6f0a984';
    const input: LicenseInput = {
      number: 'updated license',
      state: 'WA',
      expiresAt: new Date(),
      issuedAt: new Date(),
      type: 'Architect'
    };
    const { data, errors } = await execQuery(UPDATE_LICENSE_MUTATION, { licenseId, input }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.updateLicense.id, licenseId);
    assert.equal(data!.updateLicense.number, input.number);
  });
});
