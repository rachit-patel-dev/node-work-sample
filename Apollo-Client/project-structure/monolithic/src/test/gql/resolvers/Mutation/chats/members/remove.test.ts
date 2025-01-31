/*external modules*/
import _ from 'lodash';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../../db';
import { Role, UserRole } from '../../../../../../db/types/role';
import { Chat as ChatDB, ChatType } from '../../../../../../db/types/chat';
import { User } from '../../../../../../db/types/user';
import { Contract, ContractPermissionResult } from '../../../../../../db/types/contract';
/*models*/
import { ChatModel } from '../../../../../../db/models/ChatModel';
import { UserModel } from '../../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../../..';
import { GraphQLError } from '../../../../../../gql';
import { Chat } from '../../../../../../gql/resolvers/Types/Chat';
/*other*/
import { Test } from '../../../../../helpers/Test';

type TQuery = { removeChatMember: Chat };

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
  chats: Test.TChat[];
  project: Test.TProject;
}

const requiredFieldSet: Test.TFieldSet<Chat> = {
  scalar: ['id', 'title', 'type', 'unreadMessagesCount'],
  object: ['contract', 'owner'],
  array: ['members', 'pinnedItems']
};

const REMOVE_CHAT_MEMBER_MUTATION = `mutation ($chatId: ID!, $memberId: ID!) {
  removeChatMember(chatId: $chatId, memberId: $memberId) {
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

describe('gql/resolvers/Mutation/chats/members/remove', () => {
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
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.Chat
    },
    chats: [
      {
        title: ChatTitle.Direct,
        type: ChatType.Direct
      },
      {
        title: ChatTitle.Group,
        type: ChatType.Group
      },
      {
        title: ChatTitle.General,
        type: ChatType.Group
      }
    ]
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
        name: inputData.contract.name,
        partnerId: proUser.lastRoleId
      });

      const project = projectGenerate.project!;

      const contract = _.find(project.contracts, { name: ContractName.Chat });
      if (!contract) throw GraphQLError.notFound('contract');

      const chats = await Promise.all(
        _.map(inputData.chats, async chatData => {
          const chatGenerate = new Test.ChatGenerate(client, ctx);

          await chatGenerate.create({
            contractId: contract.id,
            ownerId: homeUser.lastRoleId,
            ...chatData
          });
          await chatGenerate.inviteMember({ memberId: homeUser.lastRoleId });

          return chatGenerate.chat!;
        })
      );

      return {
        users,
        project,
        chats
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
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
    let homeUser: User | undefined;
    let proUser: User | undefined;
    let groupChat: ChatDB | undefined;
    let contract: Contract | undefined;

    before(async () => {
      const ctx = { sql, events: [] };

      homeUser = _.find(outputData.users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('owner');

      proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro');

      groupChat = _.find(outputData.chats, { title: ChatTitle.Group });
      if (!groupChat) throw GraphQLError.notFound('chat');

      contract = _.find(outputData.project.contracts, {
        name: ContractName.Chat
      });
      if (!contract) throw GraphQLError.notFound('contract');

      await getClient(async client => {
        await ChatModel.inviteMember.exec(
          client,
          {
            chatId: _.get(groupChat!, 'id'),
            memberId: _.get(proUser!, 'lastRoleId')
          },
          ctx
        );
      });
    });

    after(async () => {
      const ctx = { sql, events: [] };
      await getClientTransaction(async client => {
        await ChatModel.removeMember.exec(
          client,
          {
            chatId: _.get(groupChat!, 'id'),
            memberId: _.get(proUser!, 'lastRoleId')
          },
          ctx
        );

        await ChatModel.inviteMember.exec(
          client,
          {
            chatId: _.get(groupChat!, 'id'),
            memberId: _.get(homeUser!, 'lastRoleId')
          },
          ctx
        );
      });
    });

    it('should allow chat owner to leave a group chat', async () => {
      const ctx = { sql, events: [] };
      const { data, errors } = await execQuery<TQuery>(
        REMOVE_CHAT_MEMBER_MUTATION,
        {
          chatId: _.get(groupChat, 'id'),
          memberId: _.get(homeUser, 'lastRoleId')
        },
        homeUser
      );

      const groupChatAfterQuery = await getClient(async client => {
        return ChatModel.findById.exec(
          client,
          {
            chatId: _.get(groupChat!, 'id')
          },
          ctx
        );
      });

      Test.Check.noErrors(errors, 'error');

      const result = data?.removeChatMember;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(result, {
        'contract.id': _.get(contract, 'id')
      });

      Test.Check.data(groupChatAfterQuery, {
        ownerId: {
          $check: 'equal',
          $value: _.get(proUser, 'lastRoleId'),
          $eMessage: () => 'next chat owner is incorrect'
        }
      });

      Test.Check.requiredFields(requiredFieldSet, result);
    });
  });

  describe('', () => {
    let proUser: User | undefined;
    let groupChat: ChatDB | undefined;
    let contract: Contract | undefined;

    before(async () => {
      const ctx = { sql, events: [] };

      proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro');

      groupChat = _.find(outputData.chats, { title: ChatTitle.Group });
      if (!groupChat) throw GraphQLError.notFound('chat');

      contract = _.find(outputData.project.contracts, {
        name: ContractName.Chat
      });
      if (!contract) throw GraphQLError.notFound('contract');

      await getClient(async client => {
        await ChatModel.inviteMember.exec(
          client,
          {
            chatId: _.get(groupChat!, 'id'),
            memberId: _.get(proUser!, 'lastRoleId')
          },
          ctx
        );
      });
    });

    after(async () => {
      const ctx = { sql, events: [] };
      await getClient(async client => {
        await ChatModel.removeMember.exec(
          client,
          {
            chatId: _.get(groupChat!, 'id'),
            memberId: _.get(proUser!, 'lastRoleId')
          },
          ctx
        );
      });
    });

    it('should allow to leave a group chat', async () => {
      const { data, errors } = await execQuery<TQuery>(
        REMOVE_CHAT_MEMBER_MUTATION,
        {
          chatId: _.get(groupChat, 'id'),
          memberId: _.get(proUser, 'lastRoleId')
        },
        proUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.removeChatMember;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(result, {
        'contract.id': _.get(contract, 'id'),
        members: {
          $check: 'every',
          $value: (member: Role) => _.get(member, 'id') !== _.get(proUser, 'lastRoleId')
        }
      });

      Test.Check.requiredFields(requiredFieldSet, result);
    });
  });

  describe('', () => {
    let homeUser: User | undefined;
    let collaboratorUser: User | undefined;
    let groupChat: ChatDB | undefined;

    let contract: Contract | undefined;

    before(async () => {
      const ctx = { sql, events: [] };

      homeUser = _.find(outputData.users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('owner');

      collaboratorUser = _.find(outputData.users, {
        email: Email.Collaborator
      });
      if (!collaboratorUser) throw GraphQLError.notFound('collaborator');

      groupChat = _.find(outputData.chats, { title: ChatTitle.Group });
      if (!groupChat) throw GraphQLError.notFound('chat');

      contract = _.find(outputData.project!.contracts, {
        name: ContractName.Chat
      });
      if (!contract) throw GraphQLError.notFound('contract');

      await getClient(async client => {
        await ChatModel.inviteMember.exec(
          client,
          {
            chatId: _.get(groupChat!, 'id'),
            memberId: _.get(collaboratorUser!, 'lastRoleId')
          },
          ctx
        );
      });
    });

    it('should allow chat owner to remove collaborator from group chat', async () => {
      const { data, errors } = await execQuery<TQuery>(
        REMOVE_CHAT_MEMBER_MUTATION,
        {
          chatId: _.get(groupChat, 'id'),
          memberId: _.get(collaboratorUser, 'lastRoleId')
        },
        homeUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.removeChatMember;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(result, {
        'contract.id': _.get(contract, 'id'),
        members: {
          $check: 'every',
          $value: (member: Role) => _.get(member, 'id') !== _.get(collaboratorUser, 'lastRoleId')
        }
      });

      Test.Check.requiredFields(requiredFieldSet, result);
    });
  });

  describe('', () => {
    let homeUser: User | undefined;
    let proUser: User | undefined;
    let groupChat: ChatDB | undefined;
    let contract: Contract | undefined;

    before(async () => {
      const ctx = { sql, events: [] };

      homeUser = _.find(outputData.users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('owner');

      proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro');

      groupChat = _.find(outputData.chats, { title: ChatTitle.Group });
      if (!groupChat) throw GraphQLError.notFound('chat');

      contract = _.find(outputData.project!.contracts, {
        name: ContractName.Chat
      });
      if (!contract) throw GraphQLError.notFound('contract');

      await getClient(async client => {
        await ChatModel.inviteMember.exec(
          client,
          {
            chatId: _.get(groupChat!, 'id'),
            memberId: _.get(proUser!, 'lastRoleId')
          },
          ctx
        );
      });
    });

    it('should allow chat owner to remove member from a group chat', async () => {
      const { data, errors } = await execQuery<TQuery>(
        REMOVE_CHAT_MEMBER_MUTATION,
        {
          chatId: _.get(groupChat, 'id'),
          memberId: _.get(proUser, 'lastRoleId')
        },
        homeUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.removeChatMember;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(result, {
        'contract.id': _.get(contract, 'id'),
        members: {
          $check: 'every',
          $value: (member: Role) => _.get(member, 'id') !== _.get(proUser, 'lastRoleId')
        }
      });

      Test.Check.requiredFields(requiredFieldSet, result);
    });
  });

  // error
  it('not a chat member cannot be removed', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    const groupChat = _.find(outputData.chats, { title: ChatTitle.Group });
    if (!groupChat) throw GraphQLError.notFound('chat');

    const { errors } = await execQuery<TQuery>(
      REMOVE_CHAT_MEMBER_MUTATION,
      {
        chatId: _.get(groupChat, 'id'),
        memberId: _.get(proUser, 'lastRoleId')
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('chat member'));
  });

  it('user is not a chat member', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    const groupChat = _.find(outputData.chats, { title: ChatTitle.Group });
    if (!groupChat) throw GraphQLError.notFound('chat');

    const { errors } = await execQuery<TQuery>(
      REMOVE_CHAT_MEMBER_MUTATION,
      {
        chatId: _.get(groupChat, 'id'),
        memberId: _.get(proUser, 'lastRoleId')
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError('You are not a chat member.', 403));
  });

  it('only chat owner can remove members from group chat', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    const groupChat = _.find(outputData.chats, { title: ChatTitle.Group });
    if (!groupChat) throw GraphQLError.notFound('chat');

    const { errors } = await execQuery<TQuery>(
      REMOVE_CHAT_MEMBER_MUTATION,
      {
        chatId: _.get(groupChat, 'id'),
        memberId: _.get(homeUser, 'lastRoleId')
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError('Only chat owner can add/remove members.'));
  });

  it('cannot remove members from "general" chat', async () => {
    const homeUser = _.find(outputData.users, {
      email: Email.Home
    });
    if (!homeUser) throw GraphQLError.notFound('home');

    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    const generalChat = _.find(outputData.chats, { title: ChatTitle.General });
    if (!generalChat) throw GraphQLError.notFound('chat');

    const { errors } = await execQuery<TQuery>(
      REMOVE_CHAT_MEMBER_MUTATION,
      {
        chatId: _.get(generalChat, 'id'),
        memberId: _.get(proUser, 'lastRoleId')
      },
      homeUser
    );

    Test.Check.error(errors, new GraphQLError('You cannot remove members from the "general" chat.'));
  });

  it('chat owner cannot leave "general" chat', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const generalChat = _.find(outputData.chats, { title: ChatTitle.General });
    if (!generalChat) throw GraphQLError.notFound('chat');

    const { errors } = await execQuery<TQuery>(
      REMOVE_CHAT_MEMBER_MUTATION,
      {
        chatId: _.get(generalChat, 'id'),
        memberId: _.get(homeUser, 'lastRoleId')
      },
      homeUser
    );

    Test.Check.error(errors, new GraphQLError('You cannot leave "general" chat.'));
  });

  it('cannot remove member from a direct chat', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });
    if (!directChat) throw GraphQLError.notFound('chat');

    const { errors } = await execQuery<TQuery>(
      REMOVE_CHAT_MEMBER_MUTATION,
      {
        chatId: _.get(directChat, 'id'),
        memberId: _.get(homeUser, 'lastRoleId')
      },
      homeUser
    );

    Test.Check.error(errors, new GraphQLError('You cannot remove member from the direct chat.'));
  });

  it("other user have't access to contract", async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const directChat = _.find(outputData.chats, { type: ChatType.Direct });
    if (!directChat) throw GraphQLError.notFound('chat');

    const { errors } = await execQuery<TQuery>(
      REMOVE_CHAT_MEMBER_MUTATION,
      {
        chatId: _.get(directChat, 'id'),
        memberId: _.get(proUser, 'lastRoleId')
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('chat not found', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const { errors } = await execQuery<TQuery>(
      REMOVE_CHAT_MEMBER_MUTATION,
      {
        chatId: _.get(homeUser, 'id'),
        memberId: _.get(homeUser, 'lastRoleId')
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('chat'));
  });
});
