/*external modules*/
import _ from 'lodash';
import moment from 'moment';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Collaborator as CollaboratorDB, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { Invite, InviteType } from '../../../../../db/types/invite';
import { Contract, ContractPermissionResult } from '../../../../../db/types/contract';
/*models*/
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
import { UserModel } from '../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../../index';
import { GraphQLError } from '../../../../../gql';
import { Collaborator } from '../../../../../gql/resolvers/Types/Collaborator';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { declineDeleteCollaborator: Collaborator };

const enum Email {
  Pro = 'proFirst@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  Hired = 'Hired'
}

type PopulatedCollaborator = CollaboratorDB & {
  invite: Invite;
};
type PopulatedContract = Contract & {
  collaborators: PopulatedCollaborator[];
};
interface OutputData {
  users: Test.TUser[];
  contract: PopulatedContract;
}

const requiredFieldSet: Test.TFieldSet<Collaborator> = {
  scalar: ['id', 'permissions', 'invitedById', 'contractId', 'createdAt', 'updatedAt'],
  object: ['invitedBy', 'contract'],
  array: []
};

const DECLINE_DELETE_COLLABORATOR_MUTATION = `mutation ($collaboratorId: ID!) {
  declineDeleteCollaborator(collaboratorId: $collaboratorId) {
    id
    permissions
    invitedById
    contractId
    createdAt
    updatedAt

    roleId
    inviteId
    approvedById
    requestedToDeleteById
    email
    userRole
    inviteStatus

    invitedBy {
      id
      name
    }
    contract {
      id
      name
    }

    role {
      id
      name
    }
    invite {
      id
      email
    }
    approvedBy {
      id
      name
    }
    requestedToDeleteBy {
      id
      name
    }
  }
}`;

describe('gql/resolvers/Mutation/collaborators/declineDelete', () => {
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
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner,
        role: {
          name: UserRole.HomeOwner
        }
      },
      {
        email: Email.Collaborator + CollaboratorPermission.Read + UserRole.HomeOwner,
        role: {
          name: UserRole.HomeOwner
        }
      },
      {
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.Pro,
        role: {
          name: UserRole.Pro
        }
      }
    ],
    collaborators: [
      {
        permissions: CollaboratorPermission.Full,
        invite: {
          firstName: 'test full home',
          lastName: 'test full home last',
          inviteMessage: 'test full home message',
          type: InviteType.ProjectOwnerInvite,
          userRole: UserRole.HomeOwner
        }
      },
      {
        permissions: CollaboratorPermission.Read,
        invite: {
          firstName: 'test read home',
          lastName: 'test read home last',
          inviteMessage: 'test full read message',
          type: InviteType.ProjectOwnerInvite,
          userRole: UserRole.HomeOwner
        },
        $requestedToDeleteBy: Email.Home
      },
      {
        permissions: CollaboratorPermission.Full,
        invite: {
          firstName: 'test full pro',
          lastName: 'test full pro last',
          inviteMessage: 'test full read message',
          type: InviteType.ProjectProInvite,
          userRole: UserRole.Pro
        },
        $requestedToDeleteBy: Email.Home
      }
    ],
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.Hired
    }
  };

  before(async () => {
    const ctx = { sql, events: [] };

    outputData = await getClientTransaction(async client => {
      const users = await Promise.all(
        _.map(inputData.users, async userData => {
          const userGenerate = new Test.UserGenerate(client, ctx);

          await userGenerate.create(_.omit(userData, ['role']));
          if (userData.role) await userGenerate.setRole({ name: userData.role.name });

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
        name: inputData.contract.name,
        partnerId: proUser.lastRoleId
      });

      const project = projectGenerate.project!;

      const contract = _.find(project.contracts, { name: ContractName.Hired });
      if (!contract) throw GraphQLError.notFound('contract');

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

          const collaboratorUser = _.find(users, { email });
          if (!collaboratorUser) throw GraphQLError.notFound('collaborator');

          let requesterToDeleteUser: Test.TUser | undefined;
          if (collaboratorData.$requestedToDeleteBy) {
            requesterToDeleteUser = _.find(users, { email: collaboratorData.$requestedToDeleteBy });
          }

          const inviteGenerate = new Test.InviteGenerate(client, ctx);
          await inviteGenerate.create({
            ...collaboratorData.invite,
            email: email,
            invitedById: userInvited.lastRoleId
          });

          const invite = inviteGenerate.invite!;

          const collaboratorGenerate = new Test.CollaboratorGenerate(client, ctx);
          await collaboratorGenerate.create({
            roleId: collaboratorUser.lastRoleId,
            inviteId: invite.id,
            contractId: contract.id,
            invitedById: userInvited.lastRoleId,
            approvedById: homeUser.lastRoleId,
            userRole: invite.userRole,
            email: email,
            permissions: collaboratorData.permissions,
            requestedToDeleteById: requesterToDeleteUser?.lastRoleId
          });

          const collaborator = collaboratorGenerate.collaborator!;

          return {
            ...collaborator,
            invite
          };
        })
      );

      return {
        users,
        contract: {
          ...contract,
          collaborators
        }
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      await Promise.all(
        _.map(outputData.contract.collaborators, collaborator =>
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

  // error
  it(`cannot decline delete collaborator with different role`, async () => {
    const contract = outputData.contract;

    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const collaboratorReadHome = _.find(contract.collaborators, {
      email: Email.Collaborator + CollaboratorPermission.Read + UserRole.HomeOwner
    });
    if (!collaboratorReadHome) throw GraphQLError.notFound('collaborator home');

    const { errors } = await execQuery<TQuery>(
      DECLINE_DELETE_COLLABORATOR_MUTATION,
      {
        collaboratorId: collaboratorReadHome.id
      },
      proUser
    );

    Test.Check.error(
      errors,
      new GraphQLError(
        `You cannot decline to delete collaborator with another role because you are ${proUser.role!.name}`,
        403
      )
    );
  });

  it(`collaborator not requested to delete`, async () => {
    const contract = outputData.contract;

    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const collaboratorFullHome = _.find(contract.collaborators, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });
    if (!collaboratorFullHome) throw GraphQLError.notFound('collaborator home');

    const { errors } = await execQuery<TQuery>(
      DECLINE_DELETE_COLLABORATOR_MUTATION,
      {
        collaboratorId: collaboratorFullHome.id
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError(`Collaborator not requested to delete`));
  });

  it(`other user haven't access`, async () => {
    const contract = outputData.contract;

    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('other user');

    const collaboratorFullHome = _.find(contract.collaborators, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });
    if (!collaboratorFullHome) throw GraphQLError.notFound('collaborator home');

    const { errors } = await execQuery<TQuery>(
      DECLINE_DELETE_COLLABORATOR_MUTATION,
      {
        collaboratorId: collaboratorFullHome.id
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it(`collaborator not found`, async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('other user');

    const { errors } = await execQuery<TQuery>(
      DECLINE_DELETE_COLLABORATOR_MUTATION,
      {
        collaboratorId: otherUser.id
      },
      otherUser
    );

    Test.Check.error(errors, GraphQLError.notFound('collaborator'));
  });

  it(`role not found`, async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('other user');

    const { errors } = await execQuery<TQuery>(
      DECLINE_DELETE_COLLABORATOR_MUTATION,
      {
        collaboratorId: otherUser.id
      },
      {
        ...otherUser,
        lastRoleId: otherUser.id
      }
    );

    Test.Check.error(errors, GraphQLError.notFound('role'));
  });

  // success
  it('should allow to decline delete collaborator', async () => {
    const contract = outputData.contract;

    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro user');

    const collaboratorFullPro = _.find(contract.collaborators, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.Pro
    });
    if (!collaboratorFullPro) throw GraphQLError.notFound('collaborator pro');

    const { data, errors } = await execQuery<TQuery>(
      DECLINE_DELETE_COLLABORATOR_MUTATION,
      {
        collaboratorId: collaboratorFullPro.id
      },
      proUser
    );

    Test.Check.noErrors(errors);

    const result = data?.declineDeleteCollaborator;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result as Collaborator,
      {
        id: collaboratorFullPro.id,
        permissions: collaboratorFullPro.permissions,
        invitedById: collaboratorFullPro.invitedById,
        contractId: contract.id,
        createdAt: {
          $check: '==',
          $value: new Date(),
          $func: (date: Date) => moment(date).format('YYYY.MM.DD HH:mm')
        },
        updatedAt: {
          $check: '==',
          $value: new Date(),
          $func: (date: Date) => moment(date).format('YYYY.MM.DD HH:mm')
        },
        invitedBy: {
          id: proUser.lastRoleId,
          name: proUser.role!.name
        },
        contract: {
          id: contract.id,
          name: contract.name
        },
        requestedToDeleteById: {
          $check: '===',
          $value: null
        }
      },
      requiredFieldSet
    );
  });
});
