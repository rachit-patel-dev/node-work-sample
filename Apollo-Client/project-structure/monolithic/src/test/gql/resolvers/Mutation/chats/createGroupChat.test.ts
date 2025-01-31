/*external modules*/
import _ from 'lodash';
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
import { Chat } from '../../../../../gql/resolvers/Types/Chat';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { createGroupChat: Chat };

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
}

const requiredFieldSet: Test.TFieldSet<Chat> = {
  scalar: ['id', 'title', 'type', 'unreadMessagesCount'],
  object: ['contract', 'owner'],
  array: ['members', 'pinnedItems']
};

const CREATE_GROUP_CHAT_MUTATION = `mutation ($contractId: ID!, $title: String!) {
  createGroupChat(contractId: $contractId, title: $title) {
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

describe('gql/resolvers/Mutation/chats/createGroupChat', () => {
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
    groupChat: {
      title: ChatTitle.Group,
      type: ChatType.Group
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

      return {
        users,
        project
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
  it('should allow to create group chat', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const contract = _.find(outputData.project.contracts, {
      name: ContractName.Chat
    });

    const { data, errors } = await execQuery<TQuery>(
      CREATE_GROUP_CHAT_MUTATION,
      {
        contractId: _.get(contract, 'id'),
        title: _.get(inputData, ['groupChat', 'title'])
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.createGroupChat;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(result, {
      title: _.get(inputData, ['groupChat', 'title']),
      'owner.id': _.get(homeUser, 'lastRoleId'),
      'contract.id': _.get(contract, 'id')
    });

    Test.Check.requiredFields(requiredFieldSet, result);
  });

  // error
  it("other user have't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });

    const contract = _.find(outputData.project.contracts, {
      name: ContractName.Chat
    });

    const { errors } = await execQuery<TQuery>(
      CREATE_GROUP_CHAT_MUTATION,
      {
        contractId: _.get(contract, 'id'),
        title: _.get(inputData, ['groupChat', 'title'])
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });
});
