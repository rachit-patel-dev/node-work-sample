/*external modules*/
import _ from 'lodash';
import async from 'async';
import moment from 'moment';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Payment } from '../../../../../gql/resolvers/Payment';
import { PaymentOperation, PaymentOperationStatus } from '../../../../../db/types/paymentOperation';
import { Task, TaskStatus } from '../../../../../db/types/task';
import { Collaborator, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { Contract, ContractPaymentPlan, ContractPermissionResult } from '../../../../../db/types/contract';
import { File } from '../../../../../db/types/file';
import { getTaskTotal } from '../../../../../db/dataUtils/getTaskTotal';
import {
  PAYMENT_HISTORY_TABLE,
  PaymentHistoryAction,
  PaymentHistoryType
} from '../../../../../db/types/paymentHistory';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
import { TaskModel } from '../../../../../db/models/TaskModel';
import { PaymentModel } from '../../../../../db/models/PaymentModel';
import { PaymentOperationModel } from '../../../../../db/models/PaymentOperationModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { Phase } from '../../../../../gql/resolvers/Types/Phase/Phase';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { requestPayouts: Payment[] };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  Payout = 'Payout'
}
const enum PhaseName {
  First = 'FIRST',
  Second = 'SECOND'
}
const enum TaskName {
  First = 'FIRST',
  Second = 'SECOND'
}

type PopulatedPayment = Payment & { charge: PaymentOperation; payout?: PaymentOperation };
type PopulatedTask = Task & {
  payment: PopulatedPayment;
  decisions: Test.TDecision[];
};
type PopulatedPhase = Phase & {
  tasks: Array<PopulatedTask>;
};

interface OutputData {
  users: Test.TUser[];
  collaborators: Collaborator[];
  contract: Contract;
  phases: Array<PopulatedPhase>;
  files: File[];
}

const requiredFieldSet: Test.TFieldSet<Payment> = {
  scalar: ['id', 'chargeId'],
  object: ['charge', 'task'],
  array: ['comments', 'files']
};
const REQUEST_PAYOUTS_MUTATION = `mutation (
  $payments: [ID!]!,
  $comment: String,
  $files: [ID!],
  $cost: PhaseCostInput
) {
  requestPayouts(payments: $payments, comment: $comment, files: $files, cost: $cost) {
    id
    chargeId
    payoutRequestedAt

    charge {
      id
    }
    task {
      id

      phase {
        actualMaterialCost
        actualLaborCost
        actualOtherCost
      }
    }

    comments {
      id
      roleId
      text
    }
    files {
      id
      roleId

      contract {
        id
      }
    }
    history {
      id
      action
      type
      createdAt

      actionedBy {
        id
      }
      pro {
        id
      }
    }
  }
}`;

describe('gql/resolvers/Mutation/payments/requestPayout', () => {
  it.skip('is same "gql/resolvers/Mutation/requestPayouts"', () => {});
});

describe('gql/resolvers/Mutation/payments/requestPayouts', () => {
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
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.Pro,
        role: {
          name: UserRole.Pro
        }
      }
    ],
    collaborators: [
      {
        permissions: CollaboratorPermission.Full,
        invite: {
          firstName: 'test home',
          inviteMessage: 'test home message',
          type: InviteType.ProjectProInvite,
          userRole: UserRole.Pro
        }
      }
    ],
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.Payout,
      paymentPlan: ContractPaymentPlan.Transaction
    },
    phases: [
      {
        name: PhaseName.First,
        order: 100,
        tasks: [
          {
            name: TaskName.First,
            materialCost: 100,
            laborCost: 100,
            otherCost: 100,
            markupPercent: 20,
            order: 500,
            status: TaskStatus.Done,
            payment: {
              charge: {
                amount: 100,
                stripeId: '1',
                availableAt: new Date(),
                status: PaymentOperationStatus.Succeeded
              }
            }
          }
        ]
      },
      {
        name: PhaseName.Second,
        order: 100,
        tasks: [
          {
            name: TaskName.First,
            materialCost: 100,
            laborCost: 100,
            otherCost: 100,
            markupPercent: 20,
            order: 500,
            status: TaskStatus.Done,
            payment: {
              payoutRequestedAt: new Date(),
              charge: {
                amount: 100,
                stripeId: '1',
                availableAt: new Date(),
                status: PaymentOperationStatus.Succeeded
              }
            }
          }
        ]
      }
    ],
    queryInput: {
      cost: {
        material: 100,
        labor: 100,
        other: 50
      },
      comment: 'Some test comment',
      files: []
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

      const collaboratorUserFullPro = _.find(users, {
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.Pro
      });
      if (!collaboratorUserFullPro) throw GraphQLError.notFound('collaborator full pro');

      const projectGenerate = new Test.ProjectGenerate(client, ctx);
      await projectGenerate.create({
        ownerId: homeUser.lastRoleId,
        matchData: inputData.project.matchData as any
      });
      await projectGenerate.addContract({
        ...inputData.contract,
        partnerId: proUser.lastRoleId
      });

      const project = projectGenerate.project!;

      const contract = _.find(project.contracts, {
        name: ContractName.Payout
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
            await paymentGenerate.createPayment(taskInput.payment as any);

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
        });

        const phase = phaseGenerate.phase!;
        if (_.isEmpty(phase.tasks)) throw GraphQLError.notFound('tasks');

        return phase;
      });

      const fileGenerate = new Test.FileGenerate(client, ctx);
      await fileGenerate.create({
        mime: 'plain/text',
        roleId: collaboratorUserFullPro.lastRoleId,
        contractId: contract.id,
        name: 'test'
      });

      const file = fileGenerate.file!;

      return {
        users,
        collaborators,
        phases,
        contract,
        files: [file]
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      await client.query(
        sql`
            DELETE
            FROM ${PAYMENT_HISTORY_TABLE}
            WHERE true
        `
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
  it('should allow to request payouts', async () => {
    const pro = _.find(outputData.users, { email: Email.Pro });

    const phase = _.find(outputData.phases, { name: PhaseName.First });
    if (!phase) throw GraphQLError.notFound('phase');

    const collaboratorUserFullPro = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.Pro
    });

    const paymentIds = _.chain(phase)
      .get('tasks')
      .map('payment')
      .map('id')
      .value();

    const { data, errors } = await execQuery<TQuery>(
      REQUEST_PAYOUTS_MUTATION,
      {
        payments: paymentIds,
        ..._.get(inputData, 'queryInput'),
        files: _.map(outputData.files, 'id')
      },
      collaboratorUserFullPro
    );

    Test.Check.noErrors(errors);

    const result = data?.requestPayouts;
    if (!result) throw GraphQLError.notFound('data');

    const newPhaseCost = _.get(inputData, ['queryInput', 'cost']);
    Test.Check.data(
      result,
      {
        payoutRequestedAt: {
          $check: '===',
          $value: new Date(),
          $func: date => moment(date).format('YYYY.MM.DD HH:M')
        },
        comments: {
          0: {
            roleId: _.get(collaboratorUserFullPro, 'lastRoleId'),
            text: _.get(inputData, ['queryInput', 'comment'])
          }
        },
        task: {
          id: _.get(_.last(phase.tasks), ['id']),
          phase: {
            actualMaterialCost: _.get(newPhaseCost, 'material'),
            actualLaborCost: _.get(newPhaseCost, 'labor'),
            actualOtherCost: _.get(newPhaseCost, 'other')
          }
        },
        files: {
          // TODO _if error, then changes have occurred in the "requestPayouts" mutations
          0: {
            roleId: _.get(collaboratorUserFullPro, 'lastRoleId'),
            contract: {
              id: _.get(outputData, ['contract', 'id'])
            }
          }
        },
        history: {
          0: {
            action: PaymentHistoryAction.PayoutRequested,
            type: PaymentHistoryType.User,
            createdAt: {
              $check: '===',
              $value: new Date(),
              $func: (date: Date) => moment(date).format('YYYY.MM.DD HH:M')
            },
            actionedBy: {
              id: _.get(collaboratorUserFullPro, 'lastRoleId')
            },
            pro: {
              id: _.get(pro, 'lastRoleId')
            }
          }
        }
      },
      requiredFieldSet
    );
  });

  // error
  describe('', () => {
    const ctx = { sql, events: [] };

    let proUser: Test.TUser | undefined;
    let payments: Payment[] | undefined;

    before(async () => {
      proUser = _.find(outputData.users, { email: Email.Pro });

      const phase = _.find(outputData.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      payments = _.map(phase.tasks, 'payment');

      await getClientTransaction(async client => {
        await async.each(payments!, async payment => {
          await PaymentOperationModel.update.exec(
            client,
            {
              id: payment.charge.id,
              status: PaymentOperationStatus.Failed
            },
            ctx
          );
        });
      });
    });

    after(async () => {
      await getClientTransaction(async client => {
        await async.each(payments!, async payment => {
          await PaymentOperationModel.update.exec(
            client,
            {
              id: payment.charge.id,
              status: payment.charge.status
            },
            ctx
          );
        });
      });
    });

    it('payments are still not ready for payout', async () => {
      const { errors } = await execQuery<TQuery>(
        REQUEST_PAYOUTS_MUTATION,
        {
          payments: _.map(payments, 'id'),
          ..._.get(inputData, 'queryInput')
        },
        proUser
      );

      Test.Check.error(errors, new GraphQLError(`Some of the provided payments are still not ready for payout.`));
    });
  });

  describe('', () => {
    const ctx = { sql, events: [] };

    let proUser: Test.TUser | undefined;
    let payments: Payment[] | undefined;

    before(async () => {
      proUser = _.find(outputData.users, { email: Email.Pro });

      const phase = _.find(outputData.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');
      payments = _.map(phase.tasks, 'payment');

      await getClientTransaction(async client => {
        await async.each(payments!, async payment => {
          await PaymentModel.update.exec(
            client,
            {
              id: payment.id,
              payoutRequestedAt: new Date()
            },
            ctx
          );
        });
      });
    });

    after(async () => {
      await getClientTransaction(async client => {
        await async.each(payments!, async payment => {
          await PaymentModel.update.exec(
            client,
            {
              id: payment.id,
              payoutRequestedAt: null
            },
            ctx
          );
        });
      });
    });

    it('error if payout is already requested', async () => {
      const { errors } = await execQuery<TQuery>(
        REQUEST_PAYOUTS_MUTATION,
        {
          payments: _.map(payments, 'id'),
          ..._.get(inputData, 'queryInput')
        },
        proUser
      );

      Test.Check.error(errors, new GraphQLError('Payout is already requested'));
    });
  });

  describe('', () => {
    const ctx = { sql, events: [] };

    let proUser: Test.TUser | undefined;
    let task: Task | undefined;
    let payments: Payment[] | undefined;

    before(async () => {
      proUser = _.find(outputData.users, { email: Email.Pro });

      const phase = _.find(outputData.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      task = _.get(phase, ['tasks', 0]);
      payments = _.map(phase.tasks, 'payment');

      await getClient(async client => {
        task = await TaskModel.update.exec(
          client,
          {
            id: _.get(task, 'id')!,
            status: TaskStatus.Doing
          },
          ctx
        );
      });
    });

    after(async () => {
      await getClient(async client => {
        await TaskModel.update.exec(
          client,
          {
            id: _.get(task, 'id')!,
            status: TaskStatus.Done
          },
          ctx
        );
      });
    });

    it('all task must be status "Done"', async () => {
      const { errors } = await execQuery<TQuery>(
        REQUEST_PAYOUTS_MUTATION,
        {
          payments: _.map(payments, 'id'),
          ..._.get(inputData, 'queryInput')
        },
        proUser
      );

      Test.Check.error(
        errors,
        new GraphQLError(`You must move all the tasks to "Done" column. ${task!.name} still in ${task!.status} column`)
      );
    });
  });

  it(`only full pro must have access`, async () => {
    const phase = _.find(outputData.phases, { name: PhaseName.First });
    if (!phase) throw GraphQLError.notFound('phase');

    const homeUser = _.find(outputData.users, { email: Email.Home });

    const paymentIds = _.chain(phase)
      .get('tasks')
      .map('payment')
      .map('id')
      .value();

    const { errors } = await execQuery<TQuery>(
      REQUEST_PAYOUTS_MUTATION,
      {
        payments: paymentIds,
        ..._.get(inputData, 'queryInput')
      },
      homeUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.BadRole, 403));
  });

  it(`all payments must be related to single phase`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const paymentIds = _.chain(outputData.phases)
      .flatMap('tasks')
      .flatMap('payment')
      .map('id')
      .value();

    const { errors } = await execQuery<TQuery>(
      REQUEST_PAYOUTS_MUTATION,
      {
        payments: paymentIds,
        ..._.get(inputData, 'queryInput')
      },
      homeUser
    );

    Test.Check.error(errors, new GraphQLError(`All payments should be related to the single phase`));
  });

  it(`payments not found`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const { errors } = await execQuery<TQuery>(
      REQUEST_PAYOUTS_MUTATION,
      {
        payments: [_.get(homeUser, 'id')],
        ..._.get(inputData, 'queryInput')
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('payments'));
  });
});
