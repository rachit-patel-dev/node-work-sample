/*external modules*/
import _ from 'lodash';
import assert from 'assert';
/*DB*/
import * as db from '../../../../db';
import { UserRole } from '../../../../db/types/role';
import { Contract, ContractStatus } from '../../../../db/types/contract';
import { Collaborator, CollaboratorPermission } from '../../../../db/types/collaborator';
import { InviteType } from '../../../../db/types/invite';
import { ChatFileType } from '../../../../db/types/chat';
/*models*/
import { UserModel } from '../../../../db/models/UserModel';
import { CollaboratorModel } from '../../../../db/models/CollaboratorModel';
/*GQL*/
import { GraphQLError } from '../../../../gql';
import {
  checkAccessToFiles,
  BehaviorCheckAccessToFiles
} from '../../../../gql/resolvers/Directives/checkAccessToFiles';
/*other*/
import { Test } from '../../../helpers/Test';

export namespace TestData {
  // # CONST AND TYPES
  export const enum Email {
    ProOne = 'pro-1@test.com',
    ProTwo = 'pro-2@test.com',
    Home = 'home@test.com',
    CollaboratorOne = 'collaborator-1@test.com',
    CollaboratorTwo = 'collaborator-2@test.com',
    CollaboratorThree = 'collaborator-3@test.com',
    Other = 'other@test.com'
  }
  export const enum ContractName {
    WithFilesOne = 'WithFilesOne',
    WithFilesTwo = 'WithFilesTwo'
  }
  export enum FileName {
    First = 'First',
    Second = 'Second',
    Third = 'Third'
  }

  // # INPUT DATA AND TYPES
  export const inputData = {
    users: [
      {
        email: Email.Home,
        role: {
          name: UserRole.HomeOwner
        }
      },
      {
        email: Email.ProOne,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.ProTwo,
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
        email: Email.CollaboratorOne + CollaboratorPermission.Write + UserRole.Pro,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.CollaboratorTwo + CollaboratorPermission.Write + UserRole.HomeOwner,
        role: {
          name: UserRole.HomeOwner
        }
      },
      {
        email: Email.CollaboratorThree + CollaboratorPermission.Write + UserRole.Pro,
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
    contracts: [
      {
        name: ContractName.WithFilesOne,
        status: ContractStatus.Hired,
        $partnerEmail: Email.ProOne,
        collaborators: [
          {
            $email: Email.CollaboratorOne,
            permissions: CollaboratorPermission.Write,
            invite: {
              firstName: 'test pro',
              inviteMessage: 'test pro message',
              type: InviteType.ProjectProInvite,
              userRole: UserRole.Pro
            }
          },
          {
            $email: Email.CollaboratorTwo,
            permissions: CollaboratorPermission.Write,
            invite: {
              firstName: 'test home',
              inviteMessage: 'test home message',
              type: InviteType.ProjectOwnerInvite,
              userRole: UserRole.HomeOwner
            }
          }
        ],
        files: [
          {
            name: FileName.First,
            mime: ChatFileType.Image,
            $ownerEmail: Email.Home,
            $assignToContract: true,
            $assignees: [
              Email.CollaboratorOne + CollaboratorPermission.Write + UserRole.Pro,
              Email.CollaboratorTwo + CollaboratorPermission.Write + UserRole.HomeOwner
            ]
          },
          {
            name: FileName.Second,
            mime: ChatFileType.PDF,
            $ownerEmail: Email.ProOne,
            $assignToContract: false,
            $assignees: []
          },
          {
            name: FileName.Third,
            mime: ChatFileType.PDF,
            $ownerEmail: Email.ProOne,
            $assignToContract: false,
            $assignees: []
          }
        ]
      },
      {
        name: ContractName.WithFilesTwo,
        status: ContractStatus.Hired,
        $partnerEmail: Email.ProTwo,
        collaborators: [
          {
            $email: Email.CollaboratorThree,
            permissions: CollaboratorPermission.Write,
            invite: {
              firstName: 'test pro',
              inviteMessage: 'test pro message',
              type: InviteType.ProjectProInvite,
              userRole: UserRole.Pro
            }
          }
        ],
        files: [
          {
            name: FileName.First,
            mime: ChatFileType.Image,
            $ownerEmail: Email.Home,
            $assignToContract: true,
            $assignees: [Email.CollaboratorThree + CollaboratorPermission.Write + UserRole.Pro]
          },
          {
            name: FileName.Second,
            mime: ChatFileType.Image,
            $ownerEmail: Email.Home,
            $assignToContract: true,
            $assignees: [Email.CollaboratorThree + CollaboratorPermission.Write + UserRole.Pro]
          },
          {
            name: FileName.Third,
            mime: ChatFileType.PDF,
            $ownerEmail: Email.Home,
            $assignToContract: true,
            $assignees: []
          }
        ]
      }
    ]
  };

  export type TInputData = typeof inputData;

  // # OUTPUT DATA AND TYPES
  export type PopulatedContract = Contract & {
    collaborators: Array<Collaborator>;
    files: Array<Test.TFile>;
  };

  export type TOutputData = {
    users: Test.TUser[];
    contracts: PopulatedContract[];
  };

  // # CREATE FUNCTIONS
  export async function createOutputData(inputData: TInputData): Promise<TOutputData> {
    const ctx = { sql: db.sql, events: [] };

    return db.getClientTransaction(async client => {
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

      const projectGenerate = new Test.ProjectGenerate(client, ctx);
      await projectGenerate.create({
        ownerId: homeUser.lastRoleId,
        matchData: inputData.project.matchData as any
      });

      const contracts = await Promise.all(
        _.map(inputData.contracts, async contractInput => {
          const partner = _.find(users, { email: contractInput.$partnerEmail });
          if (!partner) throw GraphQLError.notFound(`partner by email: "${contractInput.$partnerEmail}"`);

          await projectGenerate.addContract({
            name: contractInput.name,
            status: contractInput.status,
            partnerId: partner.lastRoleId
          });

          const project = projectGenerate.project!;
          const contract = _.find(project.contracts, { name: contractInput.name })!;

          const collaborators = await Promise.all(
            _.map(contractInput.collaborators, async collaboratorData => {
              let userInvited;

              switch (collaboratorData.invite.userRole) {
                case UserRole.Pro:
                  userInvited = partner;
                  break;
                case UserRole.HomeOwner:
                  userInvited = homeUser;
                  break;
              }

              if (!userInvited) throw GraphQLError.notFound('user invited');

              const email = collaboratorData.$email + collaboratorData.permissions + collaboratorData.invite.userRole;

              const collaborator = _.find(users, { email });
              if (!collaborator) throw GraphQLError.notFound('collaborator');

              const inviteGenerate = new Test.InviteGenerate(client, ctx);
              await inviteGenerate.create({
                ...collaboratorData.invite,
                email: email,
                invitedById: userInvited.lastRoleId
              });

              const invite = inviteGenerate.invite!;

              const collaboratorGenerate = new Test.CollaboratorGenerate(client, ctx);
              await collaboratorGenerate.create({
                roleId: collaborator.lastRoleId,
                inviteId: invite.id,
                contractId: contract.id,
                invitedById: userInvited.lastRoleId,
                approvedById: homeUser.lastRoleId,
                userRole: collaborator.role!.name,
                email: email,
                permissions: collaboratorData.permissions
              });

              return collaboratorGenerate.collaborator!;
            })
          );

          const files = await Promise.all(
            _.map(contractInput.files, async fileInput => {
              const userOwner = _.find(users, { email: fileInput.$ownerEmail });
              if (!userOwner) throw GraphQLError.notFound('user owner file');

              const fileGenerate = new Test.FileGenerate(client, ctx);
              await fileGenerate.create({
                roleId: _.get(userOwner, 'lastRoleId'),
                ..._.pick(fileInput, ['name', 'mime']),
                ...(fileInput.$assignToContract ? { contractId: contract.id } : {})
              });

              if (!_.isEmpty(fileInput.$assignees)) {
                await Promise.all(
                  _.map(fileInput.$assignees, async collaboratorEmail => {
                    const collaborator = _.find(collaborators, { email: collaboratorEmail });
                    if (!collaborator) throw GraphQLError.notFound(`collaborator by email: ${collaboratorEmail}`);

                    await fileGenerate.addAssignees([collaborator]);
                  })
                );
              }

              return fileGenerate.file!;
            })
          );

          return Object.assign(contract, {
            collaborators,
            files
          });
        })
      );

      return {
        users,
        contracts
      };
    });
  }

  export async function removeOutputData(outputData: TOutputData): Promise<void> {
    const ctx = { sql: db.sql, events: [] };
    await db.getClientTransaction(async client => {
      await Promise.all(
        _.map(outputData.contracts, async contract => {
          if (!_.isEmpty(contract.collaborators)) {
            await Promise.all(
              _.map(contract.collaborators, collaborator =>
                CollaboratorModel.remove.exec(
                  client,
                  {
                    collaboratorId: collaborator.id
                  },
                  ctx
                )
              )
            );
          }
        })
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
  }
}

describe('gql/resolvers/Directives/checkAccessToFiles', () => {
  let outputData: TestData.TOutputData;

  before(async () => (outputData = await TestData.createOutputData(TestData.inputData)));

  after(async () => TestData.removeOutputData(outputData));

  // success
  it(`should be return files without contract if user is owner`, async () => {
    let error = null;
    try {
      const contract = _.find(outputData.contracts, { name: TestData.ContractName.WithFilesOne });
      if (!contract) throw GraphQLError.notFound('contract');

      const proUser = _.find(outputData.users, { email: TestData.Email.ProOne });
      if (!proUser) throw GraphQLError.notFound('user');

      const secondFile = _.find(contract.files, { name: TestData.FileName.Second });
      if (!secondFile) throw GraphQLError.notFound('file');

      const thirdFile = _.find(contract.files, { name: TestData.FileName.Third });
      if (!thirdFile) throw GraphQLError.notFound('file');

      const files = [secondFile, thirdFile];

      const ctx = {
        db,
        sql: db.sql,
        events: [],
        currentUser: proUser
      } as any;

      const result: Array<Test.TFile> = await checkAccessToFiles(
        async () => files,
        {},
        {
          behavior: BehaviorCheckAccessToFiles.After,
          checkContractAccess: true
        },
        ctx,
        {} as any
      );

      assert.ok(Array.isArray(result), 'Result must be array');
      assert.ok(_.size(result) === 2, 'Result array must be have length equal 2');

      Test.Check.data(result, file => {
        const localFile = _.find(files, { id: file.id });
        if (!localFile) throw GraphQLError.notFound('local file');

        return _.pick(localFile, ['id', 'name', 'mime']);
      });
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  it(`should be return files by access if user is collaborator`, async () => {
    let error = null;
    try {
      const contract = _.find(outputData.contracts, { name: TestData.ContractName.WithFilesTwo });
      if (!contract) throw GraphQLError.notFound('contract');

      const proWriteCollaborator = _.find(outputData.users, {
        email: TestData.Email.CollaboratorThree + CollaboratorPermission.Write + UserRole.Pro
      });
      if (!proWriteCollaborator) throw GraphQLError.notFound('user');

      const thirdFile = _.find(contract.files, { name: TestData.FileName.Third });
      if (!thirdFile) throw GraphQLError.notFound('file');

      const ctx = {
        db,
        sql: db.sql,
        events: [],
        currentUser: proWriteCollaborator
      } as any;

      const result: Array<Test.TFile> = await checkAccessToFiles(
        async () => contract.files,
        {},
        {
          behavior: BehaviorCheckAccessToFiles.After,
          checkContractAccess: true
        },
        ctx,
        {} as any
      );

      assert.ok(Array.isArray(result), 'Result must be array');
      assert.ok(_.size(result) === 2, 'Result array must be have length equal 2');
      assert.ok(!_.map(result, 'id').includes(thirdFile.id), 'Result files must be not include third file');

      Test.Check.data(result, file => {
        const localFile = _.find(contract.files, { id: file.id });
        if (!localFile) throw GraphQLError.notFound('local file');

        return _.pick(localFile, ['id', 'name', 'mime']);
      });
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  it(`should be return all files if user is contract holder`, async () => {
    let error = null;
    try {
      const contract = _.find(outputData.contracts, { name: TestData.ContractName.WithFilesTwo });
      if (!contract) throw GraphQLError.notFound('contract');

      const homeUser = _.find(outputData.users, { email: TestData.Email.Home });
      if (!homeUser) throw GraphQLError.notFound('user');

      const firstFile = _.find(contract.files, { name: TestData.FileName.First });
      if (!firstFile) throw GraphQLError.notFound('file');

      const secondFile = _.find(contract.files, { name: TestData.FileName.Second });
      if (!secondFile) throw GraphQLError.notFound('file');

      const files = [firstFile, secondFile];

      const ctx = {
        db,
        sql: db.sql,
        events: [],
        currentUser: homeUser
      } as any;

      const result: Array<Test.TFile> = await checkAccessToFiles(
        async () => [firstFile, secondFile],
        {},
        {
          behavior: BehaviorCheckAccessToFiles.After,
          checkContractAccess: true
        },
        ctx,
        {} as any
      );

      assert.ok(Array.isArray(result), 'Result must be array');
      assert.ok(_.size(result) === 2, 'Result array must be have length equal 2');

      Test.Check.data(result, file => {
        const localFile = _.find(files, { id: file.id });
        if (!localFile) throw GraphQLError.notFound('local file');

        return _.pick(localFile, ['id', 'name', 'mime']);
      });
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  it(`should be not return files if collaborator haven't access to files`, async () => {
    let error = null;
    try {
      const contract = _.find(outputData.contracts, { name: TestData.ContractName.WithFilesOne });
      if (!contract) throw GraphQLError.notFound('contract');

      const homeWriteCollaborator = _.find(outputData.users, {
        email: TestData.Email.CollaboratorTwo + CollaboratorPermission.Write + UserRole.HomeOwner
      });
      if (!homeWriteCollaborator) throw GraphQLError.notFound('user');

      const secondFile = _.find(contract.files, { name: TestData.FileName.Second });
      if (!secondFile) throw GraphQLError.notFound('file');

      const ctx = {
        db,
        sql: db.sql,
        events: [],
        currentUser: homeWriteCollaborator
      } as any;

      const result = await checkAccessToFiles(
        async () => [secondFile],
        {},
        {
          behavior: BehaviorCheckAccessToFiles.After,
          checkContractAccess: true
        },
        ctx,
        {} as any
      );

      assert.ok(Array.isArray(result) && _.isEmpty(result), 'Result must be empty array');
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  it(`should be not return files if user haven't access to contract`, async () => {
    let error = null;
    try {
      const contract = _.find(outputData.contracts, { name: TestData.ContractName.WithFilesOne });
      if (!contract) throw GraphQLError.notFound('contract');

      const otherUser = _.find(outputData.users, { email: TestData.Email.Other });
      if (!otherUser) throw GraphQLError.notFound('user');

      const firstFile = _.find(contract.files, { name: TestData.FileName.First });
      if (!firstFile) throw GraphQLError.notFound('file');

      const ctx = {
        db,
        sql: db.sql,
        events: [],
        currentUser: otherUser
      } as any;

      const result = await checkAccessToFiles(
        async () => [firstFile],
        {},
        {
          behavior: BehaviorCheckAccessToFiles.After,
          checkContractAccess: true
        },
        ctx,
        {} as any
      );

      assert.ok(Array.isArray(result) && _.isEmpty(result), 'Result must be empty array');
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  it(`should be return files if user is not assigned to contract and flag checkContractAccess not passed`, async () => {
    let error = null;
    try {
      const contract = _.find(outputData.contracts, { name: TestData.ContractName.WithFilesOne });
      if (!contract) throw GraphQLError.notFound('contract');

      const otherUser = _.find(outputData.users, { email: TestData.Email.Other });
      if (!otherUser) throw GraphQLError.notFound('user');

      const firstFile = _.find(contract.files, { name: TestData.FileName.First });
      if (!firstFile) throw GraphQLError.notFound('file');

      const ctx = {
        db,
        sql: db.sql,
        events: [],
        currentUser: otherUser
      } as any;

      const result = await checkAccessToFiles(
        async () => [firstFile],
        {},
        {
          behavior: BehaviorCheckAccessToFiles.After,
          checkContractAccess: false
        },
        ctx,
        {} as any
      );

      assert.ok(Array.isArray(result), 'Result must be array');
      Test.Check.data(result, _.pick(firstFile, ['id', 'name', 'mime']));
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  describe('behavior "After"', () => {
    it('if argument is array of files', async () => {
      let error = null;
      try {
        const contract = _.find(outputData.contracts, { name: TestData.ContractName.WithFilesOne });
        if (!contract) throw GraphQLError.notFound('contract');

        const homeUser = _.find(outputData.users, { email: TestData.Email.Home });
        if (!homeUser) throw GraphQLError.notFound('user');

        const firstFile = _.find(contract.files, { name: TestData.FileName.First });
        if (!firstFile) throw GraphQLError.notFound('file');

        const ctx = {
          db,
          sql: db.sql,
          events: [],
          currentUser: homeUser
        } as any;

        const result = await checkAccessToFiles(
          async () => [firstFile],
          {},
          {
            behavior: BehaviorCheckAccessToFiles.After
          },
          ctx,
          {} as any
        );

        assert.ok(Array.isArray(result), 'Result must be array');
        Test.Check.data(result, _.pick(firstFile, ['id', 'name', 'mime']));
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('if argument is single file', async () => {
      let error = null;
      try {
        const contract = _.find(outputData.contracts, { name: TestData.ContractName.WithFilesOne });
        if (!contract) throw GraphQLError.notFound('contract');

        const homeUser = _.find(outputData.users, { email: TestData.Email.Home });
        if (!homeUser) throw GraphQLError.notFound('user');

        const firstFile = _.find(contract.files, { name: TestData.FileName.First });
        if (!firstFile) throw GraphQLError.notFound('file');

        const ctx = {
          db,
          sql: db.sql,
          events: [],
          currentUser: homeUser
        } as any;

        const result = await checkAccessToFiles(
          async () => firstFile,
          {},
          {
            behavior: BehaviorCheckAccessToFiles.After
          },
          ctx,
          {} as any
        );

        assert.ok(!Array.isArray(result), 'Result must be not array');
        Test.Check.data(result, _.pick(firstFile, ['id', 'name', 'mime']));
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('should be return data if data is empty', async () => {
      let error = null;
      try {
        const contract = _.find(outputData.contracts, { name: TestData.ContractName.WithFilesOne });
        if (!contract) throw GraphQLError.notFound('contract');

        const homeUser = _.find(outputData.users, { email: TestData.Email.Home });
        if (!homeUser) throw GraphQLError.notFound('user');

        const ctx = {
          db,
          sql: db.sql,
          events: [],
          currentUser: homeUser
        } as any;

        const result = {
          task: {
            files: undefined
          }
        };

        await checkAccessToFiles(
          async () => result,
          {},
          {
            behavior: BehaviorCheckAccessToFiles.After,
            filesPath: 'task.files'
          },
          ctx,
          {} as any
        );

        assert.ok(result.task.files === undefined, 'Result must be equal undefined');
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('data must be taken by path and set by path to result', async () => {
      let error = null;
      try {
        const contract = _.find(outputData.contracts, { name: TestData.ContractName.WithFilesOne });
        if (!contract) throw GraphQLError.notFound('contract');

        const homeUser = _.find(outputData.users, { email: TestData.Email.Home });
        if (!homeUser) throw GraphQLError.notFound('user');

        const firstFile = _.find(contract.files, { name: TestData.FileName.First });
        if (!firstFile) throw GraphQLError.notFound('file');

        const ctx = {
          db,
          sql: db.sql,
          events: [],
          currentUser: homeUser
        } as any;

        const result = {
          task: {
            files: [firstFile]
          }
        };

        await checkAccessToFiles(
          async () => result,
          {},
          {
            behavior: BehaviorCheckAccessToFiles.After,
            filesPath: 'task.files'
          },
          ctx,
          {} as any
        );

        Test.Check.data(result, {
          task: {
            files: {
              $check: 'every',
              $value: v => _.isEqual(_.pick(v, ['id', 'name', 'mime']), _.pick(firstFile, ['id', 'name', 'mime']))
            }
          }
        });
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });
  });

  describe('behavior "Before"', () => {
    it('if argument is array of file ids', async () => {
      let error = null;
      try {
        const contract = _.find(outputData.contracts, { name: TestData.ContractName.WithFilesOne });
        if (!contract) throw GraphQLError.notFound('contract');

        const proUser = _.find(outputData.users, { email: TestData.Email.ProOne });
        if (!proUser) throw GraphQLError.notFound('user');

        const firstFile = _.find(contract.files, { name: TestData.FileName.First });
        if (!firstFile) throw GraphQLError.notFound('file');

        const ctx = {
          db,
          sql: db.sql,
          events: [],
          currentUser: proUser
        } as any;

        const source = {
          files: [firstFile.id]
        };

        const result = await checkAccessToFiles(
          async () => {},
          source,
          {
            behavior: BehaviorCheckAccessToFiles.Before,
            filesPath: 'files'
          },
          ctx,
          {
            variableValues: {}
          } as any
        );

        assert.ok(Array.isArray(result), 'Result must be array');
        Test.Check.data(result, _.pick(firstFile, ['id', 'name', 'mime']));
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('if argument is single file id', async () => {
      let error = null;
      try {
        const contract = _.find(outputData.contracts, { name: TestData.ContractName.WithFilesOne });
        if (!contract) throw GraphQLError.notFound('contract');

        const proUser = _.find(outputData.users, { email: TestData.Email.ProOne });
        if (!proUser) throw GraphQLError.notFound('user');

        const firstFile = _.find(contract.files, { name: TestData.FileName.First });
        if (!firstFile) throw GraphQLError.notFound('file');

        const ctx = {
          db,
          sql: db.sql,
          events: [],
          currentUser: proUser
        } as any;

        const source = {
          files: firstFile.id
        };

        const result = await checkAccessToFiles(
          async () => {},
          source,
          {
            behavior: BehaviorCheckAccessToFiles.Before,
            filesPath: 'files'
          },
          ctx,
          {
            variableValues: {}
          } as any
        );

        assert.ok(!Array.isArray(result), 'Result must be not array');
        Test.Check.data(result, _.pick(firstFile, ['id', 'name', 'mime']));
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('should be return data if data is empty', async () => {
      let error = null;
      try {
        const contract = _.find(outputData.contracts, { name: TestData.ContractName.WithFilesOne });
        if (!contract) throw GraphQLError.notFound('contract');

        const proUser = _.find(outputData.users, { email: TestData.Email.ProOne });
        if (!proUser) throw GraphQLError.notFound('user');

        const ctx = {
          db,
          sql: db.sql,
          events: [],
          currentUser: proUser
        } as any;

        const source = {
          entity: {
            files: []
          }
        };

        const result = await checkAccessToFiles(
          async () => {},
          source,
          {
            behavior: BehaviorCheckAccessToFiles.Before,
            filesPath: 'entity.files'
          },
          ctx,
          {
            variableValues: {}
          } as any
        );

        assert.ok(_.isEmpty(result), 'Result must be empty');
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('data must be taken from source if definition on Type', async () => {
      let error = null;
      try {
        const contract = _.find(outputData.contracts, { name: TestData.ContractName.WithFilesOne });
        if (!contract) throw GraphQLError.notFound('contract');

        const proUser = _.find(outputData.users, { email: TestData.Email.ProOne });
        if (!proUser) throw GraphQLError.notFound('user');

        const firstFile = _.find(contract.files, { name: TestData.FileName.First });
        if (!firstFile) throw GraphQLError.notFound('file');

        const ctx = {
          db,
          sql: db.sql,
          events: [],
          currentUser: proUser
        } as any;

        const source = {
          decision: {
            files: [firstFile.id]
          }
        };

        const result = await checkAccessToFiles(
          async () => {},
          source,
          {
            behavior: BehaviorCheckAccessToFiles.Before,
            filesPath: 'decision.files'
          },
          ctx,
          {
            variableValues: {}
          } as any
        );

        Test.Check.data(result, _.pick(firstFile, ['id', 'name', 'mime']));
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('data must be taken from variableValues if definition on Query / Mutation / Subscription', async () => {
      let error = null;
      try {
        const contract = _.find(outputData.contracts, { name: TestData.ContractName.WithFilesOne });
        if (!contract) throw GraphQLError.notFound('contract');

        const proUser = _.find(outputData.users, { email: TestData.Email.ProOne });
        if (!proUser) throw GraphQLError.notFound('user');

        const firstFile = _.find(contract.files, { name: TestData.FileName.First });
        if (!firstFile) throw GraphQLError.notFound('file');

        const ctx = {
          db,
          sql: db.sql,
          events: [],
          currentUser: proUser
        } as any;

        const rootValue = {};

        const info = {
          variableValues: {
            task: {
              files: [firstFile.id]
            }
          },
          rootValue
        } as any;

        const result = await checkAccessToFiles(
          async () => {},
          rootValue,
          {
            behavior: BehaviorCheckAccessToFiles.Before,
            filesPath: 'task.files'
          },
          ctx,
          info
        );

        Test.Check.data(result, _.pick(firstFile, ['id', 'name', 'mime']));
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });
  });

  it('must be return empty array if current user is empty', async () => {
    let error = null;
    try {
      const ctx = {
        db,
        sql: db.sql,
        events: []
      } as any;

      const result = await checkAccessToFiles(
        async () => {},
        {},
        {
          behavior: BehaviorCheckAccessToFiles.Before
        },
        ctx,
        {
          variableValues: {}
        } as any
      );

      assert.ok(Array.isArray(result) && result.length === 0, 'Must be return empty array');
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  // error
  it('files path required for behavior "Before"', async () => {
    let error = null;
    try {
      const ctx = {
        db,
        sql: db.sql,
        events: [],
        currentUser: {}
      } as any;

      await checkAccessToFiles(
        async () => {},
        {},
        {
          behavior: BehaviorCheckAccessToFiles.Before
        },
        ctx,
        {
          variableValues: {}
        } as any
      );
    } catch (e) {
      error = e;
      Test.Check.error(e, new GraphQLError(`Files path required`));
    } finally {
      assert(error !== null, 'Must be error.');
    }
  });
});
