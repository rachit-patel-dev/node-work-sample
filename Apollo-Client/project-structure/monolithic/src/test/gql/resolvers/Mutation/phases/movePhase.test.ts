import * as assert from 'assert';
import _ from 'lodash';
import { execQuery, getCurrentUser } from '../../../index';

const MOVE_PHASE_MUTATION = `mutation ($phaseId: ID!, $moveTo: Int!) {
  movePhase(phaseId: $phaseId, moveTo: $moveTo) {
    id
    order
  }
}`;

describe('gql/resolvers/Mutation/movePhase', () => {
  it('should allow to move phase', async () => {
    const currentUser = await getCurrentUser('for-update@test.com', 'fa3d2aee-fb21-4dc6-8512-aab474dc5165');
    // Move phase forward
    let result = await execQuery(
      MOVE_PHASE_MUTATION,
      {
        phaseId: 'fe46a5e1-03c5-449d-9513-fe118361fc45',
        moveTo: 3
      },
      currentUser
    );

    result.data!.movePhase = _.orderBy(result.data!.movePhase, 'order', 'asc');

    assert.ok(!result.errors, 'there should be no errors');
    assert.deepStrictEqual(result.data!.movePhase, [
      makePhase('ffe3e189-e748-4df2-9eb6-25d0e67b47b6', 0),
      makePhase('7d0a285e-a8e2-4f36-a009-8c9e4c4bf8cc', 1),
      makePhase('f886cc92-c0ea-45ea-aad4-cfbfcd87a312', 2),
      makePhase('fe46a5e1-03c5-449d-9513-fe118361fc45', 3)
    ]);

    // Move phase backward
    result = await execQuery(
      MOVE_PHASE_MUTATION,
      {
        phaseId: 'fe46a5e1-03c5-449d-9513-fe118361fc45',
        moveTo: 1
      },
      currentUser
    );

    result.data!.movePhase = _.orderBy(result.data!.movePhase, 'order', 'asc');

    assert.ok(!result.errors, 'there should be no errors');
    assert.deepStrictEqual(result.data!.movePhase, [
      makePhase('ffe3e189-e748-4df2-9eb6-25d0e67b47b6', 0),
      makePhase('fe46a5e1-03c5-449d-9513-fe118361fc45', 1),
      makePhase('7d0a285e-a8e2-4f36-a009-8c9e4c4bf8cc', 2),
      makePhase('f886cc92-c0ea-45ea-aad4-cfbfcd87a312', 3)
    ]);
  });
});

function makePhase(id: string, order: number) {
  return Object.assign(Object.create(null), { id, order });
}
