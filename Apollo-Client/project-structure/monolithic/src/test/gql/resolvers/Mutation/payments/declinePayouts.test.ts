/*external modules*/
import _ from 'lodash';
import async from 'async';
import moment from 'moment';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Payment } from '../../../../../gql/resolvers/Payment';
import { PaymentOperation } from '../../../../../db/types/paymentOperation';
import { Task } from '../../../../../db/types/task';
import { Collaborator, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { getTaskTotal } from '../../../../../db/dataUtils/getTaskTotal';
import { ContractPermissionResult } from '../../../../../db/types/contract';
import {
  PAYMENT_HISTORY_TABLE,
  PaymentHistoryAction,
  PaymentHistoryType
} from '../../../../../db/types/paymentHistory';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
/*GQL*/
import { execQuery } from '../../../index';
import { GraphQLError } from '../../../../../gql';
/*other*/
import { Test } from '../../../../helpers/Test';
import { safeHtml } from '../../../../../utils/safeHtml';

type TQuery = { declinePayouts: Payment[] };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  Payout = 'Payout'
}

type PopulatedPayment = Payment & { charge: PaymentOperation; payout?: PaymentOperation };

interface OutputData {
  users: Test.TUser[];
  collaborators: Collaborator[];
  project: Test.TProject;
  phase: Test.TPhase;
  payments: PopulatedPayment[];
}

const requiredFieldSet: Test.TFieldSet<Payment> = {
  scalar: ['id', 'chargeId'],
  object: ['charge', 'task'],
  array: ['comments', 'files']
};
const DECLINE_PAYOUTS_MUTATION = `mutation ($payments: [ID!]!, $comment: CommentInput!) {
  declinePayouts(payments: $payments, comment: $comment) {
    id
    chargeId
    payoutRequestedAt

    charge {
      id
    }
    task {
      id
    }

    comments {
      id
      subject
      text
      roleId
      paymentId
    }
    files {
      id
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

describe('gql/resolvers/Mutation/payments/declinePayout', () => {
  it.skip('is same "gql/resolvers/Mutation/declinePayouts"', () => {});
});

describe('gql/resolvers/Mutation/payments/declinePayouts', () => {
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
      name: ContractName.Payout
    },
    phase: {
      name: 'decision',
      order: 1000
    },
    tasks: [
      {
        name: 'task 1',
        materialCost: 100,
        laborCost: 100,
        otherCost: 100,
        markupPercent: 20,
        order: 500
      },
      {
        name: 'task 2',
        materialCost: 100,
        laborCost: 100,
        otherCost: 100,
        markupPercent: 20,
        order: 500
      }
    ],
    comment: {
      subject: 'test subject',
      text: '<div>test</div>'
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

      const phaseGenerate = new Test.PhaseGenerate(client, ctx);
      await phaseGenerate.create({
        contractId: contract.id,
        ...inputData.phase
      });
      await async.each(inputData.tasks, async task => {
        await phaseGenerate.addTask({
          creatorId: proUser.lastRoleId,
          ...task
        });
      });

      const phase = phaseGenerate.phase!;
      if (_.isEmpty(phase.tasks)) throw GraphQLError.notFound('tasks');

      const payments: Array<Payment & { charge: PaymentOperation; payout?: PaymentOperation }> = await async.map(
        phase.tasks!,
        async task => {
          const paymentGenerate = new Test.PaymentGenerate(client, ctx);
          await paymentGenerate.createCharge({
            amount: getTaskTotal(task as Task),
            stripeId: 'px_' + _.get(task, 'name'),
            availableAt: new Date()
          });
          await paymentGenerate.createPayment({
            payoutRequestedAt: new Date()
          });

          const payment = paymentGenerate.payment;

          await phaseGenerate.updateTask({
            id: _.get(task, 'id'),
            paymentId: _.get(payment, 'id')
          });

          return {
            ...payment,
            charge: paymentGenerate.charge,
            payout: paymentGenerate.payout
          };
        }
      );

      return {
        users,
        project,
        phase,
        collaborators,
        payments
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

  // error
  it(`pro user haven't access to contract`, async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });

    const { errors } = await execQuery<TQuery>(
      DECLINE_PAYOUTS_MUTATION,
      {
        payments: _.map(outputData.payments, 'id'),
        comment: _.get(inputData, 'comment')
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.BadRole, 403));
  });

  it(`payments not found`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const { errors } = await execQuery<TQuery>(
      DECLINE_PAYOUTS_MUTATION,
      {
        payments: [_.get(homeUser, 'id')],
        comment: _.get(inputData, 'comment')
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('payments'));
  });

  // success
  it('should allow to decline payouts', async () => {
    const pro = _.find(outputData.users, { email: Email.Pro });
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const { data, errors } = await execQuery<TQuery>(
      DECLINE_PAYOUTS_MUTATION,
      {
        payments: _.map(outputData.payments, 'id'),
        comment: _.get(inputData, 'comment')
      },
      homeUser
    );

    Test.Check.noErrors(errors);

    const result = data?.declinePayouts;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      (payment: any) => {
        const taskToCheck = _.find(outputData.phase!.tasks, { id: payment.task.id });
        if (!taskToCheck) throw GraphQLError.notFound('task to check');

        return {
          payoutRequestedAt: null,
          comments: {
            0: {
              subject: _.get(inputData, ['comment', 'subject']),
              text: safeHtml(_.get(inputData, ['comment', 'text'])),
              roleId: _.get(homeUser, 'lastRoleId'),
              paymentId: _.get(payment, 'id')
            }
          },
          task: {
            id: _.get(taskToCheck, ['id'])
          },
          history: {
            0: {
              action: PaymentHistoryAction.PayoutDeclined,
              type: PaymentHistoryType.User,
              createdAt: {
                $check: '===',
                $value: new Date(),
                $func: (date: Date) => moment(date).format('YYYY.MM.DD HH:M')
              },
              actionedBy: {
                id: _.get(homeUser, 'lastRoleId')
              },
              pro: {
                id: _.get(pro, 'lastRoleId')
              }
            }
          }
        };
      },
      requiredFieldSet
    );
  });
});
