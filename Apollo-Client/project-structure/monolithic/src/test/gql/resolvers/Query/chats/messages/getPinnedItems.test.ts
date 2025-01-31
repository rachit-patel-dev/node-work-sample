/*external modules*/
import * as assert from 'assert';
import _ from 'lodash';
/*DB*/
import { UserRole } from '../../../../../../db/types/role';
import { ContractPermissionResult } from '../../../../../../db/types/contract';
import { ChatType } from '../../../../../../db/types/chat';
import { Message } from '../../../../../../db/types/message';
import { getClientTransaction, sql } from '../../../../../../db';
/*models*/
import { UserModel } from '../../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../../../index';
import { GraphQLError } from '../../../../../../gql';
import { MessagesResult } from '../../../../../../gql/resolvers/Types/Chat/Message/MessagesResult';
/*other*/
import { Test } from '../../../../../helpers/Test';

type TQuery = { getPinnedItems: MessagesResult };

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

const requiredFieldSet: Test.TFieldSet<MessagesResult> = {
  object: ['pageInfo'],
  array: ['messages']
};

const GET_PINNED_ITEMS_QUERY = `query ($chatId: ID!, $before: DateTime, $limit: Int) {
  getPinnedItems(chatId: $chatId, before: $before, limit: $limit) {
    messages {
      id
    }

    pageInfo {
      startCursor
      endCursor
      hasMore
    }
  }
}`;

describe('gql/resolvers/Query/chats/members/getPinnedItems', () => {
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
      },
      {
        title: ChatTitle.Group,
        type: ChatType.Group
      }
    ],
    message: {
      pinned: true,
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
          await chatGenerate.addMessage({
            fromId: homeUser.lastRoleId,
            ...inputData.message
          });

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

  // success
  it('should allow to get pinned items', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const groupChat = _.find(outputData.chats, {
      title: ChatTitle.Group
    });

    const { data, errors } = await execQuery<TQuery>(
      GET_PINNED_ITEMS_QUERY,
      {
        chatId: _.get(groupChat, 'id')
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.getPinnedItems;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.requiredFields(requiredFieldSet, result);
  });

  it('should allow to get pinned items using "before" option', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const groupChat = _.find(outputData.chats, {
      title: ChatTitle.Group
    });

    if (!groupChat) throw GraphQLError.notFound('chat');

    if (_.isEmpty(groupChat.messages)) {
      throw GraphQLError.notFound('messages');
    }

    const { data, errors } = await execQuery<TQuery>(
      GET_PINNED_ITEMS_QUERY,
      {
        chatId: _.get(groupChat, 'id'),
        before: _.last(outputData.messages)!.createdAt
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.getPinnedItems;
    if (!result) throw GraphQLError.notFound('data');

    assert.equal(
      _.get(result, ['messages']).length,
      _.get(groupChat, 'messages')!.length - 1,
      'Incorrect amount of messages.'
    );

    Test.Check.requiredFields(requiredFieldSet, result);
  });

  // error
  it('limit must not be negative', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const directChat = _.find(outputData.chats, {
      title: ChatTitle.Direct
    });

    const { errors } = await execQuery<TQuery>(
      GET_PINNED_ITEMS_QUERY,
      {
        chatId: _.get(directChat, 'id'),
        limit: -3
      },
      homeUser
    );

    Test.Check.error(errors, new Error('LIMIT must not be negative'));
  });

  it("other user hasn't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    const directChat = _.find(outputData.chats, {
      title: ChatTitle.Direct
    });

    const { errors } = await execQuery<TQuery>(
      GET_PINNED_ITEMS_QUERY,
      {
        chatId: _.get(directChat, 'id')
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('chat not found', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const { errors } = await execQuery<TQuery>(
      GET_PINNED_ITEMS_QUERY,
      {
        chatId: _.get(homeUser, 'id')
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('chat'));
  });
});
