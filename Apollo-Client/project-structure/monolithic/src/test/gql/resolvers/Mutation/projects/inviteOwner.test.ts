import * as assert from 'assert';
import { execQuery, getCurrentUser } from '../../..';
import { InviteInput } from '../../../../../gql/resolvers/InviteInput';
import { UserRole } from '../../../../../db/types/role';

const CREATE_PROJECT_BY_PRO_MUTATION = `mutation (
  $matchData: JSON!,
  $input: InviteInput!
) {
  createProjectByPartner(matchData: $matchData, input: $input) {
    partner {
      id
    }
    project {
      ownerInvite {
        id
      }
    }
  }
}`;

describe('gql/resolvers/mutation/projects/inviteOwner', () => {
  it('should allow to create project by pro', async () => {
    const roleId = '184ac629-1755-4f6d-aa6d-8558ae90d5da';
    const currentUser = await getCurrentUser('for-create@test.com', roleId);
    const input: InviteInput = {
      firstName: 'project by pro',
      email: 'create-project-by-pro@test.com',
      message: 'go go go',
      role: UserRole.HomeOwner
    };
    const { data, errors } = await execQuery(
      CREATE_PROJECT_BY_PRO_MUTATION,
      { matchData: {}, input },
      currentUser
    );

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));
    assert.equal(data!.createProjectByPartner.partner.id, roleId);
    assert.ok(data!.createProjectByPartner.project.ownerInvite.id);
  });
});
