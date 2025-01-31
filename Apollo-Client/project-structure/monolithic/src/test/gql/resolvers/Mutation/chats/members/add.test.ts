/*external modules*/
import _ from 'lodash';
/*DB*/
import { getClientTransaction, sql } from '../../../../../../db';
import { Role, UserRole } from '../../../../../../db/types/role';
import { ChatType } from '../../../../../../db/types/chat';
import { ContractPermissionResult } from '../../../../../../db/types/contract';
/*models*/
import { UserModel } from '../../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../../..';
import { GraphQLError } from '../../../../../../gql';
import { Chat } from '../../../../../../gql/resolvers/Types/Chat';
/*other*/
import { Test } from '../../../../../helpers/Test';

type TQuery = { addChatMember: Chat };

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

const ADD_CHAT_MEMBER_MUTATION = `mutation ($chatId: ID!, $memberId: ID!) {
  addChatMember(chatId: $chatId, memberId: $memberId) {
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

describe('gql/resolvers/Mutation/chats/members/add', async () => {
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
  it('should allow to add member to a group chat', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    const groupChat = _.find(outputData.chats, { title: ChatTitle.Group });
    if (!groupChat) throw GraphQLError.notFound('chat');

    const contract = _.find(outputData.project.contracts, {
      name: ContractName.Chat
    });
    if (!contract) throw GraphQLError.notFound('contract');

    const { data, errors } = await execQuery<TQuery>(
      ADD_CHAT_MEMBER_MUTATION,
      {
        chatId: _.get(groupChat, 'id'),
        memberId: _.get(proUser, 'lastRoleId')
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.addChatMember;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(result, {
      'contract.id': _.get(contract, 'id'),
      members: {
        $check: 'some',
        $value: (member: Role) => member.id === proUser.lastRoleId
      }
    });

    Test.Check.requiredFields(requiredFieldSet, result);
  });

  // error
  it('cannot invite already invited member', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const groupChat = _.find(outputData.chats, { title: ChatTitle.Group });

    const { errors } = await execQuery<TQuery>(
      ADD_CHAT_MEMBER_MUTATION,
      {
        chatId: _.get(groupChat, 'id'),
        memberId: _.get(homeUser, 'lastRoleId')
      },
      homeUser
    );

    Test.Check.error(errors, new GraphQLError('This member already invited.'));
  });

  it('cannot invite member to a direct chat', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const proUser = _.find(outputData.users, { email: Email.Pro });

    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    const { errors } = await execQuery<TQuery>(
      ADD_CHAT_MEMBER_MUTATION,
      {
        chatId: _.get(directChat, 'id'),
        memberId: _.get(proUser, 'lastRoleId')
      },
      homeUser
    );

    Test.Check.error(errors, new GraphQLError('You cannot invite to the direct chat.'));
  });

  it('cannot add members in "general" chat', async () => {
    const homeUser = _.find(outputData.users, {
      email: Email.Home
    });
    const proUser = _.find(outputData.users, { email: Email.Pro });

    const generalChat = _.find(outputData.chats, { title: ChatTitle.General });

    const { errors } = await execQuery<TQuery>(
      ADD_CHAT_MEMBER_MUTATION,
      {
        chatId: _.get(generalChat, 'id'),
        memberId: _.get(proUser, 'lastRoleId')
      },
      homeUser
    );

    Test.Check.error(errors, new GraphQLError('You cannot add members to the "general" chat.'));
  });

  it("only chat's admin can add members to a group chat", async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const groupChat = _.find(outputData.chats, { title: ChatTitle.Group });

    const { errors } = await execQuery<TQuery>(
      ADD_CHAT_MEMBER_MUTATION,
      {
        chatId: _.get(groupChat, 'id'),
        memberId: _.get(homeUser, 'lastRoleId')
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError('Only chat owner can add/remove members.'));
  });

  it('user without contract access cannot be invite to a chat', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const otherUser = _.find(outputData.users, { email: Email.Other });

    const directChat = _.find(outputData.chats, { type: ChatType.Direct });

    const { errors } = await execQuery<TQuery>(
      ADD_CHAT_MEMBER_MUTATION,
      {
        chatId: _.get(directChat, 'id'),
        memberId: _.get(proUser, 'lastRoleId')
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('user without contract access cannot be invited to a chat', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const otherUser = _.find(outputData.users, { email: Email.Other });

    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    const { errors } = await execQuery<TQuery>(
      ADD_CHAT_MEMBER_MUTATION,
      {
        chatId: _.get(directChat, 'id'),
        memberId: _.get(otherUser, 'lastRoleId')
      },
      homeUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('chat not found', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const { errors } = await execQuery<TQuery>(
      ADD_CHAT_MEMBER_MUTATION,
      {
        chatId: _.get(homeUser, 'id'),
        memberId: _.get(homeUser, 'lastRoleId')
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('chat'));
  });
});
