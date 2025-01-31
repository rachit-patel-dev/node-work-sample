/*external modules*/
import moment from 'moment';
import _ from 'lodash';
import assert from 'assert';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Collaborator, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { Task } from '../../../../../db/types/task';
import { DecisionSelectionType, DecisionStatus } from '../../../../../db/types/decision';
import { ContractPermissionResult } from '../../../../../db/types/contract';
import { getTaskTotal } from '../../../../../db/dataUtils/getTaskTotal';
import { ActionType } from '../../../../../db/types/actionType';
import { File } from '../../../../../db/types/file';
import { ChatFileType } from '../../../../../db/types/chat';
/*models*/
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
import { UserModel } from '../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { Decision } from '../../../../../gql/resolvers/Types/Decision';
import { WhoCanSeeFiles } from '../../../../../gql/resolvers/Types/File';
/*other*/
import { Test } from '../../../../helpers/Test';
import { safeHtml } from '../../../../../utils/safeHtml';

type TQuery = { createDecision: Decision };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  Chat = 'Chat',
  Decision = 'Decision'
}
export enum FileName {
  First = 'first',
  Second = 'second'
}

interface OutputData {
  users: Test.TUser[];
  project: Test.TProject;
  task: Task;
  collaborators: Collaborator[];
  files: File[];
}

const requiredFieldSet: Test.TFieldSet<Decision> = {
  scalar: ['id', 'selectionType', 'dueDate', 'status', 'allowance'],
  object: ['task', 'createdBy'],
  array: ['decisionMakers', 'options']
};

const CREATE_DECISION_MUTATION = `mutation (
  $taskId: ID!,
  $title: String!,
  $dueDate: DateTime!,
  $allowance: Int!,
  $selectionType: DecisionSelectionType,
  $makers: [DecisionMakerInput!]!,
  $options: [DecisionOptionInput!]!,
  $notes: String,
  $whoCanSeeFiles: WhoCanSeeFiles
) {
  createDecision(
    taskId: $taskId,
    title: $title,
    dueDate: $dueDate,
    allowance: $allowance,
    selectionType: $selectionType,
    makers: $makers,
    options: $options,
    notes: $notes,
    whoCanSeeFiles: $whoCanSeeFiles
  ) {
      id
      selectionType
      notes
      dueDate
      status
      allowance

      task {
        id
      }
      createdBy {
        id
      }
      result {
        id
      }

      decisionMakers {
        id
      }
      options {
        id
        option
        cost

        files {
          id
          name
          mime

          assignees {
            id
            email
          }
        }
      }
  }
}`;

describe('gql/resolvers/Mutation/decisions/create', () => {
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
        email: Email.Collaborator + CollaboratorPermission.Read + UserRole.Pro,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.Collaborator + CollaboratorPermission.Write + UserRole.Pro,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner,
        role: {
          name: UserRole.HomeOwner
        }
      }
    ],
    collaborators: [
      {
        permissions: CollaboratorPermission.Read,
        invite: {
          firstName: 'test',
          inviteMessage: 'test message',
          type: InviteType.ContractCollaborator,
          userRole: UserRole.Pro
        }
      },
      {
        permissions: CollaboratorPermission.Write,
        invite: {
          firstName: 'test pro',
          inviteMessage: 'test pro message',
          type: InviteType.ProjectProInvite,
          userRole: UserRole.Pro
        }
      },
      {
        permissions: CollaboratorPermission.Full,
        invite: {
          firstName: 'test home',
          inviteMessage: 'test home message',
          type: InviteType.ProjectOwnerInvite,
          userRole: UserRole.HomeOwner
        }
      }
    ],
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.Decision
    },
    phase: {
      name: 'decision',
      order: 1000
    },
    task: {
      name: 'decision task',
      materialCost: 100,
      laborCost: 100,
      otherCost: 100,
      markupPercent: 20,
      order: 500
    },
    payment: {
      payoutRequestedAt: new Date(),
      operation: {
        amount: 100,
        stripeId: '1',
        availableAt: new Date()
      }
    },
    decision: {
      title: 'test',
      dueDate: moment().format('YYYY-MM-DD'),
      notes: '<test>',
      allowance: 100,
      selectionType: DecisionSelectionType.Single,
      options: [
        {
          option: '>test<',
          cost: 1,
          actionType: ActionType.Create
        }
      ]
    },
    files: [
      {
        name: FileName.First,
        mime: ChatFileType.Image,
        $ownerEmail: Email.Collaborator + CollaboratorPermission.Write + UserRole.Pro
      },
      {
        name: FileName.Second,
        mime: ChatFileType.PDF,
        $ownerEmail: Email.Collaborator + CollaboratorPermission.Write + UserRole.Pro
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

      const contract = _.find(project.contracts, {
        name: ContractName.Decision
      });
      if (!contract) throw GraphQLError.notFound('contract');

      const collaborators = await Promise.all(
        _.map(inputData.collaborators, async collaboratorData => {
          let userInvited;

          switch (collaboratorData.invite.userRole) {
            case UserRole.Pro:
              userInvited = proUser;
              break;
            case UserRole.HomeOwner:
              userInvited = homeUser;
              break;
          }

          if (!userInvited) throw GraphQLError.notFound('user invited');

          const email = Email.Collaborator + collaboratorData.permissions + collaboratorData.invite.userRole;
          const collaborator = _.find(users, { email });

          if (!collaborator) throw GraphQLError.notFound('collaborator');

          const inviteProGenerate = new Test.InviteGenerate(client, ctx);
          await inviteProGenerate.create({
            ...collaboratorData.invite,
            email: email,
            invitedById: userInvited.lastRoleId
          });

          const invite = inviteProGenerate.invite!;

          const collaboratorProGenerate = new Test.CollaboratorGenerate(client, ctx);
          await collaboratorProGenerate.create({
            roleId: collaborator.lastRoleId,
            inviteId: invite.id,
            contractId: contract.id,
            invitedById: userInvited.lastRoleId,
            approvedById: homeUser.lastRoleId,
            userRole: collaborator.role!.name,
            email: email,
            permissions: collaboratorData.permissions
          });

          return collaboratorProGenerate.collaborator!;
        })
      );

      const paymentGenerate = new Test.PaymentGenerate(client, ctx);
      await paymentGenerate.createCharge(inputData.payment.operation);
      await paymentGenerate.createPayment(inputData.payment);

      const payment = paymentGenerate.payment!;

      const phaseGenerate = new Test.PhaseGenerate(client, ctx);
      await phaseGenerate.create({
        contractId: contract.id,
        ...inputData.phase
      });
      await phaseGenerate.addTask({
        creatorId: homeUser.lastRoleId,
        paymentId: payment.id,
        ...inputData.task
      });

      const phase = phaseGenerate.phase!;
      if (!phase.tasks) throw GraphQLError.notFound('tasks');

      const task = phase.tasks[0]!;

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
        task,
        collaborators,
        files
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      await Promise.all(
        _.map(outputData.collaborators, collaborator =>
          CollaboratorModel.remove.exec(
            client,
            {
              collaboratorId: collaborator.id
            },
            ctx
          )
        )
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
  it('allow pro to create decision', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    const task = _.get(outputData, 'task');

    const makers = [
      {
        roleId: homeUser.lastRoleId,
        actionType: ActionType.Create
      }
    ];

    const { data, errors } = await execQuery<TQuery>(
      CREATE_DECISION_MUTATION,
      {
        taskId: _.get(task, 'id'),
        makers,
        ...inputData.decision
      },
      proUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.createDecision;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        selectionType: _.get(inputData, ['decision', 'selectionType']),
        notes: safeHtml(_.get(inputData, ['decision', 'notes'])),
        status: DecisionStatus.Draft,
        allowance: _.get(inputData, ['decision', 'allowance']),
        'task.id': _.get(task, 'id'),
        'createdBy.id': _.get(proUser, 'lastRoleId'),
        dueDate: {
          $check: 'equal',
          $value: _.get(inputData, ['decision', 'dueDate']),
          $func: (date: Date) => moment(date).valueOf()
        },
        options: {
          0: {
            option: safeHtml(_.get(inputData, ['decision', 'options', 0, 'option'])),
            cost: _.get(inputData, ['decision', 'options', 0, 'cost'])
          }
        },
        result: {
          $check: 'strictEqual',
          $value: null
        },
        decisionMakers: {
          $check: 'some',
          $value: (maker: Test.TUser) => maker.id === homeUser.lastRoleId
        }
      },
      requiredFieldSet
    );
  });

  it('allow collaborator to create decision', async () => {
    const homeCollaboratorUser = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });
    if (!homeCollaboratorUser) throw GraphQLError.notFound('home collaborator user');

    const homeCollaborator = _.find(outputData.collaborators, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });
    if (!homeCollaborator) throw GraphQLError.notFound('home collaborator');

    const proCollaboratorUser = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Write + UserRole.Pro
    });
    if (!proCollaboratorUser) throw GraphQLError.notFound('pro collaborator user');

    const proCollaborator = _.find(outputData.collaborators, {
      email: Email.Collaborator + CollaboratorPermission.Write + UserRole.Pro
    });
    if (!proCollaborator) throw GraphQLError.notFound('pro collaborator');

    const task = _.get(outputData, 'task');

    const makers = [
      {
        roleId: homeCollaboratorUser.lastRoleId,
        actionType: ActionType.Create
      }
    ];

    const { data, errors } = await execQuery<TQuery>(
      CREATE_DECISION_MUTATION,
      {
        taskId: _.get(task, 'id'),
        makers,
        ...inputData.decision,
        options: _.map(inputData.decision.options, option => {
          return {
            ...option,
            files: _.map(outputData.files, file => ({
              id: file.id,
              actionType: ActionType.Create
            }))
          };
        }),
        whoCanSeeFiles: WhoCanSeeFiles.MinPermission
      },
      proCollaboratorUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.createDecision;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        selectionType: _.get(inputData, ['decision', 'selectionType']),
        notes: safeHtml(_.get(inputData, ['decision', 'notes'])),
        status: DecisionStatus.Draft,
        allowance: _.get(inputData, ['decision', 'allowance']),
        'createdBy.id': _.get(proCollaboratorUser, 'lastRoleId'),
        'task.id': _.get(task, 'id'),
        options: {
          0: {
            option: safeHtml(_.get(inputData, ['decision', 'options', 0, 'option'])),
            cost: _.get(inputData, ['decision', 'options', 0, 'cost'])
          }
        },
        dueDate: {
          $check: 'equal',
          $value: _.get(inputData, ['decision', 'dueDate']),
          $func: (date: Date) => moment(date).valueOf()
        },
        result: {
          $check: 'strictEqual',
          $value: null
        },
        decisionMakers: {
          $check: 'some',
          $value: (maker: Test.TUser) => maker.id === homeCollaboratorUser.lastRoleId
        }
      },
      requiredFieldSet
    );

    Test.Check.data(result.options, option => {
      assert.ok(option.files.length === 2, 'Option must be have 2 files');

      Test.Check.data(option.files, file => {
        const localFile = _.find(outputData.files, { id: file.id });
        if (!localFile) throw GraphQLError.notFound('local file');

        assert.ok(
          _.isEqual(_.map(file.assignees, 'id').sort(), [homeCollaborator.id, proCollaborator.id].sort()),
          'Assignees must be equal'
        );

        return _.pick(localFile, ['id', 'name', 'mime']);
      });

      return {
        option: safeHtml(_.get(inputData, ['decision', 'options', 0, 'option'])),
        cost: _.get(inputData, ['decision', 'options', 0, 'cost'])
      };
    });
  });

  // error
  it('makers must have the role of "HomeOwner"', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    const task = _.get(outputData, 'task');

    const makers = [
      {
        roleId: _.get(proUser, 'lastRoleId'),
        actionType: ActionType.Create
      }
    ];

    const { errors } = await execQuery<TQuery>(
      CREATE_DECISION_MUTATION,
      {
        taskId: _.get(task, 'id'),
        makers,
        ...inputData.decision
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.BadRole, 403));
  });

  it('field "option" in options is required', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    const task = _.get(outputData, 'task');

    const { errors } = await execQuery<TQuery>(
      CREATE_DECISION_MUTATION,
      {
        taskId: _.get(task, 'id'),
        makers: [],
        options: [
          {
            actionType: ActionType.Create
          }
        ],
        ..._.omit(inputData.decision, 'options')
      },
      homeUser
    );

    Test.Check.error(errors, new GraphQLError('Field "option" in options is required.'));
  });

  it(`user with role "HomeOwner" can't create decision`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const task = _.get(outputData, 'task');

    const { errors } = await execQuery<TQuery>(
      CREATE_DECISION_MUTATION,
      {
        taskId: _.get(task, 'id'),
        makers: [],
        ...inputData.decision
      },
      homeUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.BadRole, 403));
  });

  it("allowance can't be more total task cost", async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    const task = _.get(outputData, 'task');

    const { errors } = await execQuery<TQuery>(
      CREATE_DECISION_MUTATION,
      {
        taskId: _.get(task, 'id'),
        makers: [],
        allowance: getTaskTotal(task) + 100,
        ..._.omit(inputData.decision, 'allowance')
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError("Allowance can't be more total task cost."));
  });

  it("other user have't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });

    const task = _.get(outputData, 'task');

    const { errors } = await execQuery<TQuery>(
      CREATE_DECISION_MUTATION,
      {
        taskId: _.get(task, 'id'),
        makers: [],
        ...inputData.decision
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('contract not found by task', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    const { errors } = await execQuery<TQuery>(
      CREATE_DECISION_MUTATION,
      {
        taskId: _.get(homeUser, 'lastRoleId'),
        makers: [],
        ...inputData.decision
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('contract'));
  });
});
