import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../../index';
import { PhaseCostInput } from '../../../../../gql/resolvers/PhaseCostInput';

const UPDATE_ACTUAL_PHASE_COST_MUTATION = `mutation ($phaseId: ID!, $cost: PhaseCostInput!) {
  updateActualPhaseCost(phaseId: $phaseId, cost: $cost) {
    id
    actualMaterialCost
    actualLaborCost
    actualOtherCost
  }
}`;

describe('gql/resolvers/Mutation/updateActualPhaseCost', () => {
  it('should allow to update actual phase cost', async () => {
    const currentUser = await getCurrentUser('for-update@test.com', 'fa3d2aee-fb21-4dc6-8512-aab474dc5165');
    const phaseId = 'd532a0ae-1f55-4255-bbec-2111abab530c';
    const cost: PhaseCostInput = {
      material: 987,
      labor: 37284,
      other: 32873
    };
    const { data, errors } = await execQuery(UPDATE_ACTUAL_PHASE_COST_MUTATION, { phaseId, cost }, currentUser);

    assert.ok(!errors, 'there should be no errors');
    assert.equal(data!.updateActualPhaseCost.id, phaseId);
    assert.equal(data!.updateActualPhaseCost.actualMaterialCost, cost.material);
    assert.equal(data!.updateActualPhaseCost.actualLaborCost, cost.labor);
    assert.equal(data!.updateActualPhaseCost.actualOtherCost, cost.other);
  });
});
