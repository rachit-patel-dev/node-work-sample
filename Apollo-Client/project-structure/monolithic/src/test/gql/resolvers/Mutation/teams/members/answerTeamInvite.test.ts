import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../../index';
import { TeamMember } from '../../../../../../gql/resolvers/TeamMember';

const ANSWER_TEAM_INVITE_MUTATION = `mutation ($teamId: ID!, $accept: Boolean!) {
  answerTeamInvite(teamId: $teamId, accept: $accept) {
    id
    roleId
  }
}`;

type AnswerTeamInviteMutationResult = { answerTeamInvite?: TeamMember };

describe('gql/resolvers/Mutation/answerTeamInvite', () => {
  const teamId = '711db4e0-17c6-4cf2-8e42-774de2151f80';

  it('should allow to accept invite', async () => {
    const currentUser = await getCurrentUser('add-collaborator@test.com', 'bd1c521f-9e47-4c78-a8bc-7881b5a03ae8');
    const { errors, data } = await execQuery<AnswerTeamInviteMutationResult>(
      ANSWER_TEAM_INVITE_MUTATION,
      { teamId, accept: true },
      currentUser
    );

    assert.ok(!errors, JSON.stringify(errors));
    assert.ok(data!.answerTeamInvite, 'it should return team member');
    assert.equal(data!.answerTeamInvite!.roleId, currentUser.lastRoleId);
  });

  it('should allow to decline invite', async () => {
    const currentUser = await getCurrentUser('for-create@test.com', 'b79207c2-9db1-47f8-9f8d-5e06b170f413');
    const { errors, data } = await execQuery<AnswerTeamInviteMutationResult>(
      ANSWER_TEAM_INVITE_MUTATION,
      { teamId, accept: false },
      currentUser
    );

    assert.ok(!errors, JSON.stringify(errors));
    assert.ok(!data!.answerTeamInvite, 'it should return empty response');
  });
});
