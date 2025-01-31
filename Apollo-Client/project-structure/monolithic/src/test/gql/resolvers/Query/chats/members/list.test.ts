/*external modules*/
import _ from 'lodash';
/*DB*/
import { UserRole } from '../../../../../../db/types/role';
import { ContractPermissionResult } from '../../../../../../db/types/contract';
import { ChatType } from '../../../../../../db/types/chat';
import { getClientTransaction, sql } from '../../../../../../db';
/*models*/
import { UserModel } from '../../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../../../index';
import { GraphQLError } from '../../../../../../gql';
import { Role } from '../../../../../../gql/resolvers/Role';
/*other*/
import { Test } from '../../../../../helpers/Test';

type TQuery = { getChatMembers: Role[] };

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

const requiredFieldSet: Test.TFieldSet<Role> = {
  scalar: ['id', 'data', 'name', 'discount', 'showInMatch', 'hideInMatch', 'userId'],
  object: ['user'],
  array: ['insurances', 'licenses', 'publications']
};

const GET_CHAT_MEMBERS_QUERY = `query ($chatId: ID!) {
  getChatMembers(chatId: $chatId) {
    id
    data
    name
    discount
    showInMatch
    hideInMatch
    userId

    insurances {
      id
    }
    licenses {
      id
    }
    publications {
      id
    }

    user {
      id
    }
  }
}`;

describe('gql/resolvers/Query/chats/members/list', () => {
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
  it("allow to get chat's members", async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    const { data, errors } = await execQuery<TQuery>(
      GET_CHAT_MEMBERS_QUERY,
      {
        chatId: _.get(directChat, 'id')
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.getChatMembers;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        id: _.get(homeUser, 'lastRoleId')
      },
      requiredFieldSet
    );
  });

  // error
  it('user is not chat member', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    const { errors } = await execQuery<TQuery>(
      GET_CHAT_MEMBERS_QUERY,
      {
        chatId: _.get(directChat, 'id')
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError('You are not a chat member.', 403));
  });

  it("other user have't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    const { errors } = await execQuery<TQuery>(
      GET_CHAT_MEMBERS_QUERY,
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
      GET_CHAT_MEMBERS_QUERY,
      {
        chatId: _.get(homeUser, 'id')
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('chat'));
  });
});
