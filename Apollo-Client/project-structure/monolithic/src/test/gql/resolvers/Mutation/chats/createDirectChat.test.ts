/*external modules*/
import _ from 'lodash';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Chat as ChatDB, ChatType } from '../../../../../db/types/chat';
import { Contract, ContractPermissionResult } from '../../../../../db/types/contract';
import { Collaborator, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
/*models*/
import { ChatModel } from '../../../../../db/models/ChatModel';
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
import { UserModel } from '../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { Chat } from '../../../../../gql/resolvers/Types/Chat';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { createDirectChat: Chat };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ChatTitle {
  Direct = 'direct',
  Group = 'group',
  General = 'general'
}
const enum ContractName {
  Chat = 'Chat'
}

interface OutputData {
  users: Test.TUser[];
  project: Test.TProject;
  collaborator: Collaborator;
}

const requiredFieldSet: Test.TFieldSet<Chat> = {
  scalar: ['id', 'title', 'type', 'unreadMessagesCount'],
  object: ['contract', 'owner'],
  array: ['members', 'pinnedItems']
};

const CREATE_DIRECT_CHAT_MUTATION = `mutation ($contractId: ID!, $otherMemberRoleId: ID!) {
  createDirectChat(contractId: $contractId, otherMemberRoleId: $otherMemberRoleId) {
      id
      title
      type
      unreadMessagesCount

      contract {
        id
      }
      owner {
        id
      }
      members {
        id
      }
      pinnedItems {
        id
      }
  }
}`;

describe('gql/resolvers/Mutation/chats/createDirectChat', () => {
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
        email: Email.Collaborator,
        role: {
          name: UserRole.Pro
        }
      }
    ],
    collaborator: {
      permissions: CollaboratorPermission.Read
    },
    invite: {
      firstName: 'test',
      inviteMessage: 'test message',
      type: InviteType.ContractCollaborator,
      userRole: UserRole.Pro
    },
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.Chat
    },
    directChat: {
      title: ChatTitle.Direct,
      type: ChatType.Direct
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

      const collaboratorUser = _.find(users, { email: Email.Collaborator });
      if (!collaboratorUser) throw GraphQLError.notFound('collaborator');

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
      const contract = _.find(project.contracts, { name: ContractName.Chat });
      if (!contract) throw GraphQLError.notFound('contract');

      const inviteGenerate = new Test.InviteGenerate(client, ctx);
      await inviteGenerate.create({
        ...inputData.invite,
        email: Email.Collaborator,
        invitedById: homeUser.lastRoleId
      });

      const invite = inviteGenerate.invite!;

      const collaboratorGenerate = new Test.CollaboratorGenerate(client, ctx);
      await collaboratorGenerate.create({
        roleId: collaboratorUser.lastRoleId,
        inviteId: invite.id,
        contractId: contract.id,
        invitedById: proUser.lastRoleId,
        approvedById: homeUser.lastRoleId,
        userRole: collaboratorUser.role!.name,
        email: Email.Collaborator,
        ...inputData.collaborator
      });

      const collaborator = collaboratorGenerate.collaborator!;

      return {
        users,
        project,
        collaborator
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      await CollaboratorModel.remove.exec(
        client,
        {
          collaboratorId: outputData.collaborator.id
        },
        ctx
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
  it('should allow to create a direct chat', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const proUser = _.find(outputData.users, { email: Email.Pro });

    const contract = _.find(outputData.project.contracts, {
      name: ContractName.Chat
    });

    const { data, errors } = await execQuery<TQuery>(
      CREATE_DIRECT_CHAT_MUTATION,
      {
        contractId: _.get(contract, 'id'),
        otherMemberRoleId: _.get(proUser, 'lastRoleId')
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.createDirectChat;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(result, {
      'owner.id': _.get(homeUser, 'lastRoleId'),
      'contract.id': _.get(contract, 'id')
    });

    Test.Check.requiredFields(requiredFieldSet, result);
  });

  it('should allow collaborator to create a direct chat with a user who invited him', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const collaboratorUser = _.find(outputData.users, {
      email: Email.Collaborator
    });

    const contract = _.find(outputData.project.contracts, {
      name: ContractName.Chat
    });

    const { data, errors } = await execQuery<TQuery>(
      CREATE_DIRECT_CHAT_MUTATION,
      {
        contractId: _.get(contract, 'id'),
        otherMemberRoleId: _.get(proUser, 'lastRoleId')
      },
      collaboratorUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.createDirectChat;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(result, {
      'owner.id': _.get(collaboratorUser, 'lastRoleId'),
      'contract.id': _.get(contract, 'id')
    });

    Test.Check.requiredFields(requiredFieldSet, result);
  });

  // error
  it("other user have't access to contract", async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const otherUser = _.find(outputData.users, { email: Email.Other });

    const contract = _.find(outputData.project.contracts, {
      name: ContractName.Chat
    });

    const { errors } = await execQuery<TQuery>(
      CREATE_DIRECT_CHAT_MUTATION,
      {
        contractId: _.get(contract, 'id'),
        otherMemberRoleId: _.get(homeUser, 'lastRoleId')
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('user who did not invite the read-only collaborator cannot create chat with him', async () => {
    const proUser = _.find(outputData.users, { email: Email.Home });
    const collaboratorUser = _.find(outputData.users, {
      email: Email.Collaborator
    });

    const contract = _.find(outputData.project.contracts, {
      name: ContractName.Chat
    });

    const { errors } = await execQuery<TQuery>(
      CREATE_DIRECT_CHAT_MUTATION,
      {
        contractId: _.get(contract, 'id'),
        otherMemberRoleId: _.get(collaboratorUser, 'lastRoleId')
      },
      proUser
    );

    Test.Check.error(
      errors,
      new GraphQLError('You cannot direct message to the read-only collaborator, who is not invited by you.')
    );
  });

  it('cannot create direct chat with yourself', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const contract = _.find(outputData.project.contracts, {
      name: ContractName.Chat
    });

    const { errors } = await execQuery<TQuery>(
      CREATE_DIRECT_CHAT_MUTATION,
      {
        contractId: _.get(contract, 'id'),
        otherMemberRoleId: _.get(homeUser, 'lastRoleId')
      },
      homeUser
    );

    Test.Check.error(errors, new GraphQLError(`You cannot create direct chat with yourself.`));
  });

  describe('', () => {
    const ctx = { sql, events: [] };
    let proUser: Test.TUser | undefined;
    let homeUser: Test.TUser | undefined;

    let directChat: ChatDB | undefined;
    let contract: Contract | undefined;

    before(async () => {
      homeUser = _.find(outputData.users, { email: Email.Home });
      proUser = _.find(outputData.users, { email: Email.Pro });
      contract = _.find(outputData.project.contracts, {
        name: ContractName.Chat
      });

      await getClientTransaction(async client => {
        directChat = await ChatModel.create.exec(
          client,
          {
            contractId: _.get(contract!, 'id'),
            ownerId: _.get(homeUser!, 'lastRoleId'),
            type: _.get(inputData, ['directChat', 'type'])
          },
          ctx
        );

        await ChatModel.inviteMemberBulk.exec(
          client,
          [
            {
              chatId: _.get(directChat, 'id'),
              memberId: _.get(homeUser!, 'lastRoleId')
            },
            {
              chatId: _.get(directChat, 'id'),
              memberId: _.get(proUser!, 'lastRoleId')
            }
          ],
          ctx
        );
      });
    });

    it('cannot create another direct chat with same user in the same contract', async () => {
      const { errors } = await execQuery<TQuery>(
        CREATE_DIRECT_CHAT_MUTATION,
        {
          contractId: _.get(contract, 'id'),
          otherMemberRoleId: _.get(proUser, 'lastRoleId')
        },
        homeUser
      );

      Test.Check.error(errors, new GraphQLError(`Direct chat with this user already exists in this contract.`));
    });
  });
});
