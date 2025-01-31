import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../..';
import { InviteInput } from '../../../../../gql/resolvers/InviteInput';
import { UserRole } from '../../../../../db/types/role';
import { ContractStatus } from '../../../../../db/types/contract';

const INVITE_TO_PROJECT_BY_EMAIL_MUTATION = `mutation ($projectId: ID!, $input: InviteInput!) {
  invitePartnerToProjectByEmail(projectId: $projectId, input: $input) {
    projectId
    status
    partner {
      user {
        email
      }
    }
    partnerInvite {
      email
    }
  }
}`;

describe('gql/resolvers/Mutation/projects/invitePartner', () => {
  it('should allow to invite existing user to project', async () => {
    const currentUser = await getCurrentUser('for-update@test.com', '1db5cb80-60b1-4d87-a497-a003b58817d0');
    const projectId = 'db5e305f-f52b-4a60-96d9-4621ebed1ff5';
    const input: InviteInput = {
      email: 'for-update@test.com',
      firstName: 'Test',
      message: 'go go',
      role: UserRole.Pro
    };
    const { data, errors } = await execQuery(INVITE_TO_PROJECT_BY_EMAIL_MUTATION, { projectId, input }, currentUser);

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    assert.equal(data!.invitePartnerToProjectByEmail.projectId, projectId);
    assert.equal(data!.invitePartnerToProjectByEmail.status, ContractStatus.Selected);
    assert.equal(data!.invitePartnerToProjectByEmail.partner.user.email, input.email);
  });

  it('should allow to invite non-existing user to project', async () => {
    const currentUser = await getCurrentUser('for-update@test.com', '1db5cb80-60b1-4d87-a497-a003b58817d0');
    const projectId = 'db5e305f-f52b-4a60-96d9-4621ebed1ff5';
    const input: InviteInput = {
      email: 'create-invite@test.com',
      firstName: 'Test',
      message: 'yolo',
      role: UserRole.Pro
    };
    const { data, errors } = await execQuery(INVITE_TO_PROJECT_BY_EMAIL_MUTATION, { projectId, input }, currentUser);

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    assert.equal(data!.invitePartnerToProjectByEmail.projectId, projectId);
    assert.equal(data!.invitePartnerToProjectByEmail.status, ContractStatus.InvitedByEmail);
    assert.equal(data!.invitePartnerToProjectByEmail.partnerInvite.email, input.email);
  });
});
