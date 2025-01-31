import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { InviteInput } from '../../../../../gql/resolvers/InviteInput';
import { InviteType } from '../../../../../db/types/invite';
import { UserRole } from '../../../../../db/types/role';

const CREATE_COLLABORATOR_INVITE = `mutation ($collaboratorId: ID!, $input: InviteInput!) {
  createCollaboratorInvite(collaboratorId: $collaboratorId, input: $input) {
    id
    invite {
      firstName
      email
      type
      data
      userRole
      invitedBy {
        id
      }
    }
  }
}`;

describe('gql/resolvers/Mutation/createCollaboratorInvite', () => {
  it('should allow to create collaborator invite', async () => {
    const roleId = '184ac629-1755-4f6d-aa6d-8558ae90d5da';
    const currentUser = await getCurrentUser('for-create@test.com', roleId);
    const collaboratorId = '6a092778-e810-48f0-9baf-7c778ca78b66';
    const input: InviteInput = {
      firstName: 'Test',
      email: 'create-collaborator-invite@test.com',
      message: 'Test',
      role: UserRole.HomeOwner
    };
    const { data, errors } = await execQuery(CREATE_COLLABORATOR_INVITE, { collaboratorId, input }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.createCollaboratorInvite.id, collaboratorId);
    const invite = data!.createCollaboratorInvite.invite;
    assert.equal(invite.firstName, input.firstName);
    assert.equal(invite.email, input.email);
    assert.equal(invite.type, InviteType.ContractCollaborator);
    assert.equal(invite.userRole, input.role);
    assert.deepStrictEqual(invite.data, { collaboratorId });
    assert.equal(invite.invitedBy.id, roleId);
  });
});
