/*external modules*/
import _ from 'lodash';
import async from 'async';
import { Job } from 'bull';
import mock from 'mock-require';
import moment from 'moment';
import assert from 'assert';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../db';
import { PaymentOperation, PaymentOperationStatus } from '../../db/types/paymentOperation';
import { Contract } from '../../db/types/contract';
import { UserRole } from '../../db/types/role';
import { TaskStatus } from '../../db/types/task';
import { PAYMENT_HISTORY_TABLE, PaymentHistoryAction } from '../../db/types/paymentHistory';
import { getTaskTotal } from '../../db/dataUtils/getTaskTotal';
/*models*/
import { CollaboratorModel } from '../../db/models/CollaboratorModel';
import { UserModel } from '../../db/models/UserModel';
import { ContractModel } from '../../db/models/ContractModel';
import { PaymentModel } from '../../db/models/PaymentModel';
/*GQL*/
import { GraphQLError } from '../../gql';
import { Payment } from '../../gql/resolvers/Payment';
import { Task } from '../../gql/resolvers/Types/Task/Task';
import { Phase } from '../../gql/resolvers/Types/Phase/Phase';
/*consumers*/
import { ReleasePayoutOptions } from '../../jobs/consumers/release-payout';
/*other*/
import { Test } from '../helpers/Test';
import { logger } from '../../logger';

let { default: jobWorker } = require('../../jobs'); // eslint-disable-line
let { StripeModel } = require('../../db/models/StripeModel'); // eslint-disable-line
let { releasePayoutConsumer } = require('../../jobs/consumers/release-payout');

const enum Email {
  ProFirst = 'proFirst@test.com',
  ProSecond = 'proSecond@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  Release = 'Release',
  WithAllPhasesCharge = 'WithAllPhasesCharge'
}
const enum PhaseName {
  First = 'FIRST',
  Second = 'SECOND',
  Third = 'THIRD'
}

type PopulatedPayment = Payment & { charge: PaymentOperation; payout?: PaymentOperation };
type PopulatedTask = Task & { payment: PopulatedPayment };
type PopulatedPhase = Phase & { tasks: Array<PopulatedTask> };
type PopulatedContract = Contract & {
  phases: Array<PopulatedPhase>;
};

interface OutputData {
  users: Test.TUser[];
  contracts: Array<PopulatedContract>;
}

async function createOutputData<TInput extends { [k: string]: any }>(inputData: TInput) {
  const ctx = { sql, events: [] };

  return getClientTransaction(async client => {
    const users = await Promise.all(
      _.map(inputData.users, async userData => {
        const userGenerate = new Test.UserGenerate(client, ctx);

        await userGenerate.create({
          email: userData.email
        });
        await userGenerate.setRole({ name: userData.role.name });

        return userGenerate.user!;
      })
    );

    const homeUser = _.find(users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const proUserFirst = _.find(users, { email: Email.ProFirst });
    if (!proUserFirst) throw GraphQLError.notFound('pro');

    const proUserSecond = _.find(users, { email: Email.ProSecond });
    if (!proUserSecond) throw GraphQLError.notFound('pro');

    const projectGenerate = new Test.ProjectGenerate(client, ctx);
    await projectGenerate.create({
      ownerId: homeUser.lastRoleId,
      matchData: inputData.project.matchData as any
    });

    const pros = [proUserFirst, proUserSecond];
    const contracts: OutputData['contracts'] = await async.map(inputData.contracts, async (contractInput: any) => {
      const proUser = _.find(pros, { email: contractInput.$partnerEmail });
      if (!proUser) throw GraphQLError.notFound('pro');

      await projectGenerate.addContract({
        name: contractInput.name,
        partnerId: proUser.lastRoleId
      });

      const project = projectGenerate.project!;

      const contract = _.find(project.contracts, {
        name: contractInput.name
      });
      if (!contract) throw GraphQLError.notFound('contract');

      const phases: Array<PopulatedPhase> = await async.map(contractInput.phases, async (phaseInput: any) => {
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

      _.set(contract, 'phases', phases);
      return contract;
    });

    return {
      users,
      contracts
    };
  });
}

async function removeOutputData<TData extends { [k: string]: any }>(outputData: TData) {
  const ctx = { sql, events: [] };
  await getClientTransaction(async client => {
    await client.query(
      sql`
            DELETE
            FROM ${PAYMENT_HISTORY_TABLE}
            WHERE true
        `
    );

    if (!_.isEmpty(outputData?.collaborators)) {
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

    if (!_.isEmpty(outputData?.users)) {
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

describe('jobs/consumers/release-payout', () => {
  let outputData: OutputData;

  const jobId = _.uniqueId();

  const inputData = {
    users: [
      {
        email: Email.Home,
        role: {
          name: UserRole.HomeOwner
        }
      },
      {
        email: Email.ProFirst,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.ProSecond,
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
    contracts: [
      {
        $partnerEmail: Email.ProFirst,
        name: ContractName.Release,
        phases: [
          {
            name: PhaseName.First,
            order: 1000,
            tasks: [
              {
                name: 'task 1',
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
                    status: PaymentOperationStatus.Failed
                  }
                }
              }
            ]
          },
          {
            name: PhaseName.Second,
            order: 1230,
            tasks: [
              {
                name: 'task 1',
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
                    status: PaymentOperationStatus.Failed
                  }
                }
              },
              {
                name: 'task 2',
                materialCost: 100,
                laborCost: 100,
                otherCost: 100,
                markupPercent: 20,
                order: 500,
                status: TaskStatus.Done,
                payment: {
                  payoutRequestedAt: new Date(),
                  externalJobId: jobId,
                  charge: {
                    availableAt: new Date(),
                    status: PaymentOperationStatus.Succeeded,
                    stripeId: _.uniqueId()
                  }
                }
              },
              {
                name: 'task 3',
                materialCost: 200,
                laborCost: 200,
                otherCost: 200,
                markupPercent: 40,
                order: 500,
                status: TaskStatus.Done,
                payment: {
                  payoutRequestedAt: new Date(),
                  externalJobId: jobId,
                  charge: {
                    availableAt: new Date(),
                    status: PaymentOperationStatus.Succeeded,
                    stripeId: _.uniqueId()
                  }
                }
              },
              {
                name: 'task 4',
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
                    stripeId: 'none',
                    amount: 0
                  }
                }
              }
            ]
          },
          {
            name: PhaseName.Third,
            order: 1230,
            tasks: [
              {
                name: 'task 1',
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
                    stripeId: 'none',
                    amount: 0
                  }
                }
              }
            ]
          }
        ]
      },
      {
        $partnerEmail: Email.ProSecond,
        name: ContractName.WithAllPhasesCharge,
        phases: [
          {
            name: PhaseName.First,
            order: 1000,
            tasks: [
              {
                name: 'task 1',
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
                    stripeId: 'none',
                    amount: 0
                  }
                }
              }
            ]
          }
        ]
      }
    ]
  };

  before(async () => {
    outputData = await createOutputData<typeof inputData>(inputData);

    logger.level = 'error';
  });

  after(async () => {
    await removeOutputData(outputData);
  });

  //success
  describe('', () => {
    const ctx = { sql, events: [] };

    let contract: PopulatedContract | undefined;
    let successPayments: PopulatedPayment[] | undefined;

    let jobData: any | undefined;
    const mockJobWorker = {
      autoContractCloseId: '',
      getQueue(name: string) {
        if (name === 'auto-contract-close') {
          return this;
        }

        throw new GraphQLError(`in getQueue. "name" must be equal 'auto-contract-close'.`);
      },
      add(data: any) {
        jobData = data;
        return {
          id: this.autoContractCloseId = _.uniqueId()
        };
      }
    };

    function sendNotification(senderName: string, options: object) {
      Test.Check.data(
        { senderName },
        {
          senderName: 'payoutReleased'
        }
      );

      const paymentIds = _.map(successPayments, 'id');
      Test.Check.data(options, {
        payments: {
          $check: 'every',
          $value: (paymentId: string) => _.includes(paymentIds, paymentId)
        }
      });
    }

    function publishPaymentsUpdated(options: { paymentId: string; contractId: string }) {
      const paymentIds = _.map(successPayments, 'id');

      Test.Check.data(options, {
        contractId: contract!.id
      });

      assert(_.includes(paymentIds, options.paymentId), 'Invalid paymentId');
    }

    before(async () => {
      contract = _.find(outputData.contracts, { name: ContractName.WithAllPhasesCharge });
      if (!contract) throw GraphQLError.notFound('contract');

      const firstPhase = _.find(contract.phases, { name: PhaseName.First });
      if (!firstPhase) throw GraphQLError.notFound('first phase');

      successPayments = _.chain(firstPhase.tasks)
        .filter(task => task?.payment.charge.status === PaymentOperationStatus.Succeeded)
        .map('payment')
        .filter(payment => !!payment.charge.stripeId)
        .value();
      if (!successPayments) throw GraphQLError.notFound('success payments');

      mock('../../jobs', mockJobWorker);

      mock('../../notifications/index', { sendNotification });
      mock('../../notifications/subscriptions/publishPaymentsUpdated', { publishPaymentsUpdated });

      mock.reRequire('../../notifications/subscriptions/index');

      // eslint-disable-next-line
      ({ StripeModel } = mock.reRequire('../../db/models/StripeModel'));
      // eslint-disable-next-line
      ({ default: jobWorker } = mock.reRequire('../../jobs'));
      ({ releasePayoutConsumer } = mock.reRequire('../../jobs/consumers/release-payout'));
    });

    after(async () => {
      await removeOutputData(outputData);
      outputData = await createOutputData(inputData);

      mock.stopAll();
    });

    it('should allow to release payout and start auto contract close job', async () => {
      try {
        const paymentIds = _.map(successPayments, 'id');
        const releasePayoutOptions = {
          id: jobId,
          data: {
            payments: paymentIds
          }
        };

        await releasePayoutConsumer(releasePayoutOptions as Job<ReleasePayoutOptions>);

        const autoCloseContractId = _.get(jobData, 'contractId');
        if (!autoCloseContractId) throw new GraphQLError(`job auto-contract-close not created`);

        Test.Check.data(
          { autoCloseContractId },
          {
            autoCloseContractId: {
              $check: 'equal',
              $value: contract!.id,
              $eMessage: `Invalid contractId in job auto-contract-close`
            }
          }
        );

        await getClient(async client => {
          await async.map(successPayments!, async payment => {
            const updatedPayment = await PaymentModel.findById.exec(
              client,
              {
                paymentId: payment.id
              },
              ctx
            );
            if (!updatedPayment) throw GraphQLError.notFound('payment');

            Test.Check.data(updatedPayment, {
              externalJobId: null
            });

            const payout = await PaymentModel.getPayout.exec(
              client,
              {
                paymentId: payment.id
              },
              ctx
            );
            if (!payout) throw GraphQLError.notFound('payout');

            Test.Check.data(payout, {
              stripeId: 'none',
              amount: 0,
              availableAt: {
                $check: '==',
                $value: new Date(),
                $func: date => moment(date).format('YYYY.MM.DD HH:mm')
              }
            });
          });

          const contractDB = await ContractModel.findById.exec(
            client,
            {
              contractId: contract!.id
            },
            ctx
          );
          if (!contractDB) throw GraphQLError.notFound('contract');

          Test.Check.data(contractDB, {
            autoCloseJobId: String(mockJobWorker.autoContractCloseId)
          });
        });
      } catch (error) {
        Test.Check.noErrors(error);
      }
    });
  });

  describe('', () => {
    const ctx = { sql, events: [] };

    const transactionId = _.uniqueId();
    const stripeId = _.uniqueId();
    const availableAt = Date.now() / 1000;

    let contract: PopulatedContract | undefined;

    let successPayments: PopulatedPayment[] | undefined;
    let payoutAmount: number | undefined;

    let stripeDescription: string | undefined;
    let payoutsCreateData: { payoutData: any; options: any } | undefined;

    class Stripe {
      constructor(public secrets: any, public config: object) {}

      charges = {
        async retrieve(stripeId: string) {
          const stripeIds = _.map(successPayments, pay => pay.charge.stripeId);

          if (!_.includes(stripeIds, stripeId)) {
            throw new GraphQLError(`incorrect stripeId: ${stripeId}`);
          }

          return {
            transfer: {
              balance_transaction: transactionId
            }
          };
        }
      };

      balanceTransactions = {
        async retrieve(tId: string) {
          if (tId !== transactionId) {
            throw new GraphQLError(`invalid transactionId`);
          }

          return {
            available_on: availableAt
          };
        }
      };

      payouts = {
        async create(payoutData: any, options: any) {
          payoutsCreateData = {
            payoutData,
            options
          };

          return {
            id: stripeId,
            arrival_date: availableAt
          };
        }
      };
    }

    function sendNotification(senderName: string, options: object) {
      Test.Check.data(
        { senderName },
        {
          senderName: 'payoutReleased'
        }
      );

      const paymentIds = _.map(successPayments, 'id');
      Test.Check.data(options, {
        payments: {
          $check: 'every',
          $value: (paymentId: string) => _.includes(paymentIds, paymentId)
        }
      });
    }

    function publishPaymentsUpdated(options: { paymentId: string; contractId: string }) {
      const paymentIds = _.map(successPayments, 'id');

      Test.Check.data(options, {
        contractId: contract!.id
      });

      assert(_.includes(paymentIds, options.paymentId), 'Invalid paymentId');
    }

    before(async () => {
      contract = _.find(outputData.contracts, { name: ContractName.Release });
      if (!contract) throw GraphQLError.notFound('contract');

      const secondPhase = _.find(contract.phases, { name: PhaseName.Second });
      if (!secondPhase) throw GraphQLError.notFound('second phase');

      stripeDescription = `Release funds for the phase: ${secondPhase.name}`;

      successPayments = _.chain(secondPhase.tasks)
        .filter(task => task?.payment.charge.status === PaymentOperationStatus.Succeeded)
        .map('payment')
        .filter(payment => !!payment.charge.stripeId)
        .value();
      if (!successPayments) throw GraphQLError.notFound('success payments');

      payoutAmount = _.sumBy(successPayments, payment => payment.charge.payout);

      mock('stripe', Stripe);

      mock('../../notifications/index', { sendNotification });
      mock('../../notifications/subscriptions/publishPaymentsUpdated', { publishPaymentsUpdated });

      mock.reRequire('../../notifications/subscriptions/index');

      // eslint-disable-next-line
      ({ StripeModel } = mock.reRequire('../../db/models/StripeModel'));
      // eslint-disable-next-line
      ({ default: jobWorker } = mock.reRequire('../../jobs'));
      ({ releasePayoutConsumer } = mock.reRequire('../../jobs/consumers/release-payout'));
    });

    after(async () => {
      await removeOutputData(outputData);
      outputData = await createOutputData(inputData);

      mock.stopAll();
    });

    it('should allow to release payout', async () => {
      try {
        const paymentIds = _.map(successPayments, 'id');
        const releasePayoutOptions = {
          id: jobId,
          data: {
            payments: paymentIds
          }
        };

        await releasePayoutConsumer(releasePayoutOptions as Job<ReleasePayoutOptions>);

        if (!payoutsCreateData) throw GraphQLError.notFound('payouts create data');
        Test.Check.data(payoutsCreateData.payoutData, {
          amount: payoutAmount,
          description: stripeDescription
        });

        await getClient(async client => {
          const payoutIds: string[] = await async.map(successPayments!, async payment => {
            const updatedPayment = await PaymentModel.findById.exec(
              client,
              {
                paymentId: payment.id
              },
              ctx
            );
            if (!updatedPayment) throw GraphQLError.notFound('payment');

            Test.Check.data(updatedPayment, {
              externalJobId: null
            });

            const payout = await PaymentModel.getPayout.exec(
              client,
              {
                paymentId: payment.id
              },
              ctx
            );
            if (!payout) throw GraphQLError.notFound('payout');

            const isFakePayment = payment.charge.stripeId === 'none' && payment.charge.amount === 0;
            if (isFakePayment) {
              Test.Check.data(payout, {
                stripeId: 'none',
                availableAt: {
                  $check: '==',
                  $value: new Date(availableAt * 1000),
                  $func: date => moment(date).format('YYYY.MM.DD HH:mm')
                },
                amount: 0
              });
            } else {
              Test.Check.data(payout, {
                stripeId,
                availableAt: {
                  $check: '==',
                  $value: new Date(availableAt * 1000),
                  $func: date => moment(date).format('YYYY.MM.DD HH:mm')
                },
                amount: payment.charge.payout
              });

              return payout.id;
            }
          });

          const metadataPayouts = _.get(payoutsCreateData, ['payoutData', 'metadata', 'payouts']).split(',');
          if (_.without(metadataPayouts, ..._.compact(payoutIds)).length > 0) {
            throw new GraphQLError(`invalid metadata.payouts`);
          }
        });
      } catch (error) {
        Test.Check.noErrors(error);
      }
    });
  });

  describe('', () => {
    const ctx = { sql, events: [] };

    let contract: PopulatedContract | undefined;
    let zeroPayments: PopulatedPayment[] | undefined;

    function sendNotification(senderName: string, options: object) {
      Test.Check.data(
        { senderName },
        {
          senderName: 'payoutReleased'
        }
      );

      const zeroPaymentIds = _.map(zeroPayments, 'id');
      Test.Check.data(options, {
        payments: {
          $check: 'every',
          $value: (paymentId: string) => _.includes(zeroPaymentIds, paymentId)
        }
      });
    }

    function publishPaymentsUpdated(options: { paymentId: string; contractId: string }) {
      const zeroPaymentIds = _.map(zeroPayments, 'id');

      Test.Check.data(options, {
        contractId: contract!.id
      });

      assert(_.includes(zeroPaymentIds, options.paymentId), 'Invalid paymentId');
    }

    before(async () => {
      contract = _.find(outputData.contracts, { name: ContractName.Release });
      if (!contract) throw GraphQLError.notFound('contract');

      const thirdPhase = _.find(contract.phases, { name: PhaseName.Third });
      if (!thirdPhase) throw GraphQLError.notFound('third phase');

      zeroPayments = thirdPhase.tasks.map(task => task.payment) as PopulatedPayment[];

      mock('../../notifications/index', { sendNotification });
      mock('../../notifications/subscriptions/publishPaymentsUpdated', { publishPaymentsUpdated });

      mock.reRequire('../../notifications/subscriptions/index');

      // eslint-disable-next-line
      ({ default: jobWorker } = mock.reRequire('../../jobs'));
      ({ releasePayoutConsumer } = mock.reRequire('../../jobs/consumers/release-payout'));
    });

    after(async () => {
      await removeOutputData(outputData);
      outputData = await createOutputData(inputData);

      mock.stopAll();
    });

    it('should allow to release payout if zero amount', async () => {
      try {
        const paymentIds = _.map(zeroPayments, 'id');
        const releasePayoutOptions = {
          id: jobId,
          data: {
            payments: paymentIds
          }
        };

        await releasePayoutConsumer(releasePayoutOptions as Job<ReleasePayoutOptions>);

        await getClient(async client => {
          await async.map(zeroPayments!, async payment => {
            const updatedPayment = await PaymentModel.findById.exec(
              client,
              {
                paymentId: payment.id
              },
              ctx
            );
            if (!updatedPayment) throw GraphQLError.notFound('payment');

            Test.Check.data(updatedPayment, {
              externalJobId: null
            });

            const payout = await PaymentModel.getPayout.exec(
              client,
              {
                paymentId: payment.id
              },
              ctx
            );
            if (!payout) throw GraphQLError.notFound('payout');

            Test.Check.data(payout, {
              stripeId: 'none',
              availableAt: {
                $check: '==',
                $value: new Date(),
                $func: date => moment(date).format('YYYY.MM.DD HH:mm')
              }
            });

            const [history] = await PaymentModel.getHistory.exec(
              client,
              {
                paymentId: payment.id
              },
              ctx
            );
            if (history?.action !== PaymentHistoryAction.PayoutApproved) {
              throw new GraphQLError('payment history must be not empty');
            }

            return payout.id;
          });
        });
      } catch (error) {
        Test.Check.noErrors(error);
      }
    });
  });

  describe('', () => {
    const ctx = { sql, events: [] };

    const transactionId = _.uniqueId();
    const availableAt = Date.now() / 1000 + 1000;

    let contract: PopulatedContract | undefined;

    let successPayments: PopulatedPayment[] | undefined;

    let jobData: any | undefined;

    const mockJobWorker = {
      getQueue(name: string) {
        if (name === 'release-payout') {
          return this;
        }

        throw new GraphQLError(`in getQueue. "name" must be equal 'release-payout'.`);
      },
      add(data: any) {
        jobData = data;
      }
    };

    class Stripe {
      constructor(public secrets: any, public config: object) {}

      charges = {
        async retrieve(stripeId: string) {
          const stripeIds = _.map(successPayments, pay => pay.charge.stripeId);

          if (!_.includes(stripeIds, stripeId)) {
            throw new GraphQLError(`incorrect stripeId: ${stripeId}`);
          }

          return {
            transfer: {
              balance_transaction: transactionId
            }
          };
        }
      };

      balanceTransactions = {
        async retrieve(tId: string) {
          if (tId !== transactionId) {
            throw new GraphQLError(`invalid transactionId`);
          }

          return {
            available_on: availableAt
          };
        }
      };
    }

    function sendNotification(senderName: string, options: object) {
      Test.Check.data(
        { senderName },
        {
          senderName: 'payoutReleased'
        }
      );

      const paymentIds = _.map(successPayments, 'id');
      Test.Check.data(options, {
        payments: {
          $check: 'every',
          $value: (paymentId: string) => _.includes(paymentIds, paymentId)
        }
      });
    }

    function publishPaymentsUpdated(options: { paymentId: string; contractId: string }) {
      const paymentIds = _.map(successPayments, 'id');

      Test.Check.data(options, {
        contractId: contract!.id
      });

      assert(_.includes(paymentIds, options.paymentId), 'Invalid paymentId');
    }

    before(async () => {
      contract = _.find(outputData.contracts, { name: ContractName.Release });
      if (!contract) throw GraphQLError.notFound('contract');

      const secondPhase = _.find(contract.phases, { name: PhaseName.Second });
      if (!secondPhase) throw GraphQLError.notFound('second phase');

      successPayments = _.chain(secondPhase.tasks)
        .filter(task => task?.payment.charge.status === PaymentOperationStatus.Succeeded)
        .map('payment')
        .filter(payment => !!payment.charge.stripeId)
        .value();
      if (!successPayments) throw GraphQLError.notFound('success payments');

      mock('stripe', Stripe);
      mock('../../jobs', mockJobWorker);

      mock('../../notifications/index', { sendNotification });
      mock('../../notifications/subscriptions/publishPaymentsUpdated', { publishPaymentsUpdated });

      mock.reRequire('../../notifications/subscriptions/index');

      // eslint-disable-next-line
      ({ default: jobWorker } = mock.reRequire('../../jobs'));
      ({ releasePayoutConsumer } = mock.reRequire('../../jobs/consumers/release-payout'));
    });

    after(async () => {
      await removeOutputData(outputData);
      outputData = await createOutputData(inputData);

      mock.stopAll();
    });

    it('release payouts if "availableAt" not come', async () => {
      try {
        const paymentIds = _.map(successPayments, 'id');
        const releasePayoutOptions = {
          data: {
            payments: paymentIds
          }
        };

        await releasePayoutConsumer(releasePayoutOptions as Job<ReleasePayoutOptions>);

        const paymentsInJob = _.get(jobData, 'payments');
        if (!paymentsInJob) throw new GraphQLError(`job data is empty`);

        if (_.difference(paymentsInJob, paymentIds).length || _.difference(paymentIds, paymentsInJob).length) {
          throw new GraphQLError(`invalid params for job`);
        }

        await getClient(async client => {
          await async.each(successPayments!, async payment => {
            const updatedPayment = await PaymentModel.findById.exec(
              client,
              {
                paymentId: payment.id
              },
              ctx
            );
            if (!updatedPayment) throw GraphQLError.notFound('payment');

            const payout = await PaymentModel.getPayout.exec(
              client,
              {
                paymentId: payment.id
              },
              ctx
            );
            if (!payout) throw GraphQLError.notFound('payout');

            const isFakePayment = payment.charge.stripeId === 'none' && payment.charge.amount === 0;
            if (isFakePayment) {
              Test.Check.data(payout, {
                availableAt: {
                  $check: '==',
                  $value: new Date(availableAt * 1000),
                  $func: date => moment(date).format('YYYY.MM.DD HH:mm')
                },
                amount: 0,
                stripeId: 'none'
              });
            } else {
              Test.Check.data(payout, {
                availableAt: {
                  $check: '==',
                  $value: new Date(availableAt * 1000),
                  $func: date => moment(date).format('YYYY.MM.DD HH:mm')
                },
                amount: payment.charge.payout,
                stripeId: 'inprogress'
              });
            }
          });
        });
      } catch (error) {
        Test.Check.noErrors(error);
      }
    });
  });

  //error
  it('cannot release payout for not funded phase', async () => {
    const contract = _.find(outputData.contracts, { name: ContractName.Release });
    if (!contract) throw GraphQLError.notFound('contract');

    const secondPhase = _.find(contract.phases, { name: PhaseName.Second });
    if (!secondPhase) throw GraphQLError.notFound('second phase');

    const failedPayments = _.chain(secondPhase.tasks)
      .filter(task => task.payment.charge.status === PaymentOperationStatus.Failed)
      .map('payment')
      .value();
    if (_.isEmpty(failedPayments)) throw GraphQLError.notFound('failed payments');

    try {
      const releasePayoutOptions = {
        data: {
          payments: _.map(failedPayments, 'id')
        }
      };

      await releasePayoutConsumer(releasePayoutOptions as Job<ReleasePayoutOptions>);
    } catch (error) {
      Test.Check.error(error, new Error(`Cannot release payout for not funded phase: ${secondPhase.id}`));
    }
  });

  it('should be related to a single phase', async () => {
    const contract = _.find(outputData.contracts, { name: ContractName.Release });
    if (!contract) throw GraphQLError.notFound('contract');

    const tasks = _.flatMap(contract.phases, phase => phase.tasks);

    try {
      const releasePayoutOptions = {
        data: {
          payments: _.map(tasks, 'paymentId')
        }
      };

      await releasePayoutConsumer(releasePayoutOptions as Job<ReleasePayoutOptions>);
    } catch (error) {
      Test.Check.error(error, new GraphQLError('Payments should be related to a single phase.'));
    }
  });

  it('phases not found', async () => {
    try {
      const releasePayoutOptions = {
        data: {
          payments: _.map(outputData.users, 'id')
        }
      };

      await releasePayoutConsumer(releasePayoutOptions as Job<ReleasePayoutOptions>);
    } catch (error) {
      Test.Check.error(error, GraphQLError.notFound('phases'));
    }
  });
});
