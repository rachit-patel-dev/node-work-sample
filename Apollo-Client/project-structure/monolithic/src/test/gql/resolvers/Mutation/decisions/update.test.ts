/*external modules*/
import moment from 'moment';
import _ from 'lodash';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Collaborator, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { Task } from '../../../../../db/types/task';
import { DecisionSelectionType, DecisionStatus } from '../../../../../db/types/decision';
import { ContractPermissionResult } from '../../../../../db/types/contract';
import { File } from '../../../../../db/types/file';
import { ChatFileType } from '../../../../../db/types/chat';
import { ActionType } from '../../../../../db/types/actionType';
/*models*/
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
import { UserModel } from '../../../../../db/models/UserModel';
import { DecisionModel } from '../../../../../db/models/DecisionModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { Decision } from '../../../../../gql/resolvers/Types/Decision';
import { DecisionOption } from '../../../../../gql/resolvers/Types/Decision/DecisionOption';
/*other*/
import { Test } from '../../../../helpers/Test';
import { safeHtml } from '../../../../../utils/safeHtml';
import { getTaskTotal } from '../../../../../db/dataUtils/getTaskTotal';

type TQuery = { updateDecision: Decision };

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

interface OutputData {
  users: Test.TUser[];
  project: Test.TProject;
  decision: Test.TDecision;
  task: Task;
  files: File[];
  collaborators: Collaborator[];
}

const requiredFieldSet: Test.TFieldSet<Decision> = {
  scalar: ['id', 'selectionType', 'dueDate', 'status', 'allowance'],
  object: ['task', 'createdBy'],
  array: ['decisionMakers', 'options']
};

const UPDATE_DECISION_MUTATION = `mutation (
  $decisionId: ID!,
  $title: String,
  $dueDate: DateTime,
  $allowance: Int,
  $selectionType: DecisionSelectionType,
  $makers: [DecisionMakerInput!],
  $options: [DecisionOptionInput!],
  $notes: String
) {
  updateDecision(
    decisionId: $decisionId,
    title: $title,
    dueDate: $dueDate,
    selectionType: $selectionType,
    allowance: $allowance,
    makers: $makers,
    options: $options,
    notes: $notes
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
        createdBy {
          id
        }

        files {
          id
        }
      }
  }
}`;

describe('gql/resolvers/Mutation/decisions/update', () => {
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
      dueDate: moment()
        .add(1, 'day')
        .toDate(),
      selectionType: DecisionSelectionType.Single,
      allowance: 250,
      options: [
        {
          ownerEmail: Email.Pro,
          option: '>test<',
          cost: 100
        },
        {
          ownerEmail: Email.Pro,
          option: 'pro',
          cost: 150
        },
        {
          ownerEmail: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner,
          option: '>test<',
          cost: 200
        },
        {
          ownerEmail: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner,
          option: 'maker',
          cost: 250
        }
      ]
    },
    files: [
      {
        name: 'test',
        mime: ChatFileType.Image,
        ownerEmail: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
      },
      {
        name: 'test',
        mime: ChatFileType.PDF,
        ownerEmail: Email.Pro
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

      const decisionGenerate = new Test.DecisionGenerate(client, ctx);
      await decisionGenerate.create({
        taskId: task.id,
        dueDate: _.get(inputData, ['decision', 'dueDate']),
        createdById: _.get(proUser, 'lastRoleId'),
        title: _.get(inputData, ['decision', 'title']),
        allowance: _.get(inputData, ['decision', 'allowance'])
      });

      await Promise.all(
        _.map(inputData.decision.options, optionData => {
          const { option, cost, ownerEmail } = optionData;

          const createdBy = _.find(users, { email: ownerEmail });
          if (!createdBy) throw GraphQLError.notFound('created');

          return decisionGenerate.addOption({
            createdById: _.get(createdBy, 'lastRoleId'),
            option,
            cost
          });
        })
      );

      const homeCollaborator = _.find(users, {
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
      });
      if (!homeCollaborator) throw GraphQLError.notFound('home collaborator');
      await decisionGenerate.addMakers({
        makerIds: [_.get(homeUser, 'lastRoleId'), _.get(homeCollaborator, 'lastRoleId')]
      });

      const decision = decisionGenerate.decision!;

      const files = await Promise.all(
        _.map(inputData.files, async file => {
          const userOwner = _.find(users, { email: file.ownerEmail });
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
        files,
        collaborators,
        decision
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
  it('allow pro to update decision', async () => {
    const proUser = _.find(outputData.users, {
      email: Email.Pro
    });
    if (!proUser) throw GraphQLError.notFound('pro');

    const homeUser = _.find(outputData.users, {
      email: Email.Home
    });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const homeCollaborator = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });
    if (!homeCollaborator) throw GraphQLError.notFound('home collaborator');

    const decision = _.get(outputData, 'decision');

    const proFile = _.find(outputData.files, {
      roleId: _.get(proUser, 'lastRoleId')
    });
    const files = [
      {
        id: _.get(proFile, 'id'),
        actionType: ActionType.Create
      }
    ];

    const decisionOptionDataToCreate = {
      option: _.get(proUser, 'lastRoleId'),
      cost: 123,
      actionType: ActionType.Create,
      files
    };

    const makerDecisionOptionToUpdate = _.find(decision.options, {
      createdById: _.get(homeCollaborator, 'lastRoleId')
    });
    const decisionOptionDataToUpdate = {
      id: _.get(makerDecisionOptionToUpdate, 'id'),
      option: 'not equal',
      cost: 222,
      actionType: ActionType.Update
    };

    const proDecisionOptionToDelete = _.findLast(decision.options, {
      createdById: _.get(proUser, 'lastRoleId')
    });
    const decisionOptionDataToDelete = {
      id: _.get(proDecisionOptionToDelete, 'id'),
      actionType: ActionType.Delete
    };

    const updateDecisionData = {
      decisionId: _.get(decision, 'id'),
      title: 'new pro',
      selectionType: DecisionSelectionType.Multiple,
      dueDate: moment()
        .add(3, 'days')
        .format('YYYY-MM-DD'),
      notes: '<new note>',
      makers: [
        {
          roleId: _.get(homeUser, 'lastRoleId'),
          actionType: ActionType.Delete
        }
      ],
      options: [decisionOptionDataToCreate, decisionOptionDataToUpdate, decisionOptionDataToDelete]
    };

    const { data, errors } = await execQuery<TQuery>(UPDATE_DECISION_MUTATION, updateDecisionData, proUser);

    Test.Check.noErrors(errors, 'error');

    const result = data?.updateDecision;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        id: {
          $check: 'equal',
          $value: _.get(decision, 'id'),
          $eMessage: 'Incorrect decision ID'
        },
        selectionType: _.get(updateDecisionData, 'selectionType'),
        notes: safeHtml(_.get(updateDecisionData, 'notes')),
        status: DecisionStatus.Draft,
        allowance: _.get(inputData, ['decision', 'allowance']),
        'task.id': _.get(outputData, ['task', 'id']),
        'createdBy.id': _.get(proUser, 'lastRoleId'),
        dueDate: {
          $check: 'equal',
          $value: _.get(updateDecisionData, 'dueDate'),
          $func: (date: Date) => moment(date).valueOf()
        },
        result: {
          $check: 'strictEqual',
          $value: null
        },
        decisionMakers: {
          $check: 'every',
          $value: (maker: Test.TUser) => _.get(maker, 'id') !== _.get(homeUser, 'lastRoleId')
        },
        options: {
          $check: 'every',
          $value: (option: DecisionOption) => _.get(option, 'id') !== _.get(decisionOptionDataToDelete, 'id')
        }
      },
      requiredFieldSet
    );

    Test.Check.data(
      _.find(result.options, { option: _.get(proUser, 'lastRoleId') }), // createdDecisionOption
      {
        cost: {
          $check: 'equal',
          $value: _.get(decisionOptionDataToCreate, 'cost'),
          $eMessage: 'Incorrect cost in created decision option.'
        },
        option: {
          $check: 'equal',
          $value: _.get(decisionOptionDataToCreate, 'option'),
          $eMessage: 'Incorrect option in created decision option.'
        },
        'createdBy.id': {
          $check: 'equal',
          $value: _.get(proUser, 'lastRoleId'),
          $eMessage: 'Incorrect created by ID in created decision option.'
        },
        'files.0.id': {
          $check: 'equal',
          $value: _.get(files, [0, 'id']),
          $eMessage: 'Incorrect file ID created decision option.'
        }
      }
    );

    Test.Check.data(
      _.find(result.options, { id: _.get(decisionOptionDataToUpdate, 'id') }), // updatedDecisionOption
      {
        cost: {
          $check: 'equal',
          $value: _.get(decisionOptionDataToUpdate, 'cost'),
          $eMessage: 'Incorrect ID in updated decision option.'
        },
        'createdBy.id': {
          $check: 'equal',
          $value: _.get(homeCollaborator, 'lastRoleId'),
          $eMessage: 'Incorrect created by ID in updated decision option.'
        },
        option: {
          $check: 'notEqual',
          $value: _.get(decisionOptionDataToUpdate, 'option'),
          $eMessage: 'Incorrect option in updated decision option.'
        }
      }
    );
  });

  it('allow maker to update decision', async () => {
    const homeCollaborator = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });
    if (!homeCollaborator) throw GraphQLError.notFound('home collaborator');

    const proUser = _.find(outputData.users, {
      email: Email.Pro
    });
    if (!proUser) throw GraphQLError.notFound('pro');

    const decision = _.get(outputData, 'decision');

    const proFile = _.find(outputData.files, {
      roleId: _.get(proUser, 'lastRoleId')
    });
    const makerFile = _.find(outputData.files, {
      roleId: _.get(homeCollaborator, 'lastRoleId')
    });
    const files = [
      {
        id: _.get(makerFile, 'id'),
        actionType: ActionType.Create
      },
      {
        id: _.get(proFile, 'id'),
        actionType: ActionType.Delete
      }
    ];

    const decisionOptionDataToCreate = {
      option: 'test maker create',
      cost: 1223456430,
      actionType: ActionType.Create
    };

    const makerDecisionOptionToUpdate = _.find(decision.options, {
      createdById: _.get(homeCollaborator, 'lastRoleId')
    });
    const decisionOptionDataToUpdate = {
      id: _.get(makerDecisionOptionToUpdate, 'id'),
      option: 'update maker option',
      cost: 1223456430,
      actionType: ActionType.Update,
      files
    };

    const updateDecisionData = {
      decisionId: _.get(decision, 'id'),
      options: [decisionOptionDataToCreate, decisionOptionDataToUpdate]
    };

    const { data, errors } = await execQuery<TQuery>(UPDATE_DECISION_MUTATION, updateDecisionData, homeCollaborator);

    Test.Check.noErrors(errors, 'error');

    const result = data?.updateDecision;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        id: {
          $check: 'equal',
          $value: _.get(decision, 'id'),
          $eMessage: 'Incorrect decision ID'
        },
        status: DecisionStatus.Draft,
        allowance: _.get(inputData, ['decision', 'allowance']),
        'task.id': _.get(outputData, ['task', 'id']),
        'createdBy.id': _.get(proUser, 'lastRoleId'),
        result: {
          $check: 'strictEqual',
          $value: null
        },
        options: {
          $check: 'every',
          $value: (option: DecisionOption) => !_.find(option.files, { id: _.get(proFile, 'id') })
        }
      },
      requiredFieldSet
    );

    Test.Check.data(
      _.find(result.options, {
        option: _.get(decisionOptionDataToCreate, 'option')
      }), // createdDecisionOption
      {
        'createdBy.id': {
          $check: 'equal',
          $value: _.get(homeCollaborator, 'lastRoleId'),
          $eMessage: 'Incorrect created by ID in created decision option.'
        },
        option: {
          $check: 'equal',
          $value: _.get(decisionOptionDataToCreate, 'option'),
          $eMessage: 'Incorrect option in created decision option.'
        },
        cost: {
          $check: 'notEqual',
          $value: _.get(decisionOptionDataToCreate, 'cost'),
          $eMessage: 'Incorrect cost in created decision option.'
        }
      }
    );

    Test.Check.data(
      _.find(result.options, { id: _.get(decisionOptionDataToUpdate, 'id') }), // updatedDecisionOption
      {
        id: {
          $check: 'equal',
          $value: _.get(decisionOptionDataToUpdate, 'id'),
          $eMessage: 'Incorrect ID in updated decision option.'
        },
        option: {
          $check: 'equal',
          $value: _.get(decisionOptionDataToUpdate, 'option'),
          $eMessage: 'Incorrect "option" in updated decision option.'
        },
        cost: {
          $check: 'notEqual',
          $value: _.get(decisionOptionDataToUpdate, 'cost'),
          $eMessage: 'Incorrect updated decision option cost.'
        },
        files: {
          $check: 'some',
          $value: (file: File) => _.get(file, 'id') === _.get(makerFile, 'id')
        }
      }
    );
  });

  // error
  it('unable to delete non-existent maker', async () => {
    const proUser = _.find(outputData.users, {
      email: Email.Pro
    });
    if (!proUser) throw GraphQLError.notFound('pro');

    const homeUser = _.find(outputData.users, {
      email: Email.Home
    });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const decision = _.get(outputData, 'decision');

    const { errors } = await execQuery<TQuery>(
      UPDATE_DECISION_MUTATION,
      {
        decisionId: _.get(decision, 'id'),
        makers: [
          {
            roleId: _.get(homeUser, 'lastRoleId'),
            actionType: ActionType.Delete
          }
        ]
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError('Unable to delete non-existent maker.'));
  });

  it("can't add already exist maker", async () => {
    const proUser = _.find(outputData.users, {
      email: Email.Pro
    });
    if (!proUser) throw GraphQLError.notFound('pro');

    const homeCollaborator = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });
    if (!homeCollaborator) throw GraphQLError.notFound('home collaborator');

    const decision = _.get(outputData, 'decision');

    const { errors } = await execQuery<TQuery>(
      UPDATE_DECISION_MUTATION,
      {
        decisionId: _.get(decision, 'id'),
        makers: [
          {
            roleId: _.get(homeCollaborator, 'lastRoleId'),
            actionType: ActionType.Create
          }
        ]
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError('Cannot add already exist maker.'));
  });

  it("added makers must have role of 'HomeOwner'", async () => {
    const proUser = _.find(outputData.users, {
      email: Email.Pro
    });
    if (!proUser) throw GraphQLError.notFound('pro');

    const decision = _.get(outputData, 'decision');

    const makers = [
      {
        roleId: _.get(proUser, 'lastRoleId'),
        actionType: ActionType.Create
      }
    ];

    const { errors } = await execQuery<TQuery>(
      UPDATE_DECISION_MUTATION,
      {
        decisionId: _.get(decision, 'id'),
        makers
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.BadRole, 403));
  });

  it("can't delete not your decision option", async () => {
    const homeCollaborator = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });
    if (!homeCollaborator) throw GraphQLError.notFound('home collaborator');

    const decision = _.get(outputData, 'decision');

    const options = [
      {
        id: _.get(decision, ['options', 0, 'id']),
        cost: 4,
        actionType: ActionType.Delete
      }
    ];

    const { errors } = await execQuery<TQuery>(
      UPDATE_DECISION_MUTATION,
      {
        decisionId: _.get(decision, 'id'),
        options
      },
      homeCollaborator
    );

    Test.Check.error(errors, new GraphQLError('You cannot delete not your decision option.', 403));
  });

  it('maker cannot update not his option', async () => {
    const homeCollaborator = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });
    if (!homeCollaborator) throw GraphQLError.notFound('home collaborator');

    const decision = _.get(outputData, 'decision');

    const options = [
      {
        id: _.get(decision, ['options', 0, 'id']),
        cost: 4,
        actionType: ActionType.Update
      }
    ];

    const { errors } = await execQuery<TQuery>(
      UPDATE_DECISION_MUTATION,
      {
        decisionId: _.get(decision, 'id'),
        options
      },
      homeCollaborator
    );

    Test.Check.error(errors, new GraphQLError('You are not permitted to edit this option of decision.', 403));
  });

  it('options are not found', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    const decision = _.get(outputData, 'decision');

    const options = [
      {
        id: _.get(decision, 'id'),
        cost: 4,
        actionType: ActionType.Update
      }
    ];

    const { errors } = await execQuery<TQuery>(
      UPDATE_DECISION_MUTATION,
      {
        decisionId: _.get(decision, 'id'),
        options
      },
      proUser
    );

    const diffToString = options.map(option => `"${option.id}"`).join(', ');

    Test.Check.error(errors, new GraphQLError(`Options ${diffToString} are not found`, 404));
  });

  it('field "id" in options required for update action', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    const decision = _.get(outputData, 'decision');

    const { errors } = await execQuery<TQuery>(
      UPDATE_DECISION_MUTATION,
      {
        decisionId: _.get(decision, 'id'),
        options: [
          {
            cost: 4,
            actionType: ActionType.Update
          }
        ]
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError('Field "id" in options required for update action.'));
  });

  it("allowance can't be more total task cost", async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    const decision = _.get(outputData, 'decision');

    const task = _.get(outputData, 'task');

    const { errors } = await execQuery<TQuery>(
      UPDATE_DECISION_MUTATION,
      {
        decisionId: _.get(decision, 'id'),
        allowance: getTaskTotal(task) + 100
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError("Allowance can't be more total task cost."));
  });

  it("maker can't update anything other than options", async () => {
    const homeCollaborator = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });
    if (!homeCollaborator) throw GraphQLError.notFound('home collaborator');

    const decision = _.get(outputData, 'decision');

    const { errors } = await execQuery<TQuery>(
      UPDATE_DECISION_MUTATION,
      {
        decisionId: _.get(decision, 'id'),
        title: _.get(inputData, ['decision', 'title'])
      },
      homeCollaborator
    );

    Test.Check.error(errors, new GraphQLError('You are not permitted to edit this decision.', 403));
  });

  describe('', () => {
    let decision: Test.TDecision | undefined;
    let proUser: Test.TUser | undefined;

    beforeEach(async () => {
      const ctx = { sql, events: [] };

      decision = _.get(outputData, 'decision');
      if (!decision) throw GraphQLError.notFound('decision');

      proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro');

      await getClient(async client => {
        if (!decision) throw GraphQLError.notFound('decision');

        const decisionData: DecisionModel.update.TArgs = {
          id: _.get(decision, 'id'),
          status:
            _.get(decision, 'status') === DecisionStatus.Actioned ? DecisionStatus.Submitted : DecisionStatus.Actioned,
          dueDate: new Date()
        };
        await DecisionModel.update.exec(client, decisionData, ctx);
      });
    });

    after(async () => {
      const ctx = { sql, events: [] };

      await getClient(async client => {
        if (!decision) throw GraphQLError.notFound('decision');

        await DecisionModel.update.exec(
          client,
          {
            id: _.get(decision, 'id'),
            status: DecisionStatus.Draft,
            dueDate: _.get(inputData, ['decision', 'dueDate'])
          },
          ctx
        );
      });
    });

    it('actioned decision cannot be edited since time is left for that.', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro');

      const decision = _.get(outputData, 'decision');

      const { errors } = await execQuery<TQuery>(
        UPDATE_DECISION_MUTATION,
        {
          decisionId: _.get(decision, 'id'),
          title: _.get(inputData, ['decision', 'title'])
        },
        proUser
      );

      Test.Check.error(errors, new GraphQLError('This decision cannot be edited since time is left for that.'));
    });

    it('submitted decision cannot be edited since time is left for that.', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro');

      const decision = _.get(outputData, 'decision');

      const { errors } = await execQuery<TQuery>(
        UPDATE_DECISION_MUTATION,
        {
          decisionId: _.get(decision, 'id'),
          title: _.get(inputData, ['decision', 'title'])
        },
        proUser
      );

      Test.Check.error(errors, new GraphQLError('This decision cannot be edited since time is left for that.'));
    });
  });

  it('user not permitted to edit this decision', async () => {
    const proCollaborator = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Write + UserRole.Pro
    });
    if (!proCollaborator) throw GraphQLError.notFound('pro collaborator');

    const decision = _.get(outputData, 'decision');

    const { errors } = await execQuery<TQuery>(
      UPDATE_DECISION_MUTATION,
      {
        decisionId: _.get(decision, 'id'),
        title: _.get(inputData, ['decision', 'title'])
      },
      proCollaborator
    );

    Test.Check.error(errors, new GraphQLError('You are not permitted to edit this decision.', 403));
  });

  it("other user have't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('other');

    const decision = _.get(outputData, 'decision');

    const { errors } = await execQuery<TQuery>(
      UPDATE_DECISION_MUTATION,
      {
        decisionId: _.get(decision, 'id'),
        title: _.get(inputData, ['decision', 'title'])
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('decision not found', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const { errors } = await execQuery<TQuery>(
      UPDATE_DECISION_MUTATION,
      {
        decisionId: _.get(homeUser, 'lastRoleId'),
        title: _.get(inputData, ['decision', 'title'])
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('decision'));
  });

  it('no data provided for update', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('pro');

    const decision = _.get(outputData, 'decision');

    const { errors } = await execQuery<TQuery>(
      UPDATE_DECISION_MUTATION,
      {
        decisionId: _.get(decision, 'id')
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError('No data provided for update.'));
  });
});
