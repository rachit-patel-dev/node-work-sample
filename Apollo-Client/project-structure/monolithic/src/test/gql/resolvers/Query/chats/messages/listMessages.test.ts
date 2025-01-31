/*external modules*/
import * as assert from 'assert';
import _ from 'lodash';
import moment = require('moment');
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
import { UnionMessagesResult } from '../../../../../../gql/resolvers/Types/Chat/Message/MessagesResult';
/*other*/
import { Test } from '../../../../../helpers/Test';

type TQuery = { listMessages: UnionMessagesResult };

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

const requiredFieldSet: Test.TFieldSet<UnionMessagesResult> = {
  object: ['pageInfo'],
  array: ['messages']
};

const GET_MESSAGES_QUERY = `query ($chatId: ID!, $before: DateTime, $limit: Int!, $tags: [String!], $pinned: Boolean, $hashtag: String) {
  listMessages(
    chatId: $chatId,
    before: $before,
    limit: $limit,
    tags: $tags,
    pinned: $pinned,
    hashtag: $hashtag
  ) {
    messages {
        __typename
      ... on Message{
        id
        chatId
        text
        createdAt
        pinned
        tags
      }
      ... on SystemMessage{
        id
        chatId
        text
        createdAt
      }
    }
    pageInfo {
      startCursor
      endCursor
      hasMore
    }
  }
}`;

describe('gql/resolvers/Query/chats/messages/listMessages', () => {
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
      }
    ],
    message: {
      text: 'test',
      tags: ['a', 'b'],
      hashtag: '#hash'
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

          const isGroup = chatGenerate.chat!.title === ChatTitle.Group;
          const tags = isGroup ? { tags: inputData.message.tags } : {};

          const MessageData = {
            ...inputData.message,
            text: isGroup ? ' hash ' + inputData.message.text : inputData.message.text,
            pinned: !isGroup,
            ...tags
          };

          await chatGenerate.addMessage({
            ...MessageData,
            fromId: homeUser.lastRoleId
          });
          await chatGenerate.addMessage({
            ...MessageData,
            fromId: proUser.lastRoleId
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
  it('should allow to get my messages', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    const limit = 1;

    let { data, errors } = await execQuery<TQuery>(
      GET_MESSAGES_QUERY,
      {
        chatId: _.get(directChat, 'id'),
        limit
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    let result = data?.listMessages;
    if (!result) throw GraphQLError.notFound('data');

    assert.equal(_.get(result, ['messages']).length, limit, 'Incorrect amount of messages.');

    Test.Check.data(result, {
      'pageInfo.hasMore': true,
      messages: {
        $check: 'forEach',
        chatId: {
          $check: 'equal',
          $value: _.get(directChat, 'id'),
          $eMessage: 'Incorrect message chat.'
        }
      }
    });

    Test.Check.requiredFields(requiredFieldSet, result);

    // ---
    const limitInDirectChat = _.get(directChat, 'messages')!.length;

    ({ data, errors } = await execQuery<TQuery>(
      GET_MESSAGES_QUERY,
      {
        chatId: _.get(directChat, 'id'),
        limit: limitInDirectChat
      },
      homeUser
    ));

    Test.Check.noErrors(errors, 'error');

    result = data?.listMessages;
    if (!result) throw GraphQLError.notFound('data');

    assert.equal(_.get(result, ['messages']).length, limitInDirectChat, 'Incorrect amount of messages.');
    assert.equal(_.get(data, ['listMessages', 'pageInfo', 'hasMore']), false);

    Test.Check.requiredFields(requiredFieldSet, result);
  });

  it('should allow to get my messages with "before" options', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    const limitInDirectChat = _.get(directChat, 'messages')!.length;

    const { data, errors } = await execQuery<TQuery>(
      GET_MESSAGES_QUERY,
      {
        chatId: _.get(directChat, 'id'),
        before: moment(_.last(directChat!.messages)!.createdAt)
          .add(1, 'minutes')
          .toDate(),
        limit: limitInDirectChat
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.listMessages;
    if (!result) throw GraphQLError.notFound('data');

    assert.equal(_.get(result, ['messages']).length, limitInDirectChat, 'Incorrect amount of messages.');

    Test.Check.data(result, {
      'pageInfo.hasMore': false,
      messages: {
        $check: 'forEach',
        chatId: {
          $check: 'equal',
          $value: _.get(directChat, 'id'),
          $eMessage: 'Incorrect message chat.'
        }
      }
    });

    Test.Check.requiredFields(requiredFieldSet, result);
  });

  it('should allow to get my messages with "pinned" options', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });
    const groupChat = _.find(outputData.chats, { title: ChatTitle.Group });

    const limitInDirectChat = _.get(directChat, 'messages')!.length;

    let { data, errors } = await execQuery<TQuery>(
      GET_MESSAGES_QUERY,
      {
        chatId: _.get(directChat, 'id'),
        pinned: true,
        limit: limitInDirectChat
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    let result = data?.listMessages;
    if (!result) throw GraphQLError.notFound('data');

    assert.equal(_.get(result, ['messages']).length, limitInDirectChat, 'Incorrect amount of messages.');

    Test.Check.data(result, {
      'pageInfo.hasMore': false,
      messages: {
        $check: 'forEach',
        pinned: {
          $check: 'equal',
          $value: true,
          $eMessage: 'Message not pinned.'
        },
        chatId: {
          $check: 'equal',
          $value: _.get(directChat, 'id'),
          $eMessage: 'Incorrect message chat.'
        }
      }
    });

    Test.Check.requiredFields(requiredFieldSet, result);

    // ---
    const limitInGroupChat = _.get(groupChat, 'messages')!.length;

    ({ data, errors } = await execQuery<TQuery>(
      GET_MESSAGES_QUERY,
      {
        chatId: _.get(groupChat, 'id'),
        pinned: true,
        limit: limitInGroupChat
      },
      homeUser
    ));

    Test.Check.noErrors(errors, 'error');

    result = data?.listMessages;
    if (!result) throw GraphQLError.notFound('data');

    assert.equal(_.get(result, ['messages']).length, 0, 'Incorrect amount of messages.');

    Test.Check.data(result, {
      'pageInfo.hasMore': false
    });

    Test.Check.requiredFields(requiredFieldSet, result);
  });

  it('should allow to get my messages with "tags" options', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const groupChat = _.find(outputData.chats, { title: ChatTitle.Group });

    const limitInGroupChat = _.get(groupChat, 'messages')!.length;

    const { data, errors } = await execQuery<TQuery>(
      GET_MESSAGES_QUERY,
      {
        chatId: _.get(groupChat, 'id'),
        tags: _.get(inputData, ['message', 'tags']),
        limit: limitInGroupChat
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.listMessages;
    if (!result) throw GraphQLError.notFound('data');

    assert.equal(_.get(result, ['messages']).length, limitInGroupChat, 'Incorrect amount of messages.');

    _.forEach(result.messages, message => {
      assert.ok(
        !_.difference(_.get(message, 'tags'), _.get(inputData, ['message', 'tags'])).length,
        'Message tags not equal.'
      );
    });

    Test.Check.data(result, {
      'pageInfo.hasMore': false,
      messages: {
        $check: 'forEach',
        chatId: {
          $check: 'equal',
          $value: _.get(groupChat, 'id'),
          $eMessage: 'Incorrect message chat.'
        }
      }
    });

    Test.Check.requiredFields(requiredFieldSet, result);
  });

  it('should allow to get my messages with "hashtag" options', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const groupChat = _.find(outputData.chats, { title: ChatTitle.Group });

    const limitInGroupChat = _.get(groupChat, 'messages')!.length;

    const { data, errors } = await execQuery<TQuery>(
      GET_MESSAGES_QUERY,
      {
        chatId: _.get(groupChat, 'id'),
        hashtag: _.get(inputData, ['message', 'hashtag']),
        limit: limitInGroupChat
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.listMessages;
    if (!result) throw GraphQLError.notFound('data');
    const hashText = ' hash ' + _.get(inputData, ['message', 'text']);

    assert.equal(_.get(result, ['messages']).length, limitInGroupChat, 'Incorrect amount of messages.');

    Test.Check.data(result, {
      'pageInfo.hasMore': false,
      messages: {
        $check: 'forEach',
        text: {
          $check: 'equal',
          $value: hashText,
          $eMessage: 'No hashtag in the message.'
        },
        chatId: {
          $check: 'equal',
          $value: _.get(groupChat, 'id'),
          $eMessage: 'Incorrect message chat.'
        }
      }
    });

    Test.Check.requiredFields(requiredFieldSet, result);
  });

  // error
  it('limit must not be negative', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    const { errors } = await execQuery<TQuery>(
      GET_MESSAGES_QUERY,
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
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    const { errors } = await execQuery<TQuery>(
      GET_MESSAGES_QUERY,
      {
        chatId: _.get(directChat, 'id'),
        limit: 10
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('chat not found', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const { errors } = await execQuery<TQuery>(
      GET_MESSAGES_QUERY,
      {
        chatId: _.get(homeUser, 'id'),
        limit: 10
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('chat'));
  });
});
