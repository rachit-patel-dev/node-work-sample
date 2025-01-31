/*external modules*/
import * as assert from 'assert';
import _ from 'lodash';
import moment from 'moment';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { ChatType } from '../../../../../db/types/chat';
import { ContractPermissionResult } from '../../../../../db/types/contract';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { ChatMember } from '../../../../../gql/resolvers/Types/Chat/ChatMember';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { setUserChatSeenAt: ChatMember };

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

const requiredFieldSet: Test.TFieldSet<ChatMember> = {
  scalar: ['roleId', 'chatId', 'lastSeenAt'],
  object: ['chat', 'role']
};

const SET_USER_CHAT_SEEN_AT_MUTATION = `mutation ($chatId: ID!, $lastSeenAt: DateTime!) {
  setUserChatSeenAt(chatId: $chatId, lastSeenAt:$lastSeenAt ){
    roleId
    chatId
    lastSeenAt

    chat {
      id
    }
    role {
      id
    }
  }
}`;

describe('gql/resolvers/Mutation/chats/setUserSeenAt', () => {
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
  it('should allow to set user-chat last "seenAt" for unread messages feature', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });
    const lastSeenAt = Date.now();

    if (!directChat) throw GraphQLError.notFound('chat');

    const { data, errors } = await execQuery<TQuery>(
      SET_USER_CHAT_SEEN_AT_MUTATION,
      {
        chatId: _.get(directChat, 'id'),
        lastSeenAt
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.setUserChatSeenAt;
    if (!result) throw GraphQLError.notFound('data');

    assert.equal(moment(result.lastSeenAt).valueOf(), lastSeenAt, 'Incorrect last "seenAt".');

    Test.Check.requiredFields(requiredFieldSet, result);
  });

  // error
  it('chat not found', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    const lastSeenAt = Date.now();

    const { errors } = await execQuery<TQuery>(
      SET_USER_CHAT_SEEN_AT_MUTATION,
      {
        chatId: _.get(otherUser, 'id'),
        lastSeenAt
      },
      otherUser
    );

    Test.Check.error(errors, GraphQLError.notFound('chat'));
  });

  it('user is not a chat member', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });
    const lastSeenAt = Date.now();

    if (!directChat) throw GraphQLError.notFound('chat');

    const { errors } = await execQuery<TQuery>(
      SET_USER_CHAT_SEEN_AT_MUTATION,
      {
        chatId: _.get(directChat, 'id'),
        lastSeenAt
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError('You are not a chat member.', 403));
  });

  it("other user have't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });
    const lastSeenAt = Date.now();

    if (!directChat) throw GraphQLError.notFound('chat');

    const { errors } = await execQuery<TQuery>(
      SET_USER_CHAT_SEEN_AT_MUTATION,
      {
        chatId: _.get(directChat, 'id'),
        lastSeenAt
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });
});
