/*external modules*/
import _ from 'lodash';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { ChatType } from '../../../../../db/types/chat';
import { UserMood } from '../../../../../db/types/moodMeter';
import { ContractPermissionResult } from '../../../../../db/types/contract';
/*models*/
import { MoodMeterModel } from '../../../../../db/models/MoodMeterModel';
import { UserModel } from '../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { Chat } from '../../../../../gql/resolvers/Types/Chat';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { setUserChatMood: Chat };

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

const SET_USER_CHAT_MOOD_MUTATION = `mutation ($chatId: ID!, $mood: UserMood!) {
  setUserChatMood(chatId: $chatId, mood: $mood) {
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

describe('gql/resolvers/Mutation/chats/setUserChatMood', () => {
  let outputData: OutputData;

  const inputData = {
    users: [
      {
        email: Email.Home,
        collectPersonalData: true,
        role: {
          name: UserRole.HomeOwner
        }
      },
      {
        email: Email.Pro,
        collectPersonalData: false,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.Other,
        collectPersonalData: true,
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

          await userGenerate.create({
            email: userData.email,
            collectPersonalData: userData.collectPersonalData
          });
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
  it('should allow to change user mood in chat', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const groupChat = _.find(outputData.chats, { title: ChatTitle.Group });

    const contract = _.find(outputData.project.contracts, {
      name: ContractName.Chat
    });

    const mood = UserMood.Stressed;

    const { data, errors } = await execQuery<TQuery>(
      SET_USER_CHAT_MOOD_MUTATION,
      {
        chatId: _.get(groupChat, 'id'),
        mood
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.setUserChatMood;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(result, {
      'contract.id': _.get(contract, 'id')
    });

    Test.Check.requiredFields(requiredFieldSet, result);

    await getClient(async client => {
      const lastUserMood = await MoodMeterModel.getActualMood.exec(
        client,
        {
          roleId: _.get(homeUser, 'lastRoleId')!,
          chatId: _.get(groupChat, 'id')!
        },
        { sql, events: [] }
      );
      if (!lastUserMood) throw GraphQLError.notFound('user mood');

      if (lastUserMood.mood !== mood) {
        throw new GraphQLError(`Invalid user actual mood`);
      }
    });
  });

  // error
  it("other user haven't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    const { errors } = await execQuery<TQuery>(
      SET_USER_CHAT_MOOD_MUTATION,
      {
        chatId: _.get(directChat, 'id'),
        mood: UserMood.Ecstatic
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('chat not found', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });

    const { errors } = await execQuery<TQuery>(
      SET_USER_CHAT_MOOD_MUTATION,
      {
        chatId: _.get(otherUser, 'id'),
        mood: UserMood.Ecstatic
      },
      otherUser
    );

    Test.Check.error(errors, GraphQLError.notFound('chat'));
  });

  it('no have permission to collect personal data', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });

    const { errors } = await execQuery<TQuery>(
      SET_USER_CHAT_MOOD_MUTATION,
      {
        chatId: _.get(proUser, 'id'),
        mood: UserMood.Ecstatic
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError('Permission to collect personal data required.'));
  });
});
