/*external modules*/
import * as assert from 'assert';
import _ from 'lodash';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Chat, ChatType, ChatFileType } from '../../../../../db/types/chat';
import { Message } from '../../../../../db/types/message';
import { File } from '../../../../../db/types/file';
import { ContractPermissionResult } from '../../../../../db/types/contract';
/*models*/
import { ChatModel } from '../../../../../db/models/ChatModel';
import { UserModel } from '../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { toggleShareFile: File };

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
  filesInGeneralChat: File[];
  filesInGroupChat: File[];
  messages: Message[];
  project: Test.TProject;
}

const requiredFieldSet: Test.TFieldSet<File> = {
  scalar: ['id', 'name', 'mime', 'roleId'],
  array: ['tags', 'labels']
};

const TOGGLE_SHARE_FILE_MUTATION = `mutation ($fileId: ID!) {
  toggleShareFile(fileId: $fileId){
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

describe('gql/resolvers/Mutation/files/share', () => {
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
    ],
    message: {
      text: 'test'
    },
    files: [
      {
        name: 'test',
        mime: ChatFileType.Image
      },
      {
        name: 'test',
        mime: ChatFileType.PDF
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

      const chats = _.compact(
        await Promise.all(
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
              text: inputData.message.text + ' HOME USER'
            });

            return chatGenerate.chat;
          })
        )
      );

      const messages = _.map(chats, chat => chat.messages!).flat();

      const generalChat = _.find(chats, { title: ChatTitle.General });
      if (!generalChat) throw GraphQLError.notFound('chat');

      const messageInGeneral = _.find(messages, { chatId: generalChat.id });
      if (!messageInGeneral) throw GraphQLError.notFound('message');

      const filesInGeneralChat = _.compact(
        await Promise.all(
          _.map(inputData.files, async file => {
            const fileGenerate = new Test.FileGenerate(client, ctx);

            await fileGenerate.create({
              roleId: homeUser.lastRoleId,
              messageId: messageInGeneral.id,
              ...file
            });

            return fileGenerate.file;
          })
        )
      );

      const groupChat = _.find(chats, { title: ChatTitle.Group });
      if (!groupChat) throw GraphQLError.notFound('chat');

      const messageInGroup = _.find(messages, { chatId: groupChat.id });
      if (!messageInGroup) throw GraphQLError.notFound('message');

      const filesInGroupChat = _.compact(
        await Promise.all(
          _.map(inputData.files, async file => {
            const fileGenerate = new Test.FileGenerate(client, ctx);

            await fileGenerate.create({
              roleId: homeUser.lastRoleId,
              messageId: messageInGroup.id,
              ...file
            });

            return fileGenerate.file!;
          })
        )
      );

      return {
        users,
        project,
        chats,
        messages,
        filesInGeneralChat,
        filesInGroupChat
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
  it('allow to switch share/unshare file inside contract', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const contract = _.find(outputData.project.contracts, {
      name: ContractName.Chat
    });

    const pdfFile = _.find(outputData.filesInGroupChat, {
      mime: ChatFileType.PDF
    });

    let { data, errors } = await execQuery<TQuery>(
      TOGGLE_SHARE_FILE_MUTATION,
      {
        fileId: _.get(pdfFile, 'id')
      },
      homeUser
    );

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));

    let result = data?.toggleShareFile;
    if (!result) throw GraphQLError.notFound('data');

    assert.equal(_.get(result, ['contract', 'id']), _.get(contract, 'id'), 'Incorrect file contract ID.');

    Test.Check.requiredFields(requiredFieldSet, result);

    // ---
    ({ data, errors } = await execQuery<TQuery>(
      TOGGLE_SHARE_FILE_MUTATION,
      {
        fileId: _.get(pdfFile, 'id')
      },
      homeUser
    ));

    assert.ok(!errors, 'there should be no errors: ' + JSON.stringify(errors));

    result = data?.toggleShareFile;
    if (!result) throw GraphQLError.notFound('data');

    assert.equal(_.get(result, ['contract', 'id']), undefined, 'Incorrect file contract ID.');

    Test.Check.requiredFields(requiredFieldSet, result);
  });

  // error
  describe('', () => {
    const ctx = { sql, events: [] };
    let proUser: Test.TUser | undefined;
    let groupChat: Chat | undefined;
    let imgFile: File | undefined;

    before(async () => {
      proUser = _.find(outputData.users, { email: Email.Pro });
      groupChat = _.find(outputData.chats, { title: ChatTitle.Group });
      imgFile = _.find(outputData.filesInGroupChat, {
        mime: ChatFileType.Image
      });

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

    it('chat member cannot share not his file', async () => {
      const { errors } = await execQuery<TQuery>(
        TOGGLE_SHARE_FILE_MUTATION,
        {
          fileId: _.get(imgFile, 'id')
        },
        proUser
      );

      Test.Check.error(errors, new GraphQLError('That is not your file.', 403));
    });
  });

  it('user is not chat member', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });

    const pdfFile = _.find(outputData.filesInGroupChat, {
      mime: ChatFileType.PDF
    });

    const { errors } = await execQuery<TQuery>(
      TOGGLE_SHARE_FILE_MUTATION,
      {
        fileId: _.get(pdfFile, 'id')
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError('You are not a chat member.', 403));
  });

  it('cannot share/unshare files from general chat', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const pdfFile = _.find(outputData.filesInGeneralChat, {
      mime: ChatFileType.PDF
    });

    const { errors } = await execQuery<TQuery>(
      TOGGLE_SHARE_FILE_MUTATION,
      {
        fileId: _.get(pdfFile, 'id')
      },
      homeUser
    );

    Test.Check.error(errors, new GraphQLError('All files in #general chat are always shared.', 403));
  });

  it("other user have't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });

    const pdfFile = _.find(outputData.filesInGroupChat, {
      mime: ChatFileType.PDF
    });

    const { errors } = await execQuery<TQuery>(
      TOGGLE_SHARE_FILE_MUTATION,
      {
        fileId: _.get(pdfFile, 'id')
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('file not found', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const { errors } = await execQuery<TQuery>(
      TOGGLE_SHARE_FILE_MUTATION,
      {
        fileId: _.get(homeUser, 'id')
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('file'));
  });
});
