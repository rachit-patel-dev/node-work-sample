/*external modules*/
import * as assert from 'assert';
import _ from 'lodash';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { ContractPermissionResult } from '../../../../../db/types/contract';
import { ChatType } from '../../../../../db/types/chat';
import { Message } from '../../../../../db/types/message';
import { ChatFileType } from '../../../../../db/types/chat';
import { File as FileDB } from '../../../../../db/types/file';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { FileModel } from '../../../../../db/models/FileModel';
/*GQL*/
import { execQuery } from '../../../index';
import { GraphQLError } from '../../../../../gql';
import { File } from '../../../../../gql/resolvers/Types/File';
/*other*/
import { Mime } from '../../../../../utils/mime';
import { Test } from '../../../../helpers/Test';

type TQuery = { getChatFiles: File[] };

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
  filesInGroupChat: FileDB[];
  messages: Message[];
  project: Test.TProject;
}

const requiredFieldSet: Test.TFieldSet<File> = {
  scalar: ['id', 'name', 'mime', 'roleId'],
  array: ['tags', 'labels']
};

const GET_CHAT_FILES_QUERY = `query ($chatId: ID!, $fileType: ChatFileType!) {
  getChatFiles(chatId: $chatId, fileType: $fileType) {
    id
    name
    mime
    roleId
    tags
    labels

    contract {
      id
    }
  }
}`;

describe('gql/resolvers/Query/chats/listFiles', () => {
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
      text: 'test'
    },
    files: [
      {
        name: 'test',
        mime: Mime.JPG
      },
      {
        name: 'test',
        mime: Mime.PDF
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
          await chatGenerate.addMessage({
            fromId: homeUser.lastRoleId,
            text: inputData.message.text
          });

          return chatGenerate.chat!;
        })
      );

      const messages = _.map(chats, chat => chat.messages!).flat();

      const groupChat = _.find(chats, { title: ChatTitle.Group });
      if (!groupChat) throw GraphQLError.notFound('chat');

      const messageInGroup = _.find(messages, { chatId: groupChat.id });
      if (!messageInGroup) throw GraphQLError.notFound('message');

      const filesInGroupChat = await Promise.all(
        _.map(inputData.files, file =>
          FileModel.create.exec(
            client,
            {
              roleId: homeUser.lastRoleId,
              messageId: messageInGroup.id,
              ...file
            },
            ctx
          )
        )
      );

      return {
        users,
        project,
        chats,
        messages,
        filesInGroupChat
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
  it('should allow to get chat images', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const groupChat = _.find(outputData.chats, { title: ChatTitle.Group });

    const imageFile = _.find(outputData.filesInGroupChat, {
      mime: Mime.JPG
    });

    const { errors, data } = await execQuery<TQuery>(
      GET_CHAT_FILES_QUERY,
      {
        chatId: _.get(groupChat, 'id'),
        fileType: ChatFileType.Image
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.getChatFiles;
    if (!result) throw GraphQLError.notFound('data');

    assert.equal(result.length, 1, 'Incorrect amount of files.');

    assert.equal(_.get(result, [0, 'mime']), _.get(imageFile, 'mime'), 'Incorrect MIME type.');

    _.forEach(result, file => {
      assert.ok(/image\/*/gi.test(file.mime), 'it should have image mime type');

      Test.Check.requiredFields(requiredFieldSet, file);
    });
  });

  it('should allow to get chat PDFs', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const groupChat = _.find(outputData.chats, { title: ChatTitle.Group });

    const pdfFile = _.find(outputData.filesInGroupChat, {
      mime: Mime.PDF
    });

    const { errors, data } = await execQuery<TQuery>(
      GET_CHAT_FILES_QUERY,
      {
        chatId: _.get(groupChat, 'id'),
        fileType: ChatFileType.PDF
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.getChatFiles;
    if (!result) throw GraphQLError.notFound('data');

    assert.equal(result.length, 1, 'Incorrect amount of files.');

    assert.equal(_.get(result, [0, 'mime']), _.get(pdfFile, 'mime'), 'Incorrect MIME type.');

    Test.Check.data(
      result,
      {
        mime: {
          $check: '==',
          $value: Mime.PDF,
          $eMessage: 'it should have PDF mime type'
        }
      },
      requiredFieldSet
    );
  });

  // error
  it("other user hasn't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    const directChat = _.find(outputData.chats, { title: ChatTitle.Direct });

    const { errors } = await execQuery<TQuery>(
      GET_CHAT_FILES_QUERY,
      {
        chatId: _.get(directChat, 'id'),
        fileType: ChatFileType.Image
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('chat not found', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const { errors } = await execQuery<TQuery>(
      GET_CHAT_FILES_QUERY,
      {
        chatId: _.get(homeUser, 'id'),
        fileType: ChatFileType.Image
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('chat'));
  });
});
