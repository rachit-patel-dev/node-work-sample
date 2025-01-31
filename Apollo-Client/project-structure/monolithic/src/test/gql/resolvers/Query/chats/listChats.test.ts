/*external modules*/
import * as assert from 'assert';
import _ from 'lodash';
/*DB*/
import { Role, UserRole } from '../../../../../db/types/role';
import { ContractPermissionResult } from '../../../../../db/types/contract';
import { ChatType } from '../../../../../db/types/chat';
import { Message } from '../../../../../db/types/message';
import { getClient, getClientTransaction, sql } from '../../../../../db';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { ChatModel } from '../../../../../db/models/ChatModel';
/*GQL*/
import { execQuery } from '../../../index';
import { GraphQLError } from '../../../../../gql';
import { Chat } from '../../../../../gql/resolvers/Types/Chat';
/*other*/
import { Test } from '../../../../helpers/Test';

type TContractQuery = { getChatListByContract: Chat[] };
type TUserQuery = { getChatListByUser: Chat[] };

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
  messages: Message[];
  project: Test.TProject;
}

const requiredFieldSet: Test.TFieldSet<Chat> = {
  scalar: ['id', 'title', 'type', 'unreadMessagesCount'],
  object: ['contract', 'owner'],
  array: ['members', 'pinnedItems']
};

const GET_CHAT_LIST_BY_CONTRACT_QUERY = `query ($contractId: ID!) {
  getChatListByContract(contractId: $contractId) {
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
const GET_CHAT_LIST_BY_USER_QUERY = `query ($unread: Boolean) {
  getChatListByUser(unread: $unread) {
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

describe('gql/resolvers/Query/chats/listChats', () => {
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
      }
    ],
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: 'Chat'
    },
    chats: [
      {
        title: ChatTitle.Direct,
        type: ChatType.Direct
      }
    ],
    message: {
      text: 'test'
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
          await chatGenerate.inviteMember({ memberId: proUser.lastRoleId });

          if (chatGenerate.chat?.title === ChatTitle.Direct) {
            await chatGenerate.addMessage({
              ...inputData.message,
              fromId: homeUser.lastRoleId
            });
          }

          return chatGenerate.chat!;
        })
      );

      const messages = _.map(chats, chat => chat.messages!).flat();

      return {
        users,
        project,
        chats,
        messages
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      await Promise.all(
        _.map(outputData.users, async user =>
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

  describe('getChatListByContract', () => {
    //success
    it("allow to get contract's chats", async () => {
      const homeUser = _.find(outputData.users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('owner');

      const contract = _.find(outputData.project!.contracts, {
        name: ContractName.Chat
      });

      const { data, errors } = await execQuery<TContractQuery>(
        GET_CHAT_LIST_BY_CONTRACT_QUERY,
        {
          contractId: _.get(contract, 'id')
        },
        homeUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.getChatListByContract;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          members: {
            $check: 'some',
            $value: (member: Role) => member.id === homeUser.lastRoleId,
            $eMessage: 'User is not a chat member.'
          },
          contract: {
            id: _.get(contract, 'id')
          }
        },
        requiredFieldSet
      );
    });

    // error
    it("other user hasn' access to contract", async () => {
      const otherUser = _.find(outputData.users, { email: Email.Other });
      const contract = _.find(outputData.project.contracts, {
        name: ContractName.Chat
      });

      const { errors } = await execQuery<TContractQuery>(
        GET_CHAT_LIST_BY_CONTRACT_QUERY,
        {
          contractId: _.get(contract, 'id')
        },
        otherUser
      );

      Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
    });
  });

  describe('getChatListByUser', () => {
    //success
    it("allow to get user's chats", async () => {
      const homeUser = _.find(outputData.users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('owner');

      const contract = _.find(outputData.project.contracts, {
        name: ContractName.Chat
      });

      let { data, errors } = await execQuery<TUserQuery>(
        GET_CHAT_LIST_BY_USER_QUERY,
        {
          unread: false
        },
        homeUser
      );

      Test.Check.noErrors(errors, 'error');

      let result = data?.getChatListByUser;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          unreadMessagesCount: {
            $check: '>=',
            $value: 0
          }
        },
        requiredFieldSet
      );

      // ----
      const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });
      if (!directChat) throw GraphQLError.notFound('direct chat');

      await getClient(async client => {
        await ChatModel.lastSeenUpdate.exec(
          client,
          {
            memberId: homeUser.lastRoleId,
            lastSeenAt: new Date(Date.now() - 100000),
            chatId: directChat.id
          },
          { events: [], sql }
        );
      });

      ({ data, errors } = await execQuery<TUserQuery>(
        GET_CHAT_LIST_BY_USER_QUERY,
        {
          unread: true
        },
        homeUser
      ));

      Test.Check.noErrors(errors, 'error');

      result = data?.getChatListByUser;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          contract: {
            id: _.get(contract, 'id')
          },
          members: {
            $check: 'some',
            $value: (member: Role) => member.id === homeUser.lastRoleId,
            $eMessage: 'User is not a chat member.'
          }
        },
        requiredFieldSet
      );
    });

    it("other user hasn't chats in the contract he has no access to", async () => {
      const otherUser = _.find(outputData.users, { email: Email.Other });

      const { data } = await execQuery<TUserQuery>(GET_CHAT_LIST_BY_USER_QUERY, {}, otherUser);

      assert.equal(
        _.get(data, 'getChatListByUser')!.length,
        0,
        'other user cannot find chats in a contract he has no access to '
      );
    });
  });
});
