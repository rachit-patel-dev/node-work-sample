import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../../index';
import { ContractStatus, ContractInviteRefusalReason } from '../../../../../../db/types/contract';

const ANSWER_CONTRACT_INVITE_MUTATION = `mutation (
  $contractId: ID!,
  $accept: Boolean!,
  $refusalReason: ContractInviteRefusalReason,
  $refusalMessage: String
) {
  answerContractInvite(
    contractId: $contractId,
    accept: $accept,
    refusalReason: $refusalReason,
    refusalMessage: $refusalMessage
  ) {
    id
    status
    inviteRefusalReason
    inviteRefusalMessage
  }
}`;

describe('gql/resolvers/Mutation/answerContractInvite', () => {
  it('should allow me to accept invite', async () => {
    const currentUser = await getCurrentUser('for-update@test.com', 'fa3d2aee-fb21-4dc6-8512-aab474dc5165');
    const contractId = '17b95736-5bb2-4cc1-985c-d2a70e530f09';
    const accept = true;
    const { data, errors } = await execQuery(ANSWER_CONTRACT_INVITE_MUTATION, { contractId, accept }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.answerContractInvite.id, contractId);
    assert.equal(data!.answerContractInvite.status, ContractStatus.AcceptedInvite);
  });

  it('should allow me to decline invite', async () => {
    const currentUser = await getCurrentUser('for-update@test.com', 'fa3d2aee-fb21-4dc6-8512-aab474dc5165');
    const contractId = '11ea963e-5997-4f20-9d6a-2d7b2db8f13b';
    const accept = false;
    const refusalReason = ContractInviteRefusalReason.NotGoodMatchSkills;
    const refusalMessage = 'just cause';
    const { data, errors } = await execQuery(
      ANSWER_CONTRACT_INVITE_MUTATION,
      { contractId, accept, refusalReason, refusalMessage },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.answerContractInvite.id, contractId);
    assert.equal(data!.answerContractInvite.status, ContractStatus.NotInterested);
    assert.equal(data!.answerContractInvite.inviteRefusalReason, refusalReason);
    assert.equal(data!.answerContractInvite.inviteRefusalMessage, refusalMessage);
  });
});
