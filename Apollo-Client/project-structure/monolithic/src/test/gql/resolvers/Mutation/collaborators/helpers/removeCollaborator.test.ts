/*external modules*/
import _ from 'lodash';
import mock from 'mock-require';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../../db';
import { Collaborator, CollaboratorPermission } from '../../../../../../db/types/collaborator';
import { Contract } from '../../../../../../db/types/contract';
import { Invite, InviteType } from '../../../../../../db/types/invite';
import { UserRole } from '../../../../../../db/types/role';
import { Chat, ChatType } from '../../../../../../db/types/chat';
import { ContractActivityType } from '../../../../../../db/types/contractActivity';
/*models*/
import { CollaboratorModel } from '../../../../../../db/models/CollaboratorModel';
import { UserModel } from '../../../../../../db/models/UserModel';
import { ChatModel } from '../../../../../../db/models/ChatModel';
/*GQL*/
import { GraphQLError } from '../../../../../../gql';
/*other*/
import { Test } from '../../../../../helpers/Test';

let { default: jobWorker } = require('../../../../../../jobs'); // eslint-disable-line
let {
  removeCollaborator
} = require('../../../../../../gql/resolvers/Mutation/collaborators/helpers/removeCollaborator'); // eslint-disable-line

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ChatTitle {
  General = 'general'
}
const enum ContractName {
  Collaborator = 'Collaborator'
}

type PopulatedCollaborator = Collaborator & {
  invite: Invite;
};
type PopulatedContract = Contract & {
  collaborators: PopulatedCollaborator[];
  generalChat: Chat;
};

interface OutputData {
  users: Test.TUser[];
  contract: PopulatedContract;
}

describe('gql/resolvers/Mutation/collaborators/helpers/removeCollaborator', () => {
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
        firstName: 'test first name',
        lastName: 'test last name',
        role: {
          name: UserRole.HomeOwner
        }
      },
      {
        email: Email.Collaborator + CollaboratorPermission.Read + UserRole.HomeOwner
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
        }
      }
    ],
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.Collaborator,
      generalChat: {
        title: ChatTitle.General,
        type: ChatType.Group
      }
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

      const contract = _.find(project.contracts, {
        name: ContractName.Collaborator
      });
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
            permissions: collaboratorData.permissions
          });

          const collaborator = collaboratorGenerate.collaborator!;

          return {
            ...collaborator,
            invite
          };
        })
      );

      const chatGenerate = new Test.ChatGenerate(client, ctx);
      await chatGenerate.create({
        contractId: contract.id,
        ownerId: homeUser.lastRoleId,
        ...inputData.contract.generalChat
      });
      await Promise.all(
        _.map(_.filter(users, 'lastRoleId'), user => chatGenerate.inviteMember({ memberId: user.lastRoleId }))
      );

      const generalChat = chatGenerate.chat!;

      return {
        users,
        contract: {
          ...contract,
          collaborators,
          generalChat
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

  // success
  describe('', () => {
    let contract: PopulatedContract | undefined;
    let collaboratorFullHome: PopulatedCollaborator | undefined;
    let proUser: Test.TUser | undefined;
    let userCollaboratorFullHome: Test.TUser | undefined;

    let jobData: any | undefined;
    const mockJobWorker = {
      getQueue(name: string) {
        if (name === 'create-contract-activity') {
          return this;
        }

        throw new GraphQLError(`in getQueue. "name" must be equal 'create-contract-activity'.`);
      },
      add(data: any) {
        jobData = data;
      }
    };

    before(async () => {
      contract = outputData.contract;

      collaboratorFullHome = _.find(contract.collaborators, {
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
      });
      if (!collaboratorFullHome) throw GraphQLError.notFound('collaborator home');

      userCollaboratorFullHome = _.find(outputData.users, {
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
      });
      if (!userCollaboratorFullHome) throw GraphQLError.notFound('user collaborator home');

      proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro');

      mock('../../../../../../jobs', mockJobWorker);
      ({ default: jobWorker } = mock.reRequire('../../../../../../jobs'));
      ({ removeCollaborator } = mock.reRequire(
        '../../../../../../gql/resolvers/Mutation/collaborators/helpers/removeCollaborator'
      ));
    });

    after(async () => {
      mock.stopAll();
    });

    it('should allow to remove collaborator with role', async () => {
      try {
        const ctx = {
          sql,
          events: [],
          currentUser: proUser
        };
        const args = {
          contractId: contract!.id,
          collaboratorId: collaboratorFullHome!.id
        };

        const result = await getClientTransaction(client => removeCollaborator(client, args, ctx));
        await Promise.all(_.map(ctx.events as any[], event => event()));

        Test.Check.data(result, {
          id: collaboratorFullHome!.id,
          deleted: true
        });

        await getClient(async client => {
          if (!jobData) throw GraphQLError.notFound(' job data');
          Test.Check.data(jobData, {
            type: ContractActivityType.CollaboratorDeleted,
            contractId: contract!.id,
            roleId: proUser!.lastRoleId,
            permissions: collaboratorFullHome!.permissions,
            role: userCollaboratorFullHome!.role!.name,
            email: userCollaboratorFullHome!.email,
            name: `${userCollaboratorFullHome!.firstName} ${userCollaboratorFullHome!.lastName}`
          });

          const isChatMember = await ChatModel.isChatMember.exec(
            client,
            {
              chatId: contract!.generalChat.id,
              memberId: userCollaboratorFullHome!.lastRoleId
            },
            ctx
          );
          if (isChatMember) throw new GraphQLError(`Collaborator must be removed from all chats`);
        });
      } catch (error) {
        Test.Check.noErrors(error);
      }
    });
  });

  describe('', () => {
    let contract: PopulatedContract | undefined;
    let collaboratorReadHome: PopulatedCollaborator | undefined;
    let proUser: Test.TUser | undefined;
    let userCollaboratorReadHome: Test.TUser | undefined;

    let jobData: any | undefined;
    const mockJobWorker = {
      getQueue(name: string) {
        if (name === 'create-contract-activity') {
          return this;
        }

        throw new GraphQLError(`in getQueue. "name" must be equal 'create-contract-activity'.`);
      },
      add(data: any) {
        jobData = data;
      }
    };

    before(async () => {
      contract = outputData.contract;

      collaboratorReadHome = _.find(contract.collaborators, {
        email: Email.Collaborator + CollaboratorPermission.Read + UserRole.HomeOwner
      });
      if (!collaboratorReadHome) throw GraphQLError.notFound('collaborator home');

      userCollaboratorReadHome = _.find(outputData.users, {
        email: Email.Collaborator + CollaboratorPermission.Read + UserRole.HomeOwner
      });
      if (!userCollaboratorReadHome) throw GraphQLError.notFound('user collaborator home');

      proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro');

      mock('../../../../../../jobs', mockJobWorker);
      ({ default: jobWorker } = mock.reRequire('../../../../../../jobs')); // eslint-disable-line
      ({ removeCollaborator } = mock.reRequire(
        '../../../../../../gql/resolvers/Mutation/collaborators/helpers/removeCollaborator'
      ));
    });

    after(async () => {
      mock.stopAll();
    });

    it('should allow to remove collaborator without role', async () => {
      try {
        const ctx = {
          sql,
          events: [],
          currentUser: proUser
        };
        const args = {
          contractId: contract!.id,
          collaboratorId: collaboratorReadHome!.id
        };

        const result = await getClientTransaction(client => removeCollaborator(client, args, ctx));
        await Promise.all(_.map(ctx.events as any[], event => event()));

        Test.Check.data(result, {
          id: collaboratorReadHome!.id,
          deleted: true
        });

        if (!jobData) throw GraphQLError.notFound(' job data');
        Test.Check.data(jobData, {
          type: ContractActivityType.CollaboratorDeleted,
          contractId: contract!.id,
          roleId: proUser!.lastRoleId,
          permissions: collaboratorReadHome!.permissions,
          role: collaboratorReadHome!.invite.userRole,
          email: collaboratorReadHome!.invite.email,
          name: collaboratorReadHome!.invite.firstName
        });
      } catch (error) {
        Test.Check.noErrors(error);
      }
    });
  });

  // error
  it('owner by contract not found', async () => {
    const contract = outputData.contract;

    const collaboratorFullHome = _.find(contract.collaborators, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });
    if (!collaboratorFullHome) throw GraphQLError.notFound('collaborator home');

    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    try {
      const ctx = {
        sql,
        events: [],
        currentUser: proUser
      };
      const args = {
        contractId: proUser.id,
        collaboratorId: collaboratorFullHome.id
      };
      await getClientTransaction(client => removeCollaborator(client, args, ctx));
    } catch (error) {
      Test.Check.error(error, GraphQLError.notFound('owner'));
    }
  });

  it('collaborator not found', async () => {
    const contract = outputData.contract;

    const collaboratorFullHome = _.find(contract.collaborators, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });
    if (!collaboratorFullHome) throw GraphQLError.notFound('collaborator home');

    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    try {
      const ctx = {
        sql,
        events: [],
        currentUser: proUser
      };
      const args = {
        contractId: contract.id,
        collaboratorId: proUser.lastRoleId
      };
      await getClientTransaction(client => removeCollaborator(client, args, ctx));
    } catch (error) {
      Test.Check.error(error, GraphQLError.notFound('collaborator'));
    }
  });

  it('role not found', async () => {
    const contract = outputData.contract;

    const collaboratorFullHome = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });
    if (!collaboratorFullHome) throw GraphQLError.notFound('collaborator home');

    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    try {
      const ctx = {
        sql,
        events: [],
        currentUser: {
          ...proUser,
          lastRoleId: contract.id
        }
      };
      const args = {
        contractId: contract.id,
        collaboratorId: collaboratorFullHome.lastRoleId
      };
      await getClientTransaction(client => removeCollaborator(client, args, ctx));
    } catch (error) {
      Test.Check.error(error, GraphQLError.notFound('role'));
    }
  });
});
