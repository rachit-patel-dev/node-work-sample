import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../../index';
import { InviteInput } from '../../../../../../gql/resolvers/InviteInput';
import { TeamMember } from '../../../../../../gql/resolvers/TeamMember';
import { UserRole } from '../../../../../../db/types/role';

const INVITE_TEAM_MEMBER_MUTATION = `mutation ($teamId: ID!, $input: InviteInput!) {
  inviteTeamMember(teamId: $teamId, input: $input) {
    id
    teamId
    invite {
      id
      email
    }
  }
}`;

describe('gql/resolves/Mutation/inviteTeamMember', () => {
  it('should allow to invite team member', async () => {
    const currentUser = await getCurrentUser('for-create@test.com', '184ac629-1755-4f6d-aa6d-8558ae90d5da');
    const teamId = 'd2511c16-e468-4277-b0e3-93c825ec6337';
    const input: InviteInput = {
      firstName: 'Test',
      lastName: 'Member',
      email: 'test_member@test.com',
      message: '',
      role: UserRole.Pro
    };
    const { errors, data } = await execQuery<{ inviteTeamMember: TeamMember }>(
      INVITE_TEAM_MEMBER_MUTATION,
      { teamId, input },
      currentUser
    );

    assert.ok(!errors, JSON.stringify(errors));
    assert.equal(data!.inviteTeamMember.teamId, teamId);
    assert.equal(data!.inviteTeamMember.invite!.email, input.email);
  });
});
