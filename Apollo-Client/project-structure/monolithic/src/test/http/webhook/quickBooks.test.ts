/*external modules*/
import _ from 'lodash';
import { Server } from 'http';
import moment from 'moment';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../db';
import { Task, TaskStatus } from '../../../db/types/task';
import { Payment } from '../../../db/types/payment';
import { Contract, ContractPaymentPlan, ContractStatus } from '../../../db/types/contract';
import { User } from '../../../db/types/user';
import { UserRole } from '../../../db/types/role';
import { PaymentOperationStatus, PaymentOperationType } from '../../../db/types/paymentOperation';
import { QUICK_BOOKS_INTEGRATION_TABLE, QuickBooksIntegration } from '../../../db/types/quickBooksIntegration';
import { PAYMENT_HISTORY_TABLE, PaymentHistoryAction, PaymentHistoryType } from '../../../db/types/paymentHistory';
import { getTaskTotal } from '../../../db/dataUtils/getTaskTotal';
/*models*/
import { QuickBooksIntegrationModel } from '../../../db/models/QuickBooksIntegrationModel';
import { ContractModel } from '../../../db/models/ContractModel';
import { PhaseModel } from '../../../db/models/PhaseModel';
import { StripeModel } from '../../../db/models/StripeModel';
import { PaymentModel } from '../../../db/models/PaymentModel';
import { UserModel } from '../../../db/models/UserModel';
/*GQL*/
import { GraphQLError } from '../../../gql';
/*services*/
import { QuickBooksService } from '../../../services/quickBooks/QuickBooksService';
/*other*/
import { setupServer } from '../../../http';
import { logger } from '../../../logger';
import { config } from '../../../config';
import { Test } from '../../helpers/Test';

import QuickBooksTypes = QuickBooksService.Types;
import QuickBooksError = QuickBooksService.QuickBooksError;
import TestQuickBooks = Test.QuickBooks;

export namespace TestData {
  // # CONST AND TYPES
  export const enum Email {
    Pro = 'pro@test.com',
    Home = 'home@test.com',
    Collaborator = 'collaborator@test.com',
    Other = 'other@test.com'
  }
  export const enum ContractName {
    QuickBooks = 'QuickBooks'
  }
  export const enum PhaseName {
    First = 'FIRST',
    Second = 'SECOND',
    Third = 'THIRD'
  }
  export const enum TaskName {
    First = 'FIRST',
    Second = 'SECOND',
    Third = 'THIRD'
  }

  // # INPUT DATA AND TYPES
  export const inputData = {
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
          name: UserRole.Pro,
          defaultPaymentPlan: ContractPaymentPlan.MonthlySubscription
        }
      }
    ],
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.QuickBooks,
      status: ContractStatus.Hired,
      paymentPlan: ContractPaymentPlan.MonthlySubscription,
      phases: [
        {
          $createQuickBooksItem: true,
          $createQuickBooksInvoiceWith: [TaskName.First],
          name: PhaseName.First,
          order: 1,
          tasks: [
            {
              name: TaskName.First,
              materialCost: 100,
              laborCost: 100,
              otherCost: 100,
              markupPercent: 20,
              order: 1,
              status: TaskStatus.Done,
              payment: {
                payoutRequestedAt: new Date(),
                charge: {
                  availableAt: new Date(),
                  status: PaymentOperationStatus.Succeeded
                }
              }
            }
          ]
        },
        {
          $createQuickBooksItem: false,
          name: PhaseName.Second,
          order: 2,
          tasks: [
            {
              name: TaskName.First,
              materialCost: 100,
              laborCost: 100,
              otherCost: 100,
              markupPercent: 20,
              order: 1,
              status: TaskStatus.Done,
              payment: {
                payoutRequestedAt: new Date(),
                charge: {
                  availableAt: new Date(),
                  status: PaymentOperationStatus.Succeeded
                }
              }
            }
          ]
        }
      ]
    }
  };

  export type TInputData = typeof inputData;

  // # OUTPUT DATA AND TYPES
  export type PopulatedTask = Task & {
    payment: Payment;
  };
  export type PopulatedPhase = Test.TPhase & {
    tasks: Array<PopulatedTask>;
    quickBooksItem?: QuickBooksTypes.IItem;
    quickBooksInvoice?: QuickBooksTypes.IInvoice;
  };
  export type PopulatedContract = Contract & {
    phases: Array<PopulatedPhase>;
  };

  export type TOutputData = {
    users: Test.TUser[];
    contract: PopulatedContract;
    QBIntegration: typeof TestQuickBooks['Integration']['prototype'];
  };

  // # CREATE FUNCTIONS
  export async function createOutputData(inputData: TInputData): Promise<TOutputData> {
    const ctx = { sql, events: [] };

    return getClientTransaction(async client => {
      const users = await Promise.all(
        _.map(inputData.users, async userData => {
          const userGenerate = new Test.UserGenerate(client, ctx);

          await userGenerate.create(_.omit(userData, ['role']) as User);
          await userGenerate.setRole(userData.role);

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
        status: inputData.contract.status,
        paymentPlan: inputData.contract.paymentPlan,
        partnerId: proUser.lastRoleId
      });

      const project = projectGenerate.project!;

      let contract = _.find(project.contracts, { name: ContractName.QuickBooks });
      if (!contract) throw GraphQLError.notFound('contract');

      const QBIntegration = await TestQuickBooks.Integration.initIntegration();
      await QBIntegration.createIntegrationRecord(client, { roleId: proUser.lastRoleId }, ctx);
      await QBIntegration.createOauthClient(client, ctx);

      await QuickBooksIntegrationModel.update.exec(
        client,
        {
          id: QBIntegration.getIntegrationRecord()!.id,
          incomeAccountId: TestQuickBooks.Generators.Account.defaultIncomeAccountId,
          incomeAccountName: TestQuickBooks.Generators.Account.defaultIncomeAccountName,
          expenseAccountId: TestQuickBooks.Generators.Account.defaultExpenseAccountId,
          expenseAccountName: TestQuickBooks.Generators.Account.defaultExpenseAccountName
        },
        ctx
      );

      await QBIntegration.reloadIntegrationRecord(client, ctx);

      const result = await (async () => {
        let quickBooksCustomer: QuickBooksTypes.ICustomer | undefined;

        quickBooksCustomer = await QuickBooksService.Customer.findByEmail.exec(QBIntegration.getOauthClient()!, {
          email: homeUser.email
        });
        if (!quickBooksCustomer) {
          const displayName = [homeUser.firstName, homeUser.lastName, homeUser.email].filter(e => Boolean(e)).join(' ');

          quickBooksCustomer = await QuickBooksService.Customer.findByDisplayName.exec(
            QBIntegration.getOauthClient()!,
            {
              displayName: displayName
            }
          );
          if (!quickBooksCustomer) {
            quickBooksCustomer = await QuickBooksService.Customer.create.exec(QBIntegration.getOauthClient()!, {
              ...(homeUser as Required<User>),
              contractAddress: _.get(_.split(contract.name, '/'), 0).trim()
            });
            if (!quickBooksCustomer) throw new QuickBooksError('Customer not created');

            return {
              quickBooksCustomer,
              quickBooksCustomerCreated: true
            };
          }

          return {
            quickBooksCustomer,
            quickBooksCustomerCreated: false
          };
        }

        return {
          quickBooksCustomer,
          quickBooksCustomerCreated: false
        };
      })();

      let { quickBooksCustomer } = result;
      if (result.quickBooksCustomerCreated) {
        const displayName = [homeUser.firstName, homeUser.lastName, homeUser.email].filter(e => Boolean(e)).join(' ');

        quickBooksCustomer = (await QuickBooksService.Customer.update.exec(QBIntegration.getOauthClient()!, {
          customerId: quickBooksCustomer.Id,
          contractAddress: _.get(_.split(contract.name, '/'), 0).trim(),
          ...homeUser,
          displayName
        }))!;
      }

      const updatedContract = await ContractModel.update.exec(
        client,
        {
          id: contract.id,
          quickBooksCustomerId: quickBooksCustomer.Id,
          quickBooksCustomerDisplayName: quickBooksCustomer.DisplayName
        },
        ctx
      );
      if (!updatedContract) throw GraphQLError.notUpdated('contract');

      contract = updatedContract;

      const phases = (await Promise.all(
        _.map(inputData.contract.phases, async phaseInput => {
          const phaseGenerate = new Test.PhaseGenerate(client, ctx);
          await phaseGenerate.create({
            contractId: contract!.id,
            ...phaseInput
          });

          await Promise.all(
            _.map(phaseInput.tasks, async taskInput => {
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
                  charge: paymentGenerate.charge
                });
              }
            })
          );

          const phase = phaseGenerate.phase!;
          if (_.isEmpty(phase.tasks)) throw GraphQLError.notFound('tasks');

          if (phaseInput.$createQuickBooksItem) {
            const oauthClient = QBIntegration.getOauthClient()!;
            const integrationRecord = QBIntegration.getIntegrationRecord()!;

            let quickBooksItem: QuickBooksTypes.IItem | undefined;
            quickBooksItem = await QuickBooksService.Item.findByName.exec(oauthClient, {
              name: QuickBooksService.Item.buildItemName(phase.name, _.get(_.split(contract!.name, '/'), 0).trim())
            });
            if (!quickBooksItem) {
              quickBooksItem = await QuickBooksService.Item.create.exec(oauthClient, {
                incomeAccount: {
                  value: integrationRecord.incomeAccountId!,
                  name: integrationRecord.incomeAccountName!
                },
                expenseAccount: {
                  value: integrationRecord.expenseAccountId!,
                  name: integrationRecord.expenseAccountName!
                },
                contractAddress: _.get(_.split(contract!.name, '/'), 0).trim(),
                phaseName: phase.name,
                tasks: phase.tasks!
              });
            }

            const updatedPhase = await PhaseModel.update.exec(
              client,
              {
                id: phase.id,
                quickBooksItemId: quickBooksItem.Id,
                quickBooksItemName: quickBooksItem.Name
              },
              ctx
            );

            if (phaseInput.$createQuickBooksInvoiceWith) {
              const tasksForInvoice = _.filter(phase.tasks, t =>
                phaseInput.$createQuickBooksInvoiceWith.includes(t.name as TaskName)
              ) as Array<PopulatedTask>;

              const tasksNames = _.chain(tasksForInvoice)
                .sortBy('order')
                .map('name')
                .value();
              const tasksAmount = StripeModel.getTasksAmount(tasksForInvoice);

              const quickBooksInvoice = await QuickBooksService.Invoice.create.exec(QBIntegration.getOauthClient()!, {
                customerId: quickBooksCustomer.Id,
                customerDisplayName: quickBooksCustomer.DisplayName,
                customerEmail: homeUser.email,
                itemId: quickBooksItem.Id,
                itemName: quickBooksItem.Name,
                payThrough: false,
                amount: tasksAmount,
                ...(tasksForInvoice.length !== phase.tasks!.length ? { tasksNames } : {})
              });

              const updatedTasks = await Promise.all(
                _.map(tasksForInvoice, async task => {
                  const { payment } = task;

                  const updatedPayment = await PaymentModel.update.exec(
                    client,
                    {
                      id: payment.id,
                      quickBooksInvoiceId: quickBooksInvoice.Id
                    },
                    ctx
                  );
                  if (!updatedPayment) throw GraphQLError.notUpdated('payment');

                  return {
                    ...task,
                    payment: updatedPayment
                  };
                })
              );

              const phaseTasks = _.chain(phase.tasks)
                .filter(t => !phaseInput.$createQuickBooksInvoiceWith.includes(t.name as TaskName))
                .concat(updatedTasks)
                .value();

              return {
                ...updatedPhase,
                tasks: phaseTasks,
                quickBooksItem: quickBooksItem
              };
            }

            return {
              ...updatedPhase,
              tasks: phase.tasks,
              quickBooksItem: quickBooksItem
            };
          }

          return phase;
        })
      )) as Array<PopulatedPhase>;

      return {
        users,
        contract: {
          ...contract,
          phases
        },
        QBIntegration: QBIntegration
      };
    });
  }

  export async function removeOutputData(outputData: TOutputData): Promise<void> {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      const oauthClient = outputData.QBIntegration.getOauthClient()!;

      await client.query(
        sql`
            DELETE
            FROM ${PAYMENT_HISTORY_TABLE}
            WHERE true
        `
      );

      // const { rows: paymentsWithQBInvoice } = await client.query<Payment>(
      //   ctx.sql`
      //   SELECT *
      //   FROM ${PAYMENT_TABLE} payments
      //   WHERE payments."quickBooksInvoiceId" IS NOT NULL
      // `
      // );
      //
      // await Promise.all(
      //   _.chain(paymentsWithQBInvoice)
      //     .map('quickBooksInvoiceId')
      //     .uniq()
      //     .compact()
      //     .value()
      //     .map(async QBInvoiceId => {
      //       await QuickBooksService.Invoice.hardRemove.exec(oauthClient, {
      //         invoiceId: QBInvoiceId
      //       });
      //     })
      // );
      //
      // await Promise.all(
      //   _.chain(paymentsWithQBInvoice)
      //     .map('quickBooksPaymentId')
      //     .uniq()
      //     .compact()
      //     .value()
      //     .map(async QBPaymentId => {
      //       await QuickBooksService.Payment.hardRemove.exec(oauthClient, {
      //         paymentId: QBPaymentId
      //       });
      //     })
      // );

      // if (!_.isEmpty(outputData.contract.phases)) {
      //   await Promise.all(
      //     _.map(outputData.contract.phases, async phase => {
      //       if (phase.quickBooksItemId) {
      //         await QuickBooksService.Item.deactivate.exec(oauthClient, {
      //           itemId: phase.quickBooksItemId
      //         });
      //       }
      //     })
      //   );
      // }

      // if (outputData.contract.quickBooksCustomerId) {
      //   await QuickBooksService.Customer.deactivate.exec(oauthClient, {
      //     customerId: outputData.contract.quickBooksCustomerId
      //   });
      // }

      const itemDestructor = new TestQuickBooks.Destructors.Item(oauthClient);
      await itemDestructor.deactivateAll({
        checkIncomeAccount: TestQuickBooks.Generators.Account.defaultIncomeAccountId,
        checkExpenseAccount: TestQuickBooks.Generators.Account.defaultExpenseAccountId
      });

      await client.query(
        ctx.sql`
        DELETE
        FROM ${QUICK_BOOKS_INTEGRATION_TABLE}
        WHERE true
      `
      );

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
  }
}

describe('POST /quick-books/webhook', () => {
  let server: Server;
  let eventSender: typeof TestQuickBooks.Webhook.EventSender['prototype'];
  let outputData: TestData.TOutputData;

  before(async function() {
    this.timeout(1000 * 60);

    server = await setupServer();
    outputData = await TestData.createOutputData(TestData.inputData);

    eventSender = new TestQuickBooks.Webhook.EventSender(outputData.QBIntegration, {
      port: config.http.port,
      host: 'localhost'
    });
  });

  after(async () => {
    server.close(() => logger.info('Server for test closed'));
    await TestData.removeOutputData(outputData);
  });

  describe('Account EVENTS', () => {
    before(() => {
      logger.level = 'error';
    });

    after(() => {
      logger.level = 'trace';
    });

    describe('', () => {
      const ctx = { sql, events: [] };

      let quickBooksIntegrationRecord: QuickBooksIntegration | undefined;

      const dataForUpdate = {
        name: 'Test name'
      };

      before(async () => {
        quickBooksIntegrationRecord = outputData.QBIntegration.getIntegrationRecord()!;

        await QuickBooksService.Account.update.exec(outputData.QBIntegration.getOauthClient()!, {
          accountId: quickBooksIntegrationRecord.incomeAccountId!,
          name: dataForUpdate.name
        });
      });

      after(async () => {
        await QuickBooksService.Account.update.exec(outputData.QBIntegration.getOauthClient()!, {
          accountId: quickBooksIntegrationRecord!.incomeAccountId!,
          name: quickBooksIntegrationRecord!.incomeAccountName!
        });
      });

      it('EVENT updated - Income Account field "Name"', async () => {
        await eventSender.sendEvent({
          id: quickBooksIntegrationRecord!.incomeAccountId!,
          eventType: QuickBooksTypes.EntityOperation.Update,
          entityName: QuickBooksTypes.Entity.Account
        });

        await getClient(async client => {
          const updatedQuickBooksIntegrationRecord = await QuickBooksIntegrationModel.findById.exec(
            client,
            {
              quickBooksIntegrationId: quickBooksIntegrationRecord!.id
            },
            ctx
          );
          if (!updatedQuickBooksIntegrationRecord) throw GraphQLError.notFound('Quick Books Integration Record');

          Test.Check.data(updatedQuickBooksIntegrationRecord, {
            incomeAccountName: dataForUpdate.name
          });
        });
      });
    });

    describe('', () => {
      const ctx = { sql, events: [] };

      let quickBooksIntegrationRecord: QuickBooksIntegration | undefined;

      const dataForUpdate = {
        name: 'Test name'
      };

      before(async () => {
        quickBooksIntegrationRecord = outputData.QBIntegration.getIntegrationRecord()!;

        await QuickBooksService.Account.update.exec(outputData.QBIntegration.getOauthClient()!, {
          accountId: quickBooksIntegrationRecord.expenseAccountId!,
          name: dataForUpdate.name
        });
      });

      after(async () => {
        await QuickBooksService.Account.update.exec(outputData.QBIntegration.getOauthClient()!, {
          accountId: quickBooksIntegrationRecord!.expenseAccountId!,
          name: quickBooksIntegrationRecord!.expenseAccountName!
        });
      });

      it('EVENT updated - Expense Account field "Name"', async () => {
        await eventSender.sendEvent({
          id: quickBooksIntegrationRecord!.expenseAccountId!,
          eventType: QuickBooksTypes.EntityOperation.Update,
          entityName: QuickBooksTypes.Entity.Account
        });

        await getClient(async client => {
          const updatedQuickBooksIntegrationRecord = await QuickBooksIntegrationModel.findById.exec(
            client,
            {
              quickBooksIntegrationId: quickBooksIntegrationRecord!.id
            },
            ctx
          );
          if (!updatedQuickBooksIntegrationRecord) throw GraphQLError.notFound('Quick Books Integration Record');

          Test.Check.data(updatedQuickBooksIntegrationRecord, {
            expenseAccountName: dataForUpdate.name
          });
        });
      });
    });
  });

  describe('Customer EVENTS', () => {
    before(() => {
      logger.level = 'error';
    });

    after(() => {
      logger.level = 'trace';
    });

    describe('', () => {
      const ctx = { sql, events: [] };

      let contract: TestData.PopulatedContract | undefined;

      const dataForUpdate = {
        name: 'Test name'
      };

      before(async () => {
        contract = outputData.contract;

        await QuickBooksService.Customer.update.exec(outputData.QBIntegration.getOauthClient()!, {
          customerId: contract.quickBooksCustomerId!,
          displayName: dataForUpdate.name
        });
      });

      after(async () => {
        await QuickBooksService.Customer.update.exec(outputData.QBIntegration.getOauthClient()!, {
          customerId: contract!.quickBooksCustomerId!,
          displayName: contract!.quickBooksCustomerDisplayName!
        });
      });

      it('EVENT updated - Customer field "DisplayName"', async () => {
        await eventSender.sendEvent({
          id: contract!.quickBooksCustomerId!,
          eventType: QuickBooksTypes.EntityOperation.Update,
          entityName: QuickBooksTypes.Entity.Customer
        });

        await getClient(async client => {
          const updatedContract = await ContractModel.findById.exec(
            client,
            {
              contractId: contract!.id
            },
            ctx
          );
          if (!updatedContract) throw GraphQLError.notFound('Contract');

          Test.Check.data(updatedContract, {
            quickBooksCustomerDisplayName: dataForUpdate.name
          });
        });
      });
    });
  });

  describe('Item EVENTS', () => {
    before(() => {
      logger.level = 'error';
    });

    after(() => {
      logger.level = 'trace';
    });

    describe('', () => {
      const ctx = { sql, events: [] };

      let contract: TestData.PopulatedContract | undefined;
      let firstPhase: TestData.PopulatedPhase | undefined;

      const dataForUpdate = {
        name: 'Test name'
      };

      before(async () => {
        contract = outputData.contract;
        firstPhase = _.find(contract.phases, { name: TestData.PhaseName.First });

        await QuickBooksService.Item.update.exec(outputData.QBIntegration.getOauthClient()!, {
          itemId: firstPhase!.quickBooksItemId!,
          name: dataForUpdate.name
        });
      });

      after(async () => {
        await QuickBooksService.Item.update.exec(outputData.QBIntegration.getOauthClient()!, {
          itemId: firstPhase!.quickBooksItemId!,
          name: firstPhase!.quickBooksItemName!
        });
      });

      it('EVENT updated - Item field "Name"', async () => {
        await eventSender.sendEvent({
          id: firstPhase!.quickBooksItemId!,
          eventType: QuickBooksTypes.EntityOperation.Update,
          entityName: QuickBooksTypes.Entity.Item
        });

        await getClient(async client => {
          const updatedPhase = await PhaseModel.findById.exec(
            client,
            {
              phaseId: firstPhase!.id
            },
            ctx
          );
          if (!updatedPhase) throw GraphQLError.notFound('Phase');

          Test.Check.data(updatedPhase, {
            quickBooksItemName: dataForUpdate.name
          });
        });
      });
    });
  });

  describe('Invoice EVENTS', () => {
    before(() => {
      logger.level = 'error';
    });

    after(() => {
      logger.level = 'trace';
    });

    describe('', () => {
      const ctx = { sql, events: [] };

      let contract: TestData.PopulatedContract | undefined;
      let firstPhase: TestData.PopulatedPhase | undefined;
      let firstTask: TestData.PopulatedTask | undefined;

      const dataForUpdate = {
        balance: 0
      };

      before(async () => {
        contract = outputData.contract;
        firstPhase = _.find(contract.phases, { name: TestData.PhaseName.First })!;
        firstTask = _.find(firstPhase!.tasks, { name: TestData.TaskName.First })!;

        await QuickBooksService.Invoice.update.exec(outputData.QBIntegration.getOauthClient()!, {
          invoiceId: firstTask!.payment.quickBooksInvoiceId!,
          amount: dataForUpdate.balance
        });
      });

      after(async () => {
        await QuickBooksService.Invoice.update.exec(outputData.QBIntegration.getOauthClient()!, {
          invoiceId: firstTask!.payment.quickBooksInvoiceId!,
          amount: StripeModel.getTasksAmount(firstPhase!.tasks)
        });
      });

      it('EVENT updated - Invoice field "Balance"(=0)', async () => {
        await eventSender.sendEvent({
          id: firstTask!.payment.quickBooksInvoiceId!,
          eventType: QuickBooksTypes.EntityOperation.Update,
          entityName: QuickBooksTypes.Entity.Invoice
        });

        await getClient(async client => {
          const updatedPayment = await PaymentModel.findById.exec(
            client,
            {
              paymentId: firstTask!.payment.id
            },
            ctx
          );
          if (!updatedPayment) throw GraphQLError.notFound('Payment');
          if (!updatedPayment.payoutId) {
            throw new GraphQLError(`Payment must be have payoutId`);
          }

          Test.Check.data(updatedPayment, {
            approvedAt: {
              $check: '===',
              $value: new Date(),
              $func: (value: any) => moment(value).format('YYYY:MM:DD HH:mm')
            }
          });

          const payout = await PaymentModel.getPayout.exec(
            client,
            {
              paymentId: updatedPayment.id
            },
            ctx
          );
          if (!payout) throw GraphQLError.notFound('Payout');

          Test.Check.data(payout, {
            type: PaymentOperationType.Payout,
            status: PaymentOperationStatus.Succeeded,
            stripeId: 'none',
            fake: true,
            amount: StripeModel.getTasksAmount([firstTask!]),
            availableAt: {
              $check: '===',
              $value: new Date(),
              $func: (value: any) => moment(value).format('YYYY:MM:DD HH:mm')
            }
          });

          const [lastPaymentHistory] = await PaymentModel.getHistory.exec(
            client,
            {
              paymentId: updatedPayment.id
            },
            ctx
          );
          if (!lastPaymentHistory) throw GraphQLError.notFound('Last Payment History');

          Test.Check.data(lastPaymentHistory, {
            proRoleId: contract!.partnerId,
            action: PaymentHistoryAction.PayoutApproved,
            type: PaymentHistoryType.QuickBooks
          });
        });
      });
    });
  });
});
