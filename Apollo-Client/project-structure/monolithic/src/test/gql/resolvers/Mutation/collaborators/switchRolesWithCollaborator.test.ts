/*external modules*/
import _ from 'lodash';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Collaborator, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { Contract as ContractDB } from '../../../../../db/types/contract';
import { User } from '../../../../../db/types/user';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
import { ContractModel } from '../../../../../db/models/ContractModel';
import { ProjectModel } from '../../../../../db/models/ProjectModel';
/*GQL*/
import { execQuery } from '../../../index';
import { GraphQLError } from '../../../../../gql';
import { Contract } from '../../../../../gql/resolvers/Types/Contract';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { switchRolesWithCollaborator: Contract };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  Switch = 'Switch',
  Other = 'Other'
}

interface OutputData {
  users: Test.TUser[];
  project: Test.TProject;
  mainContract: ContractDB;
  otherContract: ContractDB;
  collaborators: Collaborator[];
}

const requiredFieldSet: Test.TFieldSet<Contract> = {
  scalar: [
    'id',
    'createdAt',
    'introMessage',
    'name',
    'relativeDates',
    'status',
    'currentUserPermission',
    'autoPayments',
    'unreadMessagesCount'
  ],
  object: ['project'],
  array: ['phases', 'completions']
};

const SWITCH_ROLES_WITH_COLLABORATOR_MUTATION = `mutation ($contractId: ID!, $collaboratorId: ID!) {
  switchRolesWithCollaborator(contractId: $contractId, collaboratorId: $collaboratorId) {
      id
      createdAt
      introMessage
      name
      relativeDates
      status
      currentUserPermission
      autoPayments
      unreadMessagesCount

      partner {
        id
      }
      project {
        id

        owner {
          id
        }
      }

      phases {
        name
      }
      completions {
        id
      }
  }
}`;

describe('gql/resolvers/Mutation/switchRolesWithCollaborator', () => {
  let outputData: OutputData;

  const inputData = {
    users: [
      {
        email: Email.Home,
        role: {
          name: UserRole.HomeOwner
        }
      },
      {
        email: Email.Pro,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.Other,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.Collaborator + CollaboratorPermission.Read + UserRole.Pro,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.Collaborator + CollaboratorPermission.Read + UserRole.HomeOwner,
        role: {
          name: UserRole.HomeOwner
        }
      }
    ],
    collaborators: [
      {
        permissions: CollaboratorPermission.Read,
        invite: {
          firstName: 'test pro',
          inviteMessage: 'test pro message',
          type: InviteType.ProjectProInvite,
          userRole: UserRole.Pro
        }
      },
      {
        permissions: CollaboratorPermission.Read,
        invite: {
          firstName: 'test home',
          inviteMessage: 'test home message',
          type: InviteType.ProjectOwnerInvite,
          userRole: UserRole.HomeOwner
        }
      }
    ],
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    mainContract: {
      name: ContractName.Switch
    },
    otherContract: {
      name: ContractName.Other
    }
  };

  before(async () => {
    const ctx = { sql, events: [] };
    outputData = await getClientTransaction(async client => {
      const users = await Promise.all(
        _.map(inputData.users, async userData => {
          const userGenerate = new Test.UserGenerate(client, ctx);

          await userGenerate.create({ email: userData.email });
          await userGenerate.setRole({ name: userData.role.name });

          return userGenerate.user!;
        })
      );

      const homeUser = _.find(users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('owner');

      const proUser = _.find(users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro');

      const projectGenerate = new Test.ProjectGenerate(client, ctx);
      await projectGenerate.create({
        ownerId: homeUser.lastRoleId,
        matchData: inputData.project.matchData as any
      });
      await projectGenerate.addContract({
        name: inputData.mainContract.name,
        partnerId: proUser.lastRoleId
      });
      await projectGenerate.addContract({
        name: inputData.otherContract.name,
        partnerId: homeUser.lastRoleId
      });

      const project = projectGenerate.project!;

      const mainContract = _.find(project.contracts, {
        name: ContractName.Switch
      });
      if (!mainContract) throw GraphQLError.notFound('Switch contract');

      const otherContract = _.find(project.contracts, {
        name: ContractName.Other
      });
      if (!otherContract) throw GraphQLError.notFound('Other contract');

      const collaborators = await Promise.all(
        _.map(inputData.collaborators, async collaboratorData => {
          let userInvited;

          switch (collaboratorData.invite.userRole) {
            case UserRole.Pro:
              userInvited = proUser;
              break;
            case UserRole.HomeOwner:
              userInvited = homeUser;
              break;
          }

          if (!userInvited) throw GraphQLError.notFound('user invited');

          const email = Email.Collaborator + collaboratorData.permissions + collaboratorData.invite.userRole;
          const collaborator = _.find(users, { email });

          if (!collaborator) throw GraphQLError.notFound('collaborator');

          const inviteProGenerate = new Test.InviteGenerate(client, ctx);
          await inviteProGenerate.create({
            ...collaboratorData.invite,
            email: email,
            invitedById: userInvited.lastRoleId
          });

          const invite = inviteProGenerate.invite!;

          const collaboratorProGenerate = new Test.CollaboratorGenerate(client, ctx);
          await collaboratorProGenerate.create({
            roleId: collaborator.lastRoleId,
            inviteId: invite.id,
            contractId: mainContract.id,
            invitedById: userInvited.lastRoleId,
            approvedById: homeUser.lastRoleId,
            userRole: collaborator.role!.name,
            email: email,
            permissions: collaboratorData.permissions
          });

          return collaboratorProGenerate.collaborator!;
        })
      );

      return {
        users,
        project,
        mainContract,
        otherContract,
        collaborators
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      await Promise.all(
        _.map(outputData.collaborators, collaborator =>
          CollaboratorModel.remove.exec(
            client,
            {
              collaboratorId: collaborator.id
            },
            ctx
          )
        )
      );

      await Promise.all(
        _.map(outputData.users, user =>
          UserModel.remove.exec(
            client,
            {
              userId: user.id
            },
            ctx
          )
        )
      );
    });
  });

  // success
  describe('', async () => {
    const ctx = { sql, events: [] };
    let mainContract: ContractDB | undefined;

    let proUser: User | undefined;
    let homeUser: User | undefined;

    let collaboratorReadHome: Collaborator | undefined;

    before(async () => {
      mainContract = _.get(outputData, 'mainContract');

      homeUser = _.find(outputData.users, { email: Email.Home });
      proUser = _.find(outputData.users, { email: Email.Pro });

      collaboratorReadHome = _.find(outputData.collaborators, {
        email: Email.Collaborator + CollaboratorPermission.Read + UserRole.HomeOwner
      });
    });

    after(async () => {
      await getClientTransaction(async client => {
        await CollaboratorModel.update.exec(
          client,
          {
            id: _.get(collaboratorReadHome, 'id')!,
            permissions: _.get(collaboratorReadHome, 'permissions'),
            roleId: _.get(collaboratorReadHome, 'roleId')
          },
          ctx
        );

        await ProjectModel.update.exec(
          client,
          {
            id: _.get(mainContract, 'id')!,
            ownerId: _.get(homeUser, 'lastRoleId')
          },
          ctx
        );
      });
    });

    it('should allow home owner user to switch roles', async () => {
      const { data, errors } = await execQuery<TQuery>(
        SWITCH_ROLES_WITH_COLLABORATOR_MUTATION,
        {
          contractId: _.get(mainContract, 'id'),
          collaboratorId: _.get(collaboratorReadHome, 'id')
        },
        homeUser
      );

      Test.Check.noErrors(errors);

      const result = data?.switchRolesWithCollaborator;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          id: _.get(mainContract, 'id'),
          'project.owner.id': _.get(collaboratorReadHome, 'roleId'),
          'partner.id': _.get(proUser, 'lastRoleId')
        },
        requiredFieldSet
      );

      await getClient(async client => {
        const collaborator = await CollaboratorModel.findById.exec(
          client,
          {
            collaboratorId: _.get(collaboratorReadHome, 'id')!
          },
          ctx
        );
        if (!collaborator) throw GraphQLError.notFound('collaborator');

        Test.Check.data(collaborator, {
          roleId: _.get(homeUser, 'lastRoleId'),
          permissions: CollaboratorPermission.Full
        });
      });
    });
  });

  describe('', async () => {
    const ctx = { sql, events: [] };
    let mainContract: ContractDB | undefined;
    let proUser: User | undefined;
    let collaboratorReadPro: Collaborator | undefined;

    before(async () => {
      mainContract = _.get(outputData, 'mainContract');
      proUser = _.find(outputData.users, { email: Email.Pro });
      collaboratorReadPro = _.find(outputData.collaborators, {
        email: Email.Collaborator + CollaboratorPermission.Read + UserRole.Pro
      });
    });

    after(async () => {
      await getClientTransaction(async client => {
        await CollaboratorModel.update.exec(
          client,
          {
            id: _.get(collaboratorReadPro, 'id')!,
            permissions: _.get(collaboratorReadPro, 'permissions'),
            roleId: _.get(collaboratorReadPro, 'roleId')
          },
          ctx
        );

        await ContractModel.update.exec(
          client,
          {
            id: _.get(mainContract, 'id')!,
            partnerId: _.get(proUser, 'lastRoleId')
          },
          ctx
        );
      });
    });

    it('should allow pro user to switch roles', async () => {
      const { data, errors } = await execQuery<TQuery>(
        SWITCH_ROLES_WITH_COLLABORATOR_MUTATION,
        {
          contractId: _.get(mainContract, 'id'),
          collaboratorId: _.get(collaboratorReadPro, 'id')
        },
        proUser
      );

      Test.Check.noErrors(errors);

      const result = data?.switchRolesWithCollaborator;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          id: _.get(mainContract, 'id'),
          'project.id': _.get(outputData, ['project', 'id']),
          'partner.id': _.get(collaboratorReadPro, 'roleId')
        },
        requiredFieldSet
      );

      await getClient(async client => {
        const collaborator = await CollaboratorModel.findById.exec(
          client,
          {
            collaboratorId: _.get(collaboratorReadPro, 'id')!
          },
          ctx
        );
        if (!collaborator) throw GraphQLError.notFound('collaborator');

        Test.Check.data(collaborator, {
          roleId: _.get(proUser, 'lastRoleId'),
          permissions: CollaboratorPermission.Full
        });
      });
    });
  });

  // error
  it('other user not permitted to switch roles', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    const collaboratorReadPro = _.find(outputData.collaborators, {
      email: Email.Collaborator + CollaboratorPermission.Read + UserRole.Pro
    });

    const { errors } = await execQuery<TQuery>(
      SWITCH_ROLES_WITH_COLLABORATOR_MUTATION,
      {
        contractId: _.get(outputData, ['mainContract', 'id']),
        collaboratorId: _.get(collaboratorReadPro, 'id')
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError('You are not permitted to switch roles.'));
  });

  it(`pro collaborator can't switch role with home owner`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const collaboratorReadPro = _.find(outputData.collaborators, {
      email: Email.Collaborator + CollaboratorPermission.Read + UserRole.Pro
    });

    const { errors } = await execQuery<TQuery>(
      SWITCH_ROLES_WITH_COLLABORATOR_MUTATION,
      {
        contractId: _.get(outputData, ['mainContract', 'id']),
        collaboratorId: _.get(collaboratorReadPro, 'id')
      },
      homeUser
    );

    Test.Check.error(errors, new GraphQLError('You are not permitted to switch roles with this user.'));
  });

  it(`home collaborator can't switch role with partner pro`, async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const collaboratorReadHome = _.find(outputData.collaborators, {
      email: Email.Collaborator + CollaboratorPermission.Read + UserRole.HomeOwner
    });

    const { errors } = await execQuery<TQuery>(
      SWITCH_ROLES_WITH_COLLABORATOR_MUTATION,
      {
        contractId: _.get(outputData, ['mainContract', 'id']),
        collaboratorId: _.get(collaboratorReadHome, 'id')
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError('You are not permitted to switch roles with this user.'));
  });

  describe('', () => {
    const ctx = { sql, events: [] };
    let mainContract: ContractDB | undefined;
    let otherContract: ContractDB | undefined;

    let homeUser: User | undefined;
    let collaboratorFullPro: Collaborator | undefined;

    before(async () => {
      mainContract = _.get(outputData, 'mainContract');
      otherContract = _.get(outputData, 'otherContract');

      homeUser = _.find(outputData.users, { email: Email.Home });
      collaboratorFullPro = _.find(outputData.collaborators, {
        email: Email.Collaborator + CollaboratorPermission.Read + UserRole.Pro
      });
    });

    beforeEach(async () => {
      await getClientTransaction(async client => {
        const collaborator = await CollaboratorModel.findById.exec(
          client,
          {
            collaboratorId: _.get(collaboratorFullPro, 'id')!
          },
          ctx
        );
        if (!collaborator) throw GraphQLError.notFound('collaborator');

        if (collaborator.roleId) {
          await CollaboratorModel.update.exec(
            client,
            {
              id: _.get(collaborator, 'id')!,
              roleId: null
            },
            ctx
          );

          return;
        }

        if (collaborator.contractId === mainContract?.id) {
          await CollaboratorModel.update.exec(
            client,
            {
              id: _.get(collaborator, 'id')!,
              contractId: otherContract?.id
            },
            ctx
          );

          return;
        }
      });
    });

    after(async () => {
      await getClient(async client => {
        await CollaboratorModel.update.exec(
          client,
          {
            id: _.get(collaboratorFullPro, 'id')!,
            roleId: _.get(collaboratorFullPro, 'roleId'),
            contractId: mainContract?.id
          },
          ctx
        );
      });
    });

    it('collaborator must have a role', async () => {
      const { errors } = await execQuery<TQuery>(
        SWITCH_ROLES_WITH_COLLABORATOR_MUTATION,
        {
          contractId: _.get(outputData, ['mainContract', 'id']),
          collaboratorId: _.get(collaboratorFullPro, 'id')
        },
        homeUser
      );

      Test.Check.error(errors, new GraphQLError(`Collaborator not registered yet.`));
    });

    it('collaborator does not belong to the contract', async () => {
      const { errors } = await execQuery<TQuery>(
        SWITCH_ROLES_WITH_COLLABORATOR_MUTATION,
        {
          contractId: _.get(outputData, ['mainContract', 'id']),
          collaboratorId: _.get(collaboratorFullPro, 'id')
        },
        homeUser
      );

      Test.Check.error(errors, new GraphQLError(`Collaborator does not belong to the contract.`));
    });
  });

  it(`collaborator not found`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const collaboratorFullPro = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Read + UserRole.Pro
    });

    const { errors } = await execQuery<TQuery>(
      SWITCH_ROLES_WITH_COLLABORATOR_MUTATION,
      {
        contractId: _.get(outputData, ['mainContract', 'id']),
        collaboratorId: _.get(collaboratorFullPro, 'id')
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('collaborator'));
  });

  it('contract not found', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const collaboratorReadPro = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Read + UserRole.Pro
    });

    const { errors } = await execQuery<TQuery>(
      SWITCH_ROLES_WITH_COLLABORATOR_MUTATION,
      {
        contractId: _.get(homeUser, 'id'),
        collaboratorId: _.get(collaboratorReadPro, 'id')
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('contract'));
  });
});
