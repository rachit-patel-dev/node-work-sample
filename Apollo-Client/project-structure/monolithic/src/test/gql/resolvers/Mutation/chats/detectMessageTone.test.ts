/*external modules*/
import _ from 'lodash';
import { randomBytes } from 'crypto';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { ChatType } from '../../../../../db/types/chat';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../../index';
import { GraphQLError } from '../../../../../gql';
import { MoodMeter } from '../../../../../gql/resolvers/Types/MoodMeter';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { detectMessageTone: MoodMeter };

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

// const requiredFieldSet: Test.TFieldSet<MoodMeter> = {
//   scalar: ['chatId', 'message', 'sentiment'],
//   object: [],
//   array: ['words']
// };

const DETECT_MESSAGE_TONE_MUTATION = `mutation ($chatId: ID!, $message: String!) {
  detectMessageTone(chatId: $chatId, message: $message) {
    chatId
    message
    sentiment

    words {
      name
      offset
      type
      salience
      sentiment
    }
  }
}`;

describe('gql/resolvers/Mutation/detectMessageTone', () => {
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

  // error
  it('message is too large', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    const { errors } = await execQuery<TQuery>(
      DETECT_MESSAGE_TONE_MUTATION,
      {
        chatId: _.get(directChat, 'id'),
        message: randomBytes(1_000_001).toString('base64')
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(`Message is too large to analyze`));
  });

  it('no have permission to collect personal data', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });

    const { errors } = await execQuery<TQuery>(
      DETECT_MESSAGE_TONE_MUTATION,
      {
        chatId: _.get(proUser, 'id'),
        message: 'test'
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError('Permission to collect personal data required.'));
  });
});
