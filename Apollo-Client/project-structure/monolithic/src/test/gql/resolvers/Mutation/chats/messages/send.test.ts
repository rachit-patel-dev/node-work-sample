/*external modules*/
import * as assert from 'assert';
import _ from 'lodash';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../../db';
import { UserRole } from '../../../../../../db/types/role';
import { Chat, ChatType, ChatFileType } from '../../../../../../db/types/chat';
import { Message as MessageDB } from '../../../../../../db/types/message';
import { User } from '../../../../../../db/types/user';
import { File } from '../../../../../../db/types/file';
import { ContractPermissionResult } from '../../../../../../db/types/contract';
import { InviteType } from '../../../../../../db/types/invite';
import { Collaborator, CollaboratorPermission } from '../../../../../../db/types/collaborator';
/*models*/
import { ChatModel } from '../../../../../../db/models/ChatModel';
import { FileModel } from '../../../../../../db/models/FileModel';
import { CollaboratorModel } from '../../../../../../db/models/CollaboratorModel';
import { UserModel } from '../../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../../..';
import { GraphQLError } from '../../../../../../gql';
import { Message } from '../../../../../../gql/resolvers/Types/Chat/Message';
import { WhoCanSeeFiles } from '../../../../../../gql/resolvers/Types/File';
/*other*/
import { safeHtml } from '../../../../../../utils/safeHtml';
import { Test } from '../../../../../helpers/Test';

type TQuery = { sendMessage: Message };

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
  files: File[];
  messages: MessageDB[];
  project: Test.TProject;
  collaborator: Collaborator;
}

const requiredFieldSet: Test.TFieldSet<Message> = {
  scalar: ['id', 'chatId', 'fromId', 'text', 'pinned'],
  object: ['chat', 'from'],
  array: ['tags', 'files', 'replies']
};

const SEND_MESSAGE_MUTATION = `mutation ($chatId: ID!, $text: String!, $files: [ID!]!, $whoCanSeeFiles: WhoCanSeeFiles, $parentMessageId: ID) {
  sendMessage(
    chatId: $chatId,
    text: $text,
    files: $files,
    whoCanSeeFiles: $whoCanSeeFiles,
    parentMessageId: $parentMessageId
  ) {
    id
    chatId
    fromId
    text
    editedAt
    tags
    pinned
    parentMessageId

    files {
      id

      assignees {
        id
        email
      }
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

describe('gql/resolvers/Mutation/chats/messages/send', () => {
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
        type: ChatType.Direct,
        $assignees: [Email.Home]
      },
      {
        title: ChatTitle.Group,
        type: ChatType.Group,
        $assignees: [Email.Home, Email.Collaborator]
      },
      {
        title: ChatTitle.General,
        type: ChatType.Group,
        $assignees: [Email.Home]
      }
    ],
    message: {
      text: '<script>alert(1);</script>'
    },
    files: [
      {
        name: 'test',
        mime: ChatFileType.Image,
        $ownerEmail: Email.Home
      },
      {
        name: 'test',
        mime: ChatFileType.PDF,
        $ownerEmail: Email.Home
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
      const contract = _.find(project.contracts, { name: ContractName.Chat });
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
            contractId: contract.id,
            ownerId: homeUser.lastRoleId,
            ...chatData
          });

          await Promise.all(
            _.map(chatData.$assignees, async assigneeEmail => {
              const assignee = _.find(users, { email: assigneeEmail });
              if (!assignee) throw GraphQLError.notFound('assignee');

              await chatGenerate.inviteMember({
                memberId: _.get(assignee, 'lastRoleId')
              });
            })
          );

          await chatGenerate.addMessage({
            fromId: homeUser.lastRoleId,
            text: safeHtml(inputData.message.text) as string
          });

          return chatGenerate.chat!;
        })
      );

      const messages = _.map(chats, chat => chat.messages!).flat();

      const files = await Promise.all(
        _.map(inputData.files, async file => {
          const userOwner = _.find(users, { email: file.$ownerEmail });
          if (!userOwner) throw GraphQLError.notFound('user owner file');

          const fileGenerate = new Test.FileGenerate(client, ctx);

          await fileGenerate.create({
            roleId: _.get(userOwner, 'lastRoleId'),
            ...file
          });

          return fileGenerate.file!;
        })
      );

      return {
        users,
        project,
        collaborator,
        chats,
        messages,
        files
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
  it('should allow to send message', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    const { data, errors } = await execQuery<TQuery>(
      SEND_MESSAGE_MUTATION,
      {
        chatId: _.get(directChat, 'id'),
        text: _.get(inputData, ['message', 'text']),
        files: []
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.sendMessage;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(result, {
      chatId: _.get(directChat, 'id'),
      fromId: _.get(homeUser, 'lastRoleId'),
      text: safeHtml(_.get(inputData, ['message', 'text']))
    });

    Test.Check.requiredFields(requiredFieldSet, result);
  });

  it('should allow to send message with files', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const collaboratorUser = outputData.collaborator;

    const groupChat = _.find(outputData.chats, { title: ChatTitle.Group });

    const inputFiles = _.map(outputData.files, 'id');

    const { data, errors } = await execQuery<TQuery>(
      SEND_MESSAGE_MUTATION,
      {
        chatId: _.get(groupChat, 'id'),
        text: _.get(inputData, ['message', 'text']),
        files: inputFiles,
        whoCanSeeFiles: WhoCanSeeFiles.MinPermission
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.sendMessage;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(result, {
      chatId: _.get(groupChat, 'id'),
      fromId: _.get(homeUser, 'lastRoleId'),
      text: safeHtml(_.get(inputData, ['message', 'text']))
    });

    assert.ok(result.files.length === inputFiles.length, 'Incorrect files count');

    Test.Check.data(result.files, file => {
      const localFile = _.find(outputData.files, { id: file.id });
      if (!localFile) throw GraphQLError.notFound('local file');

      assert.ok(_.isEqual(_.map(file.assignees, 'id'), [collaboratorUser.id]), 'Assignees must be equal');

      return _.pick(localFile, ['id']);
    });

    Test.Check.requiredFields(requiredFieldSet, result);
  });

  it('should allow to reply on a message', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    if (!directChat) throw GraphQLError.notFound('chat');

    const messageInDirect = _.find(outputData.messages, {
      chatId: directChat.id
    });

    const { data, errors } = await execQuery<TQuery>(
      SEND_MESSAGE_MUTATION,
      {
        chatId: _.get(directChat, 'id'),
        text: _.get(inputData, ['message', 'text']),
        parentMessageId: _.get(messageInDirect, 'id'),
        files: []
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.sendMessage;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(result, {
      parentMessageId: _.get(messageInDirect, 'id'),
      chatId: _.get(directChat, 'id'),
      fromId: _.get(homeUser, 'lastRoleId'),
      text: safeHtml(_.get(inputData, ['message', 'text']))
    });

    Test.Check.requiredFields(requiredFieldSet, result);
  });

  it('files in a general chat should be shared', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const generalChat = _.find(outputData.chats, { title: ChatTitle.General });

    const contract = _.find(outputData.project.contracts, {
      name: ContractName.Chat
    });

    const inputFiles = _.map(outputData.files, 'id');

    const { data, errors } = await execQuery<TQuery>(
      SEND_MESSAGE_MUTATION,
      {
        chatId: _.get(generalChat, 'id'),
        text: _.get(inputData, ['message', 'text']),
        files: inputFiles
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.sendMessage;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(result, {
      chatId: _.get(generalChat, 'id'),
      fromId: _.get(homeUser, 'lastRoleId'),
      text: safeHtml(_.get(inputData, ['message', 'text']))
    });

    assert.ok(!_.difference(_.map(result.files, 'id'), inputFiles).length, 'Incorrect message files.');

    const ctx = { sql, events: [] };
    const filesAfterSendMessage = await getClient(async client => {
      return Promise.all(
        _.map(result.files, file =>
          FileModel.findById.exec(
            client,
            {
              fileId: _.get(file, 'id')
            },
            ctx
          )
        )
      );
    });

    _.map(_.compact(filesAfterSendMessage), file => {
      assert.equal(_.get(file, 'contractId'), _.get(contract, 'id'), `File "${file.id}" not shared.`);
    });

    Test.Check.requiredFields(requiredFieldSet, result);
  });

  describe('', () => {
    const ctx = { sql, events: [] };
    let collaboratorUser: User | undefined;
    let directChat: Chat | undefined;

    before(async () => {
      collaboratorUser = _.find(outputData.users, {
        email: Email.Collaborator
      });
      directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

      await getClient(async client => {
        await ChatModel.inviteMember.exec(
          client,
          {
            chatId: _.get(directChat!, 'id'),
            memberId: _.get(collaboratorUser!, 'lastRoleId')
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
            memberId: _.get(collaboratorUser!, 'lastRoleId')
          },
          ctx
        );
      });
    });

    it('should allow collaborator to send message in direct chat', async () => {
      const { data, errors } = await execQuery<TQuery>(
        SEND_MESSAGE_MUTATION,
        {
          chatId: _.get(directChat, 'id'),
          text: _.get(inputData, ['message', 'text']),
          files: []
        },
        collaboratorUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.sendMessage;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(result, {
        chatId: _.get(directChat, 'id'),
        fromId: _.get(collaboratorUser, 'lastRoleId'),
        text: safeHtml(_.get(inputData, ['message', 'text']))
      });

      Test.Check.requiredFields(requiredFieldSet, result);
    });
  });

  // error
  it('user is not a chat member', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    if (!directChat) throw GraphQLError.notFound('chat');

    const { errors } = await execQuery<TQuery>(
      SEND_MESSAGE_MUTATION,
      {
        chatId: _.get(directChat, 'id'),
        text: _.get(inputData, ['message', 'text']),
        files: []
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError('You are not a chat member.', 403));
  });

  it("other user have't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    if (!directChat) throw GraphQLError.notFound('chat');

    const { errors } = await execQuery<TQuery>(
      SEND_MESSAGE_MUTATION,
      {
        chatId: _.get(directChat, 'id'),
        text: _.get(inputData, ['message', 'text']),
        files: []
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it(`collaborator hasn't write access in a group chat`, async () => {
    const collaboratorUser = _.find(outputData.users, {
      email: Email.Collaborator
    });
    const groupChat = _.find(outputData.chats, { title: ChatTitle.Group });

    if (!groupChat) throw GraphQLError.notFound('chat');

    const { errors } = await execQuery<TQuery>(
      SEND_MESSAGE_MUTATION,
      {
        chatId: _.get(groupChat, 'id'),
        text: _.get(inputData, ['message', 'text']),
        files: []
      },
      collaboratorUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.BadPermission, 403));
  });

  it('chat not found', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const { errors } = await execQuery<TQuery>(
      SEND_MESSAGE_MUTATION,
      {
        chatId: _.get(homeUser, 'id'),
        text: _.get(inputData, ['message', 'text']),
        files: []
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('chat'));
  });
});
