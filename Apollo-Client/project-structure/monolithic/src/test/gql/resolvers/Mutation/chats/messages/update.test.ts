/*external modules*/
import _ from 'lodash';
import moment from 'moment';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../../db';
import { UserRole } from '../../../../../../db/types/role';
import { Chat, ChatType } from '../../../../../../db/types/chat';
import { Message as MessageDB, MESSAGE_TABLE } from '../../../../../../db/types/message';
import { User } from '../../../../../../db/types/user';
import { ContractPermissionResult } from '../../../../../../db/types/contract';
import { InviteType } from '../../../../../../db/types/invite';
import { Collaborator, CollaboratorPermission } from '../../../../../../db/types/collaborator';
/*models*/
import { ChatModel } from '../../../../../../db/models/ChatModel';
import { CollaboratorModel } from '../../../../../../db/models/CollaboratorModel';
import { UserModel } from '../../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../../..';
import { GraphQLError } from '../../../../../../gql';
import { Message } from '../../../../../../gql/resolvers/Types/Chat/Message';
/*other*/
import { safeHtml } from '../../../../../../utils/safeHtml';
import { Test } from '../../../../../helpers/Test';

type TQuery = { updateMessage: Message };

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
  messages: MessageDB[];
  project: Test.TProject;
  collaborator: Collaborator;
}

const requiredFieldSet: Test.TFieldSet<Message> = {
  scalar: ['id', 'chatId', 'fromId', 'text', 'editedAt', 'pinned'],
  object: ['chat', 'from'],
  array: ['tags', 'files', 'replies']
};

const UPDATE_MESSAGE_MUTATION = `mutation ($messageId: ID!, $text: String!) {
  updateMessage(messageId: $messageId, text: $text) {
    id
    chatId
    fromId
    text
    editedAt
    tags
    pinned

    files {
      id
    }
    chat {
      id
    }
    from {
      id
    }
    replies {
      id
    }
  }
}`;

describe('gql/resolvers/Mutation/chats/messages/update', () => {
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
    collaborator: {
      permissions: CollaboratorPermission.Read
    },
    invite: {
      firstName: 'test',
      inviteMessage: 'test message',
      type: InviteType.ContractCollaborator,
      userRole: UserRole.Pro
    },
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
    sendMessage: {
      text: '<script>alert(1);</script>'
    },
    updateMessage: {
      text: 'test update'
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

      const collaboratorUser = _.find(users, { email: Email.Collaborator });
      if (!collaboratorUser) throw GraphQLError.notFound('collaborator');

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
      const contract = _.find(project!.contracts, { name: ContractName.Chat });
      if (!contract) throw GraphQLError.notFound('contract');

      const inviteGenerate = new Test.InviteGenerate(client, ctx);
      await inviteGenerate.create({
        ...inputData.invite,
        email: Email.Collaborator,
        invitedById: homeUser.lastRoleId
      });

      const invite = inviteGenerate.invite!;

      const collaboratorGenerate = new Test.CollaboratorGenerate(client, ctx);
      await collaboratorGenerate.create({
        roleId: collaboratorUser.lastRoleId,
        inviteId: invite.id,
        contractId: contract.id,
        invitedById: proUser.lastRoleId,
        approvedById: homeUser.lastRoleId,
        userRole: collaboratorUser.role!.name,
        email: Email.Collaborator,
        ...inputData.collaborator
      });

      const collaborator = collaboratorGenerate.collaborator!;

      const chats = await Promise.all(
        _.map(inputData.chats, async chatData => {
          const chatGenerate = new Test.ChatGenerate(client, ctx);

          await chatGenerate.create({
            contractId: contract!.id,
            ownerId: homeUser!.lastRoleId,
            ...chatData
          });
          await chatGenerate.inviteMember({ memberId: homeUser!.lastRoleId });
          await chatGenerate.addMessage({
            fromId: homeUser!.lastRoleId,
            text: safeHtml(inputData.sendMessage.text) as string
          });

          return chatGenerate.chat!;
        })
      );

      const messages = _.map(chats, chat => chat.messages!).flat();

      return {
        users,
        project,
        collaborator,
        chats,
        messages
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      await CollaboratorModel.remove.exec(
        client,
        {
          collaboratorId: outputData.collaborator.id
        },
        ctx
      );

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
  it('should allow to update message in a chat', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    if (!directChat) throw GraphQLError.notFound('chat');

    const messageInDirect = _.find(outputData.messages, {
      chatId: directChat.id
    });

    const { data, errors } = await execQuery<TQuery>(
      UPDATE_MESSAGE_MUTATION,
      {
        messageId: _.get(messageInDirect, 'id'),
        text: _.get(inputData, ['updateMessage', 'text'])
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.updateMessage;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(result, {
      chatId: _.get(directChat, 'id'),
      fromId: _.get(homeUser, 'lastRoleId'),
      text: _.get(inputData, ['updateMessage', 'text'])
    });

    Test.Check.requiredFields(requiredFieldSet, result);
  });

  // error
  describe('', () => {
    let proUser: Test.TUser | undefined;
    let directChat: Chat | undefined;
    let messageInDirect: MessageDB | undefined;

    before(async () => {
      const ctx = { sql, events: [] };
      proUser = _.find(outputData.users, { email: Email.Pro });
      directChat = _.find(outputData.chats, { title: ChatTitle.Direct });
      messageInDirect = _.find(outputData.messages, { chatId: directChat!.id });

      await getClient(async client => {
        await ChatModel.inviteMember.exec(
          client,
          {
            chatId: _.get(directChat!, 'id'),
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
            chatId: _.get(directChat!, 'id'),
            memberId: _.get(proUser!, 'lastRoleId')
          },
          ctx
        );
      });
    });

    it(`cannot update someone else's message`, async () => {
      const { errors } = await execQuery<TQuery>(
        UPDATE_MESSAGE_MUTATION,
        {
          messageId: _.get(messageInDirect, 'id'),
          text: _.get(inputData, ['updateMessage', 'text']) + 'cannot'
        },
        proUser
      );

      Test.Check.error(errors, GraphQLError.forbidden());
    });
  });

  describe('', () => {
    let homeUser: User | undefined;
    let directChat: Chat | undefined;
    let messageInDirect: MessageDB | undefined;
    let originalDate: Date | undefined;

    before(async () => {
      homeUser = _.find(outputData.users, { email: Email.Home });

      directChat = _.find(outputData.chats, { title: ChatTitle.Direct });
      messageInDirect = _.find(outputData.messages, { chatId: directChat!.id });

      originalDate = _.get(messageInDirect, 'createdAt');

      const subtractTimeOfCreatedAt = moment(originalDate)
        .subtract(10, 'minutes')
        .toDate();

      await getClient(async client => {
        await client.query(
          sql`
            UPDATE ${MESSAGE_TABLE}
            SET "createdAt" = ${subtractTimeOfCreatedAt}
            WHERE "id" = ${_.get(messageInDirect, 'id')}
              AND "fromId" = ${_.get(homeUser, 'lastRoleId')}
            RETURNING *;
          `
        );
      });
    });

    after(async () => {
      await getClient(async client => {
        await client.query(
          sql`
            UPDATE ${MESSAGE_TABLE}
            SET "createdAt" = ${originalDate}
            WHERE "id" = ${_.get(messageInDirect, 'id')}
              AND "fromId" = ${_.get(homeUser, 'lastRoleId')}
            RETURNING *;
          `
        );
      });
    });

    it('cannot update message older 10 minutes', async () => {
      const { errors } = await execQuery<TQuery>(
        UPDATE_MESSAGE_MUTATION,
        {
          messageId: _.get(messageInDirect, 'id'),
          text: _.get(inputData, ['updateMessage', 'text'])
        },
        homeUser
      );

      Test.Check.error(errors, new GraphQLError('You can update message within 10 minutes since it was created.'));
    });
  });

  it('user is not a chat member', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    if (!directChat) throw GraphQLError.notFound('chat');

    const messageInDirect = _.find(outputData.messages, {
      chatId: directChat.id
    });

    if (!messageInDirect) throw GraphQLError.notFound('chat');

    const { errors } = await execQuery<TQuery>(
      UPDATE_MESSAGE_MUTATION,
      {
        messageId: _.get(messageInDirect, 'id'),
        text: _.get(inputData, ['updateMessage', 'text'])
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError('You are not a chat member.', 403));
  });

  it("other user have't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    if (!directChat) throw GraphQLError.notFound('chat');

    const messageInDirect = _.find(outputData.messages, {
      chatId: directChat.id
    });

    const { errors } = await execQuery<TQuery>(
      UPDATE_MESSAGE_MUTATION,
      {
        messageId: _.get(messageInDirect, 'id'),
        text: _.get(inputData, ['updateMessage', 'text'])
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it(`collaborator hasn't write access`, async () => {
    const collaboratorUser = _.find(outputData.users, {
      email: Email.Collaborator
    });
    const groupChat = _.find(outputData.chats, { title: ChatTitle.Group });

    if (!groupChat) throw GraphQLError.notFound('chat');

    const messageInGroup = _.find(outputData.messages, {
      chatId: groupChat.id
    });

    const { errors } = await execQuery<TQuery>(
      UPDATE_MESSAGE_MUTATION,
      {
        messageId: _.get(messageInGroup, 'id'),
        text: _.get(inputData, ['updateMessage', 'text'])
      },
      collaboratorUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.BadPermission, 403));
  });

  it('message not found', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    if (!directChat) throw GraphQLError.notFound('chat');

    const messageInDirect = _.find(outputData.messages, {
      chatId: directChat.id
    });

    if (!messageInDirect) throw GraphQLError.notFound('message');

    const { errors } = await execQuery<TQuery>(
      UPDATE_MESSAGE_MUTATION,
      {
        messageId: _.get(messageInDirect, 'id') + 1,
        text: _.get(inputData, ['updateMessage', 'text'])
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('message'));
  });
});
