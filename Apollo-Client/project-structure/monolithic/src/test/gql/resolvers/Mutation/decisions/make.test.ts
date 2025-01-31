/*external modules*/
import moment from 'moment';
import async from 'async';
import _ from 'lodash';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Collaborator, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { Task } from '../../../../../db/types/task';
import { DecisionSelectionType, DecisionStatus } from '../../../../../db/types/decision';
import { Contract, ContractPermissionResult } from '../../../../../db/types/contract';
import { ChangeOrderReason, ChangeOrderStatus } from '../../../../../db/types/changeOrder';
import { Payment } from '../../../../../db/types/payment';
import { PaymentOperation } from '../../../../../db/types/paymentOperation';
import { getTaskTotal } from '../../../../../db/dataUtils/getTaskTotal';
/*models*/
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
import { UserModel } from '../../../../../db/models/UserModel';
import { DecisionModel } from '../../../../../db/models/DecisionModel';
/*GQL*/
import { execQuery } from '../../../index';
import { GraphQLError } from '../../../../../gql';
import { Decision } from '../../../../../gql/resolvers/Types/Decision';
import { DecisionOption } from '../../../../../gql/resolvers/Types/Decision/DecisionOption';
import { DecisionResult } from '../../../../../gql/resolvers/Types/Decision/DecisionResult';
import { Phase } from '../../../../../gql/resolvers/Types/Phase/Phase';
/*other*/
import { Test } from '../../../../helpers/Test';
import { safeHtml } from '../../../../../utils/safeHtml';
import assert from 'assert';

type TQuery = { makeDecision: Decision };

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
const enum PhaseName {
  First = 'FIRST'
}
const enum TaskName {
  First = 'FIRST',
  Second = 'SECOND'
}
const enum DecisionName {
  First = 'FIRST',
  Second = 'SECOND'
}

type PopulatedTask = Task & {
  payment: Payment & { charge: PaymentOperation; payout?: PaymentOperation };
  decisions: Test.TDecision[];
};
type PopulatedPhase = Phase & {
  tasks: Array<PopulatedTask>;
};

interface OutputData {
  users: Test.TUser[];
  project: Test.TProject;
  contract: Contract;
  collaborators: Collaborator[];
  phases: Array<PopulatedPhase>;
}

const requiredFieldSet: Test.TFieldSet<Decision> = {
  scalar: ['id', 'selectionType', 'dueDate', 'status'],
  object: ['task', 'createdBy'],
  array: ['decisionMakers', 'options']
};

const requiredDecisionResultFieldSet: Test.TFieldSet<DecisionResult> = {
  scalar: ['id', 'decisionId'],
  object: ['changeOrder', 'decisionMaker'],
  array: ['options']
};

const MAKE_DECISION_MUTATION = `mutation ($decisionId: ID!, $optionIds: [ID!]!, $esign: EsignInput) {
  makeDecision(decisionId: $decisionId, optionIds: $optionIds, esign: $esign) {
      id
      selectionType
      notes
      dueDate
      status

      task {
        id
      }
      createdBy {
        id
      }
      result {
        id
        decisionId

        decisionMaker {
          id
        }

        options {
          id
          option
          cost
          createdBy {
            id
          }
        }

        changeOrder {
           id
           contractId

           reason
           status
           note

           tasksVersions {
              name
              description

              materialCost
              laborCost
              otherCost
              markupPercent

              startDate
              endDate

              phaseId
              phaseName
           }
        }
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
      }
  }
}`;

describe('gql/resolvers/Mutation/decisions/make', () => {
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
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner,
        role: {
          name: UserRole.HomeOwner
        }
      }
    ],
    collaborators: [
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
    phases: [
      {
        name: PhaseName.First,
        order: 100,
        tasks: [
          {
            name: TaskName.First,
            order: 100,
            payment: {
              payoutRequestedAt: new Date(),
              charge: {
                amount: 100,
                stripeId: '1',
                availableAt: new Date()
              }
            },
            decisions: [
              {
                title: DecisionName.First,
                status: DecisionStatus.Submitted,
                dueDate: moment()
                  .add(1, 'day')
                  .toDate(),
                maker: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner,
                selectionTypes: [DecisionSelectionType.Single, DecisionSelectionType.Multiple],
                options: [
                  {
                    ownerEmail: Email.Pro,
                    option: '>test<'
                  },
                  {
                    ownerEmail: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner,
                    option: '>test<',
                    cost: 200
                  }
                ]
              },
              {
                title: DecisionName.Second,
                status: DecisionStatus.Actioned,
                dueDate: moment()
                  .add(1, 'day')
                  .toDate(),
                maker: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner,
                selectionTypes: [DecisionSelectionType.Single],
                options: [
                  {
                    ownerEmail: Email.Pro,
                    option: '>test<'
                  },
                  {
                    ownerEmail: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner,
                    option: '>test<',
                    cost: 200
                  },
                  {
                    ownerEmail: Email.Pro,
                    option: '>test<',
                    cost: 1000
                  }
                ]
              }
            ]
          },
          {
            name: TaskName.Second,
            order: 100,
            decisions: [
              {
                title: DecisionName.First,
                status: DecisionStatus.Submitted,
                decisionSubmittedJobId: '4456',
                dueDate: moment()
                  .add(1, 'day')
                  .toDate(),
                maker: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner,
                selectionTypes: [DecisionSelectionType.Single, DecisionSelectionType.Multiple],
                options: [
                  {
                    ownerEmail: Email.Pro,
                    option: '>test<'
                  },
                  {
                    ownerEmail: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner,
                    option: '>test<',
                    cost: 200
                  }
                ]
              }
            ]
          }
        ]
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

      const phases: OutputData['phases'] = await async.map(inputData.phases, async phaseInput => {
        const phaseGenerate = new Test.PhaseGenerate(client, ctx);
        await phaseGenerate.create({
          contractId: contract.id,
          ...phaseInput
        });

        await async.each(phaseInput.tasks, async taskInput => {
          await phaseGenerate.addTask({
            creatorId: proUser.lastRoleId,
            ...taskInput
          });

          let task: Task & { decisions?: any[] } = _.last(phaseGenerate.phase?.tasks)!;

          if (taskInput.payment) {
            const paymentGenerate = new Test.PaymentGenerate(client, ctx);
            await paymentGenerate.createCharge({
              ...taskInput.payment.charge,
              amount: getTaskTotal(task),
              stripeId: 'px_' + _.get(task, 'name')
            });
            await paymentGenerate.createPayment(taskInput.payment);

            const payment = paymentGenerate.payment;

            await phaseGenerate.updateTask({
              id: _.get(task, 'id'),
              paymentId: _.get(payment, 'id')
            });

            task = _.find(phaseGenerate.phase?.tasks, { id: task.id })!;

            _.set(task, 'payment', {
              ...payment,
              charge: paymentGenerate.charge,
              payout: paymentGenerate.payout
            });
          }

          if (_.isEmpty(taskInput.decisions)) return;

          _.set(task, 'decisions', []);

          await async.each(taskInput.decisions, async decisionInput => {
            await async.each(decisionInput.selectionTypes, async selectionType => {
              const decisionGenerate = new Test.DecisionGenerate(client, ctx);
              await decisionGenerate.create({
                taskId: task.id,
                dueDate: _.get(decisionInput, 'dueDate'),
                createdById: _.get(proUser, 'lastRoleId'),
                title: _.get(decisionInput, 'title') + selectionType,
                selectionType: selectionType,
                decisionSubmittedJobId: _.get(decisionInput, 'decisionSubmittedJobId')
              });

              await decisionGenerate.update({
                status: _.get(decisionInput, 'status')
              });

              await async.each(decisionInput.options, async decisionOption => {
                const { option, cost, ownerEmail } = decisionOption;

                const createdBy = _.find(users, { email: ownerEmail });
                if (!createdBy) throw GraphQLError.notFound('created');

                return decisionGenerate.addOption({
                  createdById: _.get(createdBy, 'lastRoleId'),
                  option,
                  cost
                });
              });

              const maker = _.find(users, {
                email: _.get(decisionInput, 'maker')
              });
              if (!maker) {
                throw GraphQLError.notFound('maker');
              }
              await decisionGenerate.addMakers({
                makerIds: [_.get(homeUser, 'lastRoleId'), _.get(maker, 'lastRoleId')]
              });

              task.decisions!.push(decisionGenerate.decision!);
            });
          });
        });

        const phase = phaseGenerate.phase!;
        if (_.isEmpty(phase.tasks)) throw GraphQLError.notFound('tasks');

        return phase;
      });

      return {
        users,
        project,
        contract,
        phases,
        collaborators
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };

    await getClientTransaction(async client => {
      await Promise.all(
        _.chain(outputData.phases)
          .flatMap('tasks')
          .flatMap('decisions')
          .map(async decision => {
            await DecisionModel.remove.exec(
              client,
              {
                decisionId: decision.id
              },
              ctx
            );
          })
          .value()
      );

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
  it('allow make decision', async () => {
    const homeCollaborator = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });
    if (!homeCollaborator) throw GraphQLError.notFound('home collaborator');

    const proUser = _.find(outputData.users, {
      email: Email.Pro
    });
    if (!proUser) throw GraphQLError.notFound('pro');

    const fundedPhase = _.find(outputData.phases, { name: PhaseName.First });
    if (!fundedPhase) throw GraphQLError.notFound('funded phase');

    const task = _.find(fundedPhase.tasks, { name: TaskName.Second });
    if (!task) throw GraphQLError.notFound('task');

    const decisionMultiple = _.find(task.decisions, {
      title: DecisionName.First + DecisionSelectionType.Multiple
    });
    if (!decisionMultiple) throw GraphQLError.notFound('multiple decision');

    if (!decisionMultiple.options) {
      throw GraphQLError.notFound('decision options');
    }
    const optionIds = decisionMultiple.options
      .filter(option => option.createdById === _.get(homeCollaborator, 'lastRoleId'))
      .map(option => option.id);

    const { data, errors } = await execQuery<TQuery>(
      MAKE_DECISION_MUTATION,
      {
        decisionId: _.get(decisionMultiple, 'id'),
        optionIds
      },
      homeCollaborator
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.makeDecision;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        id: {
          $check: 'equal',
          $value: _.get(decisionMultiple, 'id'),
          $eMessage: 'Incorrect decision ID'
        },
        selectionType: _.get(decisionMultiple, 'selectionType'),
        notes: safeHtml(_.get(decisionMultiple, 'notes')),
        status: DecisionStatus.Actioned,
        'task.id': _.get(task, 'id'),
        'createdBy.id': _.get(proUser, 'lastRoleId'),
        result: {
          'decisionMaker.id': _.get(homeCollaborator, 'lastRoleId'),
          decisionId: _.get(decisionMultiple, 'id'),
          changeOrder: {
            contractId: _.get(outputData, ['contract', 'id']),
            reason: ChangeOrderReason.Decision
          }
        },
        decisionMakers: {
          $check: 'some',
          $value: (maker: Test.TUser) => _.get(maker, 'id') === _.get(homeCollaborator, 'lastRoleId')
        }
      },
      requiredFieldSet
    );

    if (result) {
      Test.Check.data(_.get(result, ['result', 'options']), (option: DecisionOption) => {
        const resultOption = _.find(decisionMultiple.options, { id: option.id });
        if (!resultOption) throw GraphQLError.notFound('returned option');

        return {
          option: {
            $check: 'equal',
            $value: _.get(resultOption, 'option'),
            $eMessage: `Option ${option.id} has incorrect "option"`
          },
          cost: {
            $check: 'equal',
            $value: _.get(resultOption, 'cost'),
            $eMessage: `Option ${option.id} has incorrect "cost"`
          },
          'createdBy.id': {
            $check: 'equal',
            $value: _.get(homeCollaborator, 'lastRoleId'),
            $eMessage: `Option ${option.id} has incorrect "createdBy ID"`
          }
        };
      });
    }

    Test.Check.requiredFields(requiredDecisionResultFieldSet, _.get(result, 'result')!);

    await getClient(async client => {
      const updatedDecision = await DecisionModel.findById.exec(
        client,
        {
          decisionId: _.get(decisionMultiple, 'id')!
        },
        { sql, events: [] }
      );
      if (!updatedDecision) throw GraphQLError.notFound('decision');

      assert.ok(_.isEmpty(updatedDecision?.decisionSubmittedJobId), `Decision haven't job id`);
    });
  });

  it('allow make decision on funded task', async () => {
    const homeCollaborator = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });
    if (!homeCollaborator) throw GraphQLError.notFound('home collaborator');

    const owner = _.find(outputData.users, {
      email: Email.Home
    });
    if (!owner) throw GraphQLError.notFound('owner');

    const proUser = _.find(outputData.users, {
      email: Email.Pro
    });
    if (!proUser) throw GraphQLError.notFound('pro');

    const phase = _.find(outputData.phases, { name: PhaseName.First });
    if (!phase) throw GraphQLError.notFound('funded phase');

    const task = _.find(phase.tasks, { name: TaskName.First });
    if (!task) throw GraphQLError.notFound('task');

    const decisionSingle = _.find(task.decisions, {
      title: DecisionName.First + DecisionSelectionType.Single
    });
    if (!decisionSingle) throw GraphQLError.notFound('decision');
    const optionId = _.chain(decisionSingle.options)
      .maxBy('cost')
      .get('id')
      .value();

    const { data, errors } = await execQuery<TQuery>(
      MAKE_DECISION_MUTATION,
      {
        decisionId: _.get(decisionSingle, 'id'),
        optionIds: [optionId],
        esign: {
          signature: 'test'
        }
      },
      owner
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.makeDecision;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        id: {
          $check: 'equal',
          $value: _.get(decisionSingle, 'id'),
          $eMessage: 'Incorrect decision ID'
        },
        selectionType: _.get(decisionSingle, 'selectionType'),
        notes: safeHtml(_.get(decisionSingle, 'notes')),
        status: DecisionStatus.Actioned,
        'task.id': _.get(task, 'id'),
        'createdBy.id': _.get(proUser, 'lastRoleId'),
        result: {
          'decisionMaker.id': _.get(owner, 'lastRoleId'),
          decisionId: _.get(decisionSingle, 'id'),
          changeOrder: {
            contractId: _.get(outputData, ['contract', 'id']),
            reason: ChangeOrderReason.Upgrade,
            status: ChangeOrderStatus.Approved,
            note: `After make decision "${decisionSingle.title}"`
          }
        },
        decisionMakers: {
          $check: 'some',
          $value: (maker: Test.TUser) => _.get(maker, 'id') === _.get(owner, 'lastRoleId')
        }
      },
      requiredFieldSet
    );

    Test.Check.data(result.result?.changeOrder?.tasksVersions, () => {
      const selectedOption = _.chain(decisionSingle.options)
        .find({ id: optionId })
        .value();

      return {
        name: decisionSingle.title,
        description: selectedOption.option,
        materialCost: Number(selectedOption.cost) * selectedOption.units! - decisionSingle.allowance,
        laborCost: 0,
        otherCost: 0,
        markupPercent: 0,
        startDate: {
          $check: '==',
          $value: task.endDate,
          $func: (date: Date) => moment(date).format('YYYY.MM.DD HH:mm')
        },
        endDate: {
          $check: '==',
          $value: task.endDate,
          $func: (date: Date) => moment(date).format('YYYY.MM.DD HH:mm')
        },
        phaseId: phase.id
        // phaseName: _.toUpper(`Made by decision "${decisionSingle.title}"`)
      };
    });

    Test.Check.data(_.get(result, ['result', 'options']), (option: DecisionOption) => {
      const resultOption = _.find(decisionSingle.options, { id: option.id });
      if (!resultOption) throw GraphQLError.notFound('returned option');

      return {
        option: {
          $check: 'equal',
          $value: _.get(resultOption, 'option'),
          $eMessage: `Option ${option.id} has incorrect "option"`
        },
        cost: {
          $check: 'equal',
          $value: _.get(resultOption, 'cost'),
          $eMessage: `Option ${option.id} has incorrect "cost"`
        },
        'createdBy.id': {
          $check: 'equal',
          $value: _.get(homeCollaborator, 'lastRoleId'),
          $eMessage: `Option ${option.id} has incorrect "createdBy ID"`
        }
      };
    });

    Test.Check.requiredFields(requiredDecisionResultFieldSet, _.get(result, 'result')!);
  });

  // error
  it('options belongs to another decision', async () => {
    const homeCollaborator = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });
    if (!homeCollaborator) throw GraphQLError.notFound('home collaborator');

    const fundedPhase = _.find(outputData.phases, { name: PhaseName.First });
    if (!fundedPhase) throw GraphQLError.notFound('funded phase');

    const task = _.find(fundedPhase.tasks, { name: TaskName.First });
    if (!task) throw GraphQLError.notFound('task');

    const decisionSingle = _.find(task.decisions, {
      title: DecisionName.First + DecisionSelectionType.Single
    });
    if (!decisionSingle) throw GraphQLError.notFound('single decision');

    const decisionMultiple = _.find(task.decisions, {
      title: DecisionName.First + DecisionSelectionType.Multiple
    });
    if (!decisionMultiple) throw GraphQLError.notFound('multiple decision');

    const optionIds = _.map(decisionSingle.options, 'id');

    const { errors } = await execQuery<TQuery>(
      MAKE_DECISION_MUTATION,
      {
        decisionId: _.get(decisionMultiple, 'id'),
        optionIds
      },
      homeCollaborator
    );

    const optionIdsToString = optionIds.map(opId => `"${opId}"`).join(', ');

    Test.Check.error(errors, new GraphQLError(`Options ${optionIdsToString} belongs to another decision.`));
  });

  it('options are not found', async () => {
    const homeCollaborator = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });
    if (!homeCollaborator) throw GraphQLError.notFound('home collaborator');

    const fundedPhase = _.find(outputData.phases, { name: PhaseName.First });
    if (!fundedPhase) throw GraphQLError.notFound('funded phase');

    const task = _.find(fundedPhase.tasks, { name: TaskName.First });
    if (!task) throw GraphQLError.notFound('task');

    const decisionSingle = _.find(task.decisions, {
      title: DecisionName.First + DecisionSelectionType.Single
    });
    if (!decisionSingle) throw GraphQLError.notFound('decision');

    const optionIds = [_.get(decisionSingle, 'id')];

    const { errors } = await execQuery<TQuery>(
      MAKE_DECISION_MUTATION,
      {
        decisionId: _.get(decisionSingle, 'id'),
        optionIds
      },
      homeCollaborator
    );

    const optionIdsToString = optionIds.map(opId => `"${opId}"`).join(', ');

    Test.Check.error(errors, new GraphQLError(`Options ${optionIdsToString} are not found.`, 404));
  });

  it('decision requires single option to be selected', async () => {
    const homeCollaborator = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });
    if (!homeCollaborator) throw GraphQLError.notFound('home collaborator');

    const fundedPhase = _.find(outputData.phases, { name: PhaseName.First });
    if (!fundedPhase) throw GraphQLError.notFound('funded phase');

    const task = _.find(fundedPhase.tasks, { name: TaskName.First });
    if (!task) throw GraphQLError.notFound('task');

    const decisionSingle = _.find(task.decisions, {
      title: DecisionName.First + DecisionSelectionType.Single
    });
    if (!decisionSingle) throw GraphQLError.notFound('decision');

    const { errors } = await execQuery<TQuery>(
      MAKE_DECISION_MUTATION,
      {
        decisionId: _.get(decisionSingle, 'id'),
        optionIds: [_.get(decisionSingle, 'id'), _.get(decisionSingle, 'id')]
      },
      homeCollaborator
    );

    Test.Check.error(errors, new GraphQLError('This decision requires single option to be selected.'));
  });

  describe('', async () => {
    let decisionSingle: Test.TDecision | undefined;
    let decisionMultiple: Test.TDecision | undefined;

    let homeCollaborator: Test.TUser | undefined;

    before(async () => {
      const ctx = { sql, events: [] };

      homeCollaborator = _.find(outputData.users, {
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
      });
      if (!homeCollaborator) throw GraphQLError.notFound('home collaborator');

      const fundedPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!fundedPhase) throw GraphQLError.notFound('funded phase');

      const task = _.find(fundedPhase.tasks, { name: TaskName.First });
      if (!task) throw GraphQLError.notFound('task');

      decisionSingle = _.find(task.decisions, {
        title: DecisionName.First + DecisionSelectionType.Single
      });
      if (!decisionSingle) throw GraphQLError.notFound('single decision');

      decisionMultiple = _.find(task.decisions, {
        title: DecisionName.First + DecisionSelectionType.Multiple
      });
      if (!decisionMultiple) throw GraphQLError.notFound('multiple decision');

      await getClientTransaction(async client => {
        await DecisionModel.update.exec(
          client,
          {
            id: _.get(decisionSingle!, 'id'),
            status: DecisionStatus.Draft
          },
          ctx
        );

        await DecisionModel.update.exec(
          client,
          {
            id: _.get(decisionMultiple!, 'id'),
            status: DecisionStatus.Actioned,
            dueDate: moment()
              .subtract(1, 'day')
              .toDate()
          },
          ctx
        );
      });
    });

    it('cannot make decision with status "Draft"', async () => {
      const { errors } = await execQuery<TQuery>(
        MAKE_DECISION_MUTATION,
        {
          decisionId: _.get(decisionSingle, 'id'),
          optionIds: [_.get(decisionSingle, 'id')]
        },
        homeCollaborator
      );

      Test.Check.error(errors, new GraphQLError('You cannot make decision with status "Draft".'));
    });

    it('time for making decision has been out', async () => {
      const { errors } = await execQuery<TQuery>(
        MAKE_DECISION_MUTATION,
        {
          decisionId: _.get(decisionMultiple, 'id'),
          optionIds: [_.get(decisionMultiple, 'id')]
        },
        homeCollaborator
      );

      Test.Check.error(errors, new GraphQLError('Time for making decision has been out.'));
    });
  });

  describe('', async () => {
    let decisionSingle: Test.TDecision | undefined;

    let homeUser: Test.TUser | undefined;

    before(async () => {
      const ctx = { sql, events: [] };

      homeUser = _.find(outputData.users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('owner');

      const fundedPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!fundedPhase) throw GraphQLError.notFound('funded phase');

      const task = _.find(fundedPhase.tasks, { name: TaskName.First });
      if (!task) throw GraphQLError.notFound('task');

      decisionSingle = _.find(task.decisions, {
        title: DecisionName.First + DecisionSelectionType.Single
      });
      if (!decisionSingle) throw GraphQLError.notFound('decision');

      await getClient(async client => {
        await DecisionModel.removeMaker.exec(
          client,
          {
            decisionId: _.get(decisionSingle!, 'id'),
            makerId: _.get(homeUser!, 'lastRoleId')
          },
          ctx
        );
      });
    });

    it('no a maker not in charge of making this decision', async () => {
      const { errors } = await execQuery<TQuery>(
        MAKE_DECISION_MUTATION,
        {
          decisionId: _.get(decisionSingle, 'id'),
          optionIds: [_.get(decisionSingle, 'id')]
        },
        homeUser
      );

      Test.Check.error(errors, new GraphQLError('You are not in charge of making this decision.', 403));
    });
  });

  it("other user haven't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('other');

    const fundedPhase = _.find(outputData.phases, { name: PhaseName.First });
    if (!fundedPhase) throw GraphQLError.notFound('funded phase');

    const task = _.find(fundedPhase.tasks, { name: TaskName.First });
    if (!task) throw GraphQLError.notFound('task');

    const decisionSingle = _.find(task.decisions, {
      title: DecisionName.First + DecisionSelectionType.Single
    });
    if (!decisionSingle) throw GraphQLError.notFound('decision');

    const { errors } = await execQuery<TQuery>(
      MAKE_DECISION_MUTATION,
      {
        decisionId: _.get(decisionSingle, 'id'),
        optionIds: [_.get(decisionSingle, 'id')]
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('decision not found', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const { errors } = await execQuery<TQuery>(
      MAKE_DECISION_MUTATION,
      {
        decisionId: _.get(homeUser, 'lastRoleId'),
        optionIds: [_.get(homeUser, 'lastRoleId')]
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('decision'));
  });
});
