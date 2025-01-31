/*external modules*/
import _ from 'lodash';
import async from 'async';
import moment from 'moment';
import assert from 'assert';
/*DB*/
import { getClientTransaction, sql } from '../../../db';
import { PaymentOperation, PaymentOperationStatus } from '../../../db/types/paymentOperation';
import { Contract } from '../../../db/types/contract';
import { UserRole } from '../../../db/types/role';
import { TaskStatus } from '../../../db/types/task';
import { AddressType } from '../../../db/types/address';
import { Collaborator, CollaboratorPermission } from '../../../db/types/collaborator';
import { InviteType } from '../../../db/types/invite';
import { getTaskTotal } from '../../../db/dataUtils/getTaskTotal';
import { createCommaSeparate } from '../../../db/dataUtils/createCommaSeparate';
/*models*/
import { UserModel } from '../../../db/models/UserModel';
import { CollaboratorModel } from '../../../db/models/CollaboratorModel';
/*GQL*/
import { GraphQLError } from '../../../gql';
import { Payment } from '../../../gql/resolvers/Payment';
import { Task } from '../../../gql/resolvers/Types/Task/Task';
import { Phase } from '../../../gql/resolvers/Types/Phase/Phase';
/*other*/
import { Test } from '../../helpers/Test';
import { payoutReleased } from '../../../notifications/senders';
import { PushNotificationType } from '../../../notifications/push';
import { config } from '../../../config';
import { ChatType } from '../../../db/types/chat';

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum CompanyName {
  Fund = 'Fund'
}
const enum ContractName {
  PayoutReleased = 'PayoutReleased'
}
const enum PhaseName {
  First = 'FIRST',
  Second = 'SECOND',
  Third = 'THIRD'
}
const enum TaskName {
  First = 'FIRST',
  Second = 'SECOND'
}
const enum ChatTitle {
  Direct = 'direct',
  Group = 'group',
  General = 'general'
}

type PopulatedPayment = Payment & { charge: PaymentOperation; payout?: PaymentOperation };
type PopulatedTask = Task & { payment: PopulatedPayment };
type PopulatedPhase = Phase & { tasks: Array<PopulatedTask> };

interface OutputData {
  company: Test.TCompany;
  contract: Contract;
  phases: Array<PopulatedPhase>;
  users: Test.TUser[];
  collaborators: Collaborator[];
  chats: Test.TChat[];
}

describe('notifications/senders/payoutReleased', () => {
  let outputData: OutputData;

  const inputData = {
    users: [
      {
        email: Email.Home,
        firstName: 'home',
        lastName: 'user',
        role: {
          name: UserRole.HomeOwner
        }
      },
      {
        email: Email.Pro,
        firstName: 'pro',
        lastName: 'user',
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
          type: InviteType.ProjectOwnerInvite,
          userRole: UserRole.HomeOwner
        }
      },
      {
        permissions: CollaboratorPermission.Full,
        invite: {
          firstName: 'test pro',
          inviteMessage: 'test pro message',
          type: InviteType.ProjectProInvite,
          userRole: UserRole.Pro
        }
      }
    ],
    company: {
      ownerEmail: Email.Pro,
      name: CompanyName.Fund,
      establishmentYear: 5,
      website: 'https://test',
      address: {
        type: AddressType.Primary,
        phone: '012345678',
        street: 'Main Street',
        city: 'New York',
        state: 'Mississippi',
        zip: '71120',
        lon: 10,
        lat: 56
      }
    },
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.PayoutReleased
    },
    phases: [
      {
        name: PhaseName.First,
        order: 1000,
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
                availableAt: new Date(),
                status: PaymentOperationStatus.Succeeded,
                stripeId: 'progress'
              }
            }
          },
          {
            name: TaskName.Second,
            materialCost: 150,
            laborCost: 600,
            otherCost: 800,
            markupPercent: 30,
            order: 500,
            status: TaskStatus.Done,
            payment: {
              payoutRequestedAt: new Date(),
              charge: {
                availableAt: new Date(),
                status: PaymentOperationStatus.Succeeded,
                stripeId: 'progress'
              }
            }
          }
        ]
      },
      {
        name: PhaseName.Second,
        order: 1000,
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
                availableAt: new Date(),
                status: PaymentOperationStatus.Succeeded,
                stripeId: 'progress'
              }
            }
          }
        ]
      },
      {
        name: PhaseName.Third,
        order: 1000,
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
                availableAt: new Date(),
                status: PaymentOperationStatus.Succeeded,
                stripeId: 'progress'
              }
            }
          },
          {
            name: TaskName.Second,
            materialCost: 150,
            laborCost: 600,
            otherCost: 800,
            markupPercent: 30,
            order: 500,
            status: TaskStatus.Done,
            payment: {
              payoutRequestedAt: new Date(),
              charge: {
                availableAt: new Date(),
                status: PaymentOperationStatus.Failed,
                stripeId: 'progress'
              }
            }
          }
        ]
      }
    ],
    chats: [
      {
        title: ChatTitle.General,
        type: ChatType.Group
      },
      {
        title: ChatTitle.Direct,
        type: ChatType.Direct
      }
    ]
  };

  before(async () => {
    const ctx = { sql, events: [] };

    outputData = await getClientTransaction(async client => {
      const users = await Promise.all(
        _.map(inputData.users, async userData => {
          const userGenerate = new Test.UserGenerate(client, ctx);

          await userGenerate.create({
            email: userData.email,
            firstName: userData?.firstName,
            lastName: userData?.lastName
          });
          await userGenerate.setRole({ name: userData.role.name });

          return userGenerate.user!;
        })
      );

      const homeUser = _.find(users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('owner');

      const proUser = _.find(users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro');

      const companyOwner = _.find(users, { email: inputData.company.ownerEmail });
      if (!companyOwner) throw GraphQLError.notFound('companyOwner');

      const companyGenerate = new Test.CompanyGenerate(client, ctx);
      await companyGenerate.create({
        roleId: companyOwner.lastRoleId,
        ...inputData.company
      });
      await companyGenerate.addAddress(inputData.company.address);

      const company = companyGenerate.company!;

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
        name: ContractName.PayoutReleased
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

      const phases: OutputData['phases'] = await async.map(inputData.phases, async (phaseInput: any) => {
        const phaseGenerate = new Test.PhaseGenerate(client, ctx);
        await phaseGenerate.create({
          contractId: contract.id,
          ...phaseInput
        });

        await async.each(phaseInput.tasks, async (taskInput: any) => {
          await phaseGenerate.addTask({
            creatorId: proUser.lastRoleId,
            ...taskInput
          });

          let task = _.last(phaseGenerate.phase?.tasks)!;

          if (taskInput.payment) {
            const paymentGenerate = new Test.PaymentGenerate(client, ctx);
            await paymentGenerate.createCharge({
              amount: getTaskTotal(task),
              stripeId: 'px_' + _.get(task, 'name'),
              ...taskInput.payment.charge
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
        });

        const phase = phaseGenerate.phase!;
        if (_.isEmpty(phase.tasks)) throw GraphQLError.notFound('tasks');

        return phase;
      });

      const chats: OutputData['chats'] = await async.map(inputData.chats, async chatData => {
        const chatGenerate = new Test.ChatGenerate(client, ctx);

        await chatGenerate.create({
          contractId: contract.id,
          ownerId: homeUser.lastRoleId,
          ...chatData
        });
        await chatGenerate.inviteMember({ memberId: homeUser.lastRoleId });

        return chatGenerate.chat!;
      });

      return {
        users,
        collaborators,
        phases,
        contract,
        company,
        chats
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };

    await getClientTransaction(async client => {
      if (!_.isEmpty(outputData.collaborators)) {
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
      }

      if (!_.isEmpty(outputData.users)) {
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
      }
    });
  });

  // success
  it('check correct emails', async () => {
    try {
      const pro = _.find(outputData.users, { email: Email.Pro });
      if (!pro) throw GraphQLError.notFound('pro');

      const owner = _.find(outputData.users, { email: Email.Home });
      if (!owner) throw GraphQLError.notFound('owner');

      const phase = _.find(outputData.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const generalChat = _.find(outputData.chats, { title: ChatTitle.General });
      if (!generalChat) throw GraphQLError.notFound('general chat');

      const contract = _.get(outputData, 'contract');
      const company = _.get(outputData, 'company');

      const payments = _.chain(phase)
        .get('tasks')
        .map('payment')
        .value();

      const { emails } = await payoutReleased({ payments: _.map(payments, 'id') });

      const phaseName = phase.name;
      const phaseAmount = _.reduce(payments, (acc, payments) => acc + payments.charge.amount, 0);
      const contractName = contract.name;
      const releaseDate = moment().format('MM/DD/YYYY');

      const { street, city, state, zip } = company.address!;
      const companyAddress = `${street}, ${city}, ${state} ${zip}`;

      const proName = pro.firstName && pro.lastName ? `${pro.firstName} ${pro.lastName}` : pro.email;
      const ownerName = owner.firstName && owner.lastName ? `${owner.firstName} ${owner.lastName}` : owner.email;

      const replyTo = `chat+${generalChat.id}`;

      _.map(emails, email => {
        const user = _.find(outputData.users, { email: email.to as string });
        if (!user) throw GraphQLError.notFound('user');

        const isOwner = user.role!.name === UserRole.HomeOwner;
        const isPro = user.role!.name === UserRole.Pro;

        Test.Check.data(email, {
          template: 'payoutReleased',
          to: user.email,
          replyTo,
          locals: {
            proName,
            phaseName,
            contractName,
            amount: createCommaSeparate(phaseAmount / 100),
            releaseDate,
            companyAddress
          }
        });

        if (user.firstName) {
          Test.Check.data(email.locals, {
            userName: user.firstName
          });
        } else {
          Test.Check.data(email.locals, {
            userName: user.email
          });
        }

        if (isOwner) {
          Test.Check.data(email, {
            subject: `Successful  Payment for the Phase ${phaseName} ("${contractName}")`
          });

          assert.ok(_.get(email, ['locals', 'ownerEmail']) === undefined, 'Owner Email must be undefined');

          Test.Check.data(email.locals, {
            url: config.utils.clientUrl(`manage/${contract.id}/payment`),
            proEmail: pro.email
          });
        } else if (isPro) {
          Test.Check.data(email, {
            subject: `${ownerName}  Paid for the Phase ${phaseName} ("${contractName}")`
          });

          assert.ok(_.get(email, ['locals', 'proEmail']) === undefined, 'Pro Email must be undefined');

          Test.Check.data(email.locals, {
            url: config.utils.clientUrl(`manage/${contract.id}/payout`),
            ownerEmail: owner.email
          });
        } else {
          throw new GraphQLError(`unknown user role`);
        }
      });
    } catch (err) {
      Test.Check.noErrors(err);
    }
  });

  it('check correct pushes if partial task paid', async () => {
    try {
      const phase = _.find(outputData.phases, { name: PhaseName.Third });
      if (!phase) throw GraphQLError.notFound('phase');

      const unpaidTasks = _.filter(phase.tasks, task => task.payment.charge.status === PaymentOperationStatus.Failed);
      const unpaidTasksName = _.map(unpaidTasks, 'name').join(', ');
      const unpaidTasksAmount = _.reduce(unpaidTasks, (acc, task) => acc + getTaskTotal(task), 0);

      const payments = _.chain(phase)
        .get('tasks')
        .map('payment')
        .map('id')
        .value();

      const releaseDate = moment().format('MM/DD/YYYY');

      const { pushes } = await payoutReleased({ payments });

      _.map(pushes, pushNotification => {
        const [roleId, pushData, pushOptions] = pushNotification;

        const user = _.find(outputData.users, { lastRoleId: roleId });
        if (!user) throw GraphQLError.notFound('user by roleId');

        Test.Check.data(pushData, {
          title: 'Payout Status',
          body: `Paid all tasks for ${phase.name} on ${releaseDate} except: ${unpaidTasksName}, ($${unpaidTasksAmount} unpaid)`
        });

        Test.Check.data(pushOptions, {
          type: PushNotificationType.PayoutReleased,
          contractId: phase.contractId,
          phaseId: phase.id
        });
      });
    } catch (err) {
      Test.Check.noErrors(err);
    }
  });

  it('check correct pushes if all task paid', async () => {
    try {
      const phase = _.find(outputData.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const payments = _.chain(phase)
        .get('tasks')
        .map('payment')
        .map('id')
        .value();

      const releaseDate = moment().format('MM/DD/YYYY');

      const { pushes } = await payoutReleased({ payments });

      _.map(pushes, pushNotification => {
        const [roleId, pushData, pushOptions] = pushNotification;

        const user = _.find(outputData.users, { lastRoleId: roleId });
        if (!user) throw GraphQLError.notFound('user by roleId');

        Test.Check.data(pushData, {
          title: 'Payout Status',
          body: `Paid all tasks for ${phase.name} on ${releaseDate}.`
        });

        Test.Check.data(pushOptions, {
          type: PushNotificationType.PayoutReleased,
          contractId: phase.contractId,
          phaseId: phase.id
        });
      });
    } catch (err) {
      Test.Check.noErrors(err);
    }
  });

  it('check correct subscriptions', async () => {
    try {
      const phase = _.find(outputData.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const payments = _.chain(phase)
        .get('tasks')
        .map('payment')
        .map('id')
        .value();

      const { subscriptions } = await payoutReleased({ payments });

      _.map(subscriptions, subscription => {
        const [name, args] = subscription;

        Test.Check.data({ name }, { name: 'paymentsUpdated' });

        if (!('paymentId' in args)) {
          throw new GraphQLError(`paymentId is required`);
        } else {
          const payment = _.find(payments, id => id === args.paymentId);
          if (!payment) throw GraphQLError.notFound('payment');
        }

        if (!('contractId' in args)) {
          throw new GraphQLError(`contractId is required`);
        } else {
          Test.Check.data(
            {
              contractId: _.get(outputData, ['contract', 'id'])
            },
            {
              contractId: args.contractId
            }
          );
        }
      });
    } catch (err) {
      Test.Check.noErrors(err);
    }
  });

  // error
  it('all payments should be related to the single phase', async () => {
    try {
      const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      const secondPhase = _.find(outputData.phases, { name: PhaseName.Second });
      if (!secondPhase) throw GraphQLError.notFound('second phase');

      const payments = _.chain(firstPhase)
        .get('tasks')
        .map('payment')
        .concat(_.map(secondPhase.tasks, 'payment'))
        .map('id')
        .value();

      await payoutReleased({ payments });
    } catch (err) {
      Test.Check.error(err, new GraphQLError(`All payments should be related to the single phase`));
    }
  });

  it('error if not valid payments', async () => {
    try {
      const phase = _.find(outputData.phases, { name: PhaseName.Second });
      if (!phase) throw GraphQLError.notFound('phase');

      await payoutReleased({ payments: [phase.id] });
    } catch (err) {
      Test.Check.error(err, GraphQLError.notFound('payment'));
    }
  });
});
