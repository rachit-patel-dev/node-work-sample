/*external modules*/
import _ from 'lodash';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Chat as ChatDB, ChatType } from '../../../../../db/types/chat';
import { User } from '../../../../../db/types/user';
import { ContractPermissionResult } from '../../../../../db/types/contract';
/*models*/
import { ChatModel } from '../../../../../db/models/ChatModel';
import { UserModel } from '../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { Chat } from '../../../../../gql/resolvers/Types/Chat';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { setChatTitle: Chat };

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

const SET_CHAT_TITLE_MUTATION = `mutation ($chatId: ID!, $title: String!) {
  setChatTitle(chatId: $chatId, title: $title) {
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

describe('gql/resolvers/Mutation/chats/setTitle', () => {
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
  it('should allow to change "title" in group chat', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const groupChat = _.find(outputData.chats, { title: ChatTitle.Group });

    const contract = _.find(outputData.project.contracts, {
      name: ContractName.Chat
    });

    const title = 'test-set-title-chat';

    const { data, errors } = await execQuery<TQuery>(
      SET_CHAT_TITLE_MUTATION,
      {
        chatId: _.get(groupChat, 'id'),
        title
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.setChatTitle;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(result, {
      title: title,
      'contract.id': _.get(contract, 'id')
    });

    Test.Check.requiredFields(requiredFieldSet, result);
  });

  // error
  describe('', () => {
    const ctx = { sql, events: [] };
    let proUser: User | undefined;
    let groupChat: ChatDB | undefined;
    const title = 'test-set-title-chat';

    before(async () => {
      proUser = _.find(outputData.users, { email: Email.Pro });
      groupChat = _.find(outputData.chats, { title: ChatTitle.Group });

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

    it('not owner cannot change "title" for group chat', async () => {
      const { errors } = await execQuery<TQuery>(
        SET_CHAT_TITLE_MUTATION,
        {
          chatId: _.get(groupChat, 'id'),
          title
        },
        proUser
      );

      Test.Check.error(errors, new GraphQLError('You are not permitted to change "title" of this chat.'));
    });
  });

  it('cannot set new "title" for general chat', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const generalChat = _.find(outputData.chats, { title: ChatTitle.General });

    const title = 'test-set-title-chat';

    const { errors } = await execQuery<TQuery>(
      SET_CHAT_TITLE_MUTATION,
      {
        chatId: _.get(generalChat, 'id'),
        title
      },
      homeUser
    );

    Test.Check.error(errors, new GraphQLError('You are not permitted to change "title" of this chat.'));
  });

  it('cannot change "title" for direct chat', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    const title = 'test-set-title-chat';

    const { errors } = await execQuery<TQuery>(
      SET_CHAT_TITLE_MUTATION,
      {
        chatId: _.get(directChat, 'id'),
        title
      },
      homeUser
    );

    Test.Check.error(errors, new GraphQLError('You cannot change "title" for Direct chats.'));
  });

  it('user is not a chat member', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    const title = 'test-set-title-chat';

    const { errors } = await execQuery<TQuery>(
      SET_CHAT_TITLE_MUTATION,
      {
        chatId: _.get(directChat, 'id'),
        title
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError('You are not a chat member.', 403));
  });

  it("other user have't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    const title = 'test-set-title-chat';

    const { errors } = await execQuery<TQuery>(
      SET_CHAT_TITLE_MUTATION,
      {
        chatId: _.get(directChat, 'id'),
        title
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('chat not found', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    const title = 'test-set-title-chat';

    const { errors } = await execQuery<TQuery>(
      SET_CHAT_TITLE_MUTATION,
      {
        chatId: _.get(otherUser, 'id'),
        title
      },
      otherUser
    );

    Test.Check.error(errors, GraphQLError.notFound('chat'));
  });
});
