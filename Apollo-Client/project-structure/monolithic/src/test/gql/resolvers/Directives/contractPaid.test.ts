/*external modules*/
import _ from 'lodash';
import assert from 'assert';
import moment from 'moment';
/*DB*/
import { getClientTransaction, sql } from '../../../../db';
import { UserRole } from '../../../../db/types/role';
import { TaskStatus } from '../../../../db/types/task';
import { Contract, ContractPaymentPlan, ContractStatus } from '../../../../db/types/contract';
import { ChangeOrderReason, ChangeOrderStatus } from '../../../../db/types/changeOrder';
import { Phase } from '../../../../db/types/phase';
import { DecisionSelectionType } from '../../../../db/types/decision';
import { PaymentOperation, PaymentOperationStatus } from '../../../../db/types/paymentOperation';
import { Schedule } from '../../../../db/types/schedule';
import { TrackTime } from '../../../../db/types/trackTime';
import { WorkLog } from '../../../../db/types/workLog';
import { TaskReminder } from '../../../../db/types/taskReminder';
import { Payment } from '../../../../db/types/payment';
/*models*/
import { UserModel } from '../../../../db/models/UserModel';
/*GQL*/
import { GraphQLError } from '../../../../gql';
import { Task } from '../../../../gql/resolvers/Types/Task/Task';
import { contractPaid } from '../../../../gql/resolvers/Directives/contractPaid';
/*other*/
import { Test } from '../../../helpers/Test';
import { getTaskTotal } from '../../../../db/dataUtils/getTaskTotal';
import { ScheduleModel } from '../../../../db/models/ScheduleModel';

const enum Email {
  Pro1 = 'pro1@test.com',
  Pro2 = 'pro2@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  Paid = 'Paid',
  NotPaid = 'NotPaid'
}
const enum PhaseName {
  First = 'FIRST'
}
const enum TaskName {
  First = 'FIRST'
}
const enum DecisionName {
  First = 'FIRST'
}

type PopulatedTask = Task & {
  payment: Payment & { charge: PaymentOperation };
  decision: Test.TDecision;
  schedule: Schedule;
  workLog: WorkLog;
  taskReminder: TaskReminder;
};

type PopulatedContract = Contract & {
  phases: Array<
    Phase & {
      tasks: Array<PopulatedTask>;
    }
  >;
  changeOrders: Test.TChangeOrder[];
  trackTime: TrackTime;
};

interface OutputData {
  users: Test.TUser[];
  contracts: PopulatedContract[];
}

describe('gql/resolvers/Directives/contractPaid', () => {
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
        email: Email.Pro1,
        role: {
          name: UserRole.Pro,
          defaultPaymentPlan: ContractPaymentPlan.MonthlySubscription
        }
      },
      {
        email: Email.Pro2,
        role: {
          name: UserRole.Pro,
          defaultPaymentPlan: ContractPaymentPlan.MonthlySubscription
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
        name: ContractName.Paid,
        paid: true,
        partnerEmail: Email.Pro1
      },
      {
        name: ContractName.NotPaid,
        paid: false,
        partnerEmail: Email.Pro2
      }
    ].map(({ name, paid, partnerEmail }) => {
      return {
        partnerEmail,
        name,
        paid,
        status: ContractStatus.Hired,
        phases: [
          {
            name: PhaseName.First,
            order: 1000,
            tasks: [
              {
                name: TaskName.First,
                materialCost: 1,
                laborCost: 1,
                otherCost: 1,
                markupPercent: 5,
                order: 500,
                status: TaskStatus.Done,
                payment: {
                  payoutRequestedAt: new Date(),
                  charge: {
                    availableAt: new Date(),
                    status: PaymentOperationStatus.Succeeded
                  }
                },
                decision: {
                  title: DecisionName.First,
                  dueDate: moment()
                    .add(1, 'day')
                    .toDate(),
                  selectionType: DecisionSelectionType.Single,
                  allowance: 250,
                  options: [
                    {
                      ownerEmail: partnerEmail,
                      option: '>test<',
                      cost: 100
                    },
                    {
                      ownerEmail: partnerEmail,
                      option: 'pro',
                      cost: 150
                    }
                  ]
                },
                schedule: {
                  estimatedTime: 4,
                  startDate: new Date(),
                  endDate: new Date()
                },
                taskReminder: {
                  reminder: 'test',
                  notes: 'test',
                  dueDate: moment()
                    .add(1, 'day')
                    .toDate(),
                  notifies: []
                }
              }
            ]
          }
        ],
        changeOrders: [
          {
            requester: Email.Home,
            status: ChangeOrderStatus.Open,
            reason: ChangeOrderReason.Descope,
            approvedAt: new Date()
          }
        ]
      };
    })
  };

  before(async () => {
    const ctx = { sql, events: [] };

    outputData = await getClientTransaction(async client => {
      const users = await Promise.all(
        _.map(inputData.users, async userData => {
          const userGenerate = new Test.UserGenerate(client, ctx);

          await userGenerate.create({
            email: userData.email
          });
          await userGenerate.setRole({
            name: userData.role.name,
            defaultPaymentPlan: userData.role.defaultPaymentPlan
          });

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
          const partner = _.find(users, { email: contractInput.partnerEmail });
          if (!partner) throw GraphQLError.notFound(`partner by email: "${contractInput.partnerEmail}"`);

          await projectGenerate.addContract({
            name: contractInput.name,
            paid: contractInput.paid,
            status: contractInput.status,
            partnerId: partner.lastRoleId
          });

          const project = projectGenerate.project!;
          const contract = _.find(project.contracts, { name: contractInput.name })!;

          const trackTimeGenerate = new Test.TrackTimeGenerate(client, ctx);
          await trackTimeGenerate.start({
            contractId: contract.id,
            roleId: partner.lastRoleId
          });

          const trackTime = trackTimeGenerate.trackTime!;

          const changeOrders = await Promise.all(
            _.map(contractInput.changeOrders, async changeOrderInput => {
              const changeOrderGenerate = new Test.ChangeOrderGenerate(client, ctx);
              await changeOrderGenerate.create({
                contractId: contract.id,
                requesterId: homeUser.lastRoleId,
                ...changeOrderInput
              });

              return changeOrderGenerate.changeOrder!;
            })
          );

          const phases = await Promise.all(
            _.map(contractInput.phases, async phaseInput => {
              const phaseGenerate = new Test.PhaseGenerate(client, ctx);
              await phaseGenerate.create({
                contractId: contract.id,
                ..._.omit(phaseInput, ['tasks'])
              });

              const tasks = await Promise.all(
                _.map(phaseInput.tasks, async taskInput => {
                  await phaseGenerate.addTask({
                    creatorId: partner.lastRoleId,
                    ..._.omit(taskInput, ['decision', 'schedule', 'taskReminder'])
                  });

                  let task = _.last(phaseGenerate.phase?.tasks)!;
                  if (!task) throw GraphQLError.notFound('task');

                  // payment
                  {
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

                  // decision
                  {
                    const decisionInput = taskInput.decision;

                    task = _.find(phaseGenerate.phase?.tasks, { id: task.id })!;

                    const decisionGenerate = new Test.DecisionGenerate(client, ctx);
                    await decisionGenerate.create({
                      taskId: task.id,
                      dueDate: decisionInput.dueDate,
                      createdById: _.get(partner, 'lastRoleId'),
                      title: decisionInput.title,
                      allowance: decisionInput.allowance
                    });

                    await Promise.all(
                      _.map(decisionInput.options, optionData => {
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

                    const decision = decisionGenerate.decision!;

                    _.set(task, 'decision', decision);
                  }

                  // schedule
                  {
                    const scheduleInput = taskInput.schedule;

                    task = _.find(phaseGenerate.phase?.tasks, { id: task.id })!;

                    const scheduleGenerate = new Test.ScheduleGenerate(client, ctx);
                    await scheduleGenerate.create({
                      roleId: homeUser.lastRoleId,
                      createdById: partner.lastRoleId,
                      taskId: task.id,
                      ...scheduleInput
                    });

                    const schedule = scheduleGenerate.schedule!;

                    _.set(task, 'schedule', schedule);
                  }

                  // work log
                  {
                    task = _.find(phaseGenerate.phase?.tasks, { id: task.id })!;

                    const workLogGenerate = new Test.WorkLogGenerate(client, ctx);
                    await workLogGenerate.start({
                      taskId: task.id,
                      roleId: partner.lastRoleId
                    });

                    const workLog = workLogGenerate.workLog!;

                    _.set(task, 'workLog', workLog);
                  }

                  // TaskReminder
                  {
                    const taskReminderInput = taskInput.taskReminder;

                    task = _.find(phaseGenerate.phase?.tasks, { id: task.id })!;

                    const taskReminderGenerate = new Test.TaskReminderGenerate(client, ctx);
                    await taskReminderGenerate.create({
                      taskId: task.id,
                      roleId: partner.lastRoleId,
                      ...taskReminderInput
                    });

                    const taskReminder = taskReminderGenerate.taskReminder!;

                    _.set(task, 'taskReminder', taskReminder);
                  }

                  return task as PopulatedTask;
                })
              );

              return {
                ...phaseGenerate.phase!,
                tasks
              };
            })
          );

          return Object.assign(contract, {
            phases,
            trackTime,
            changeOrders
          });
        })
      );

      return {
        users,
        contracts
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      const schedules = _.chain(outputData.contracts)
        .flatMap('phases')
        .flatMap('tasks')
        .map('schedule')
        .map('id')
        .flatten()
        .value();

      await Promise.all(
        _.map(schedules, schedule =>
          ScheduleModel.remove.exec(
            client,
            {
              scheduleId: schedule
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
  describe('paid contract', () => {
    let contract!: TArray.SingleType<OutputData['contracts']>;

    before(() => {
      contract = _.find(outputData.contracts, { name: ContractName.Paid })!;
    });

    it('success for contract', async () => {
      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'contractId'
          },
          ctx,
          {
            variableValues: {
              contractId: contract.id
            }
          } as any
        );
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('success for change order', async () => {
      const changeOrder = _.first(contract.changeOrders);
      if (!changeOrder) throw GraphQLError.notFound('changeOrder');

      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'changeOrderId'
          },
          ctx,
          {
            variableValues: {
              changeOrderId: changeOrder.id
            }
          } as any
        );
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('success for track time', async () => {
      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'trackTimeId'
          },
          ctx,
          {
            variableValues: {
              trackTimeId: contract.trackTime.id
            }
          } as any
        );
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('success for phase', async () => {
      const phase = _.find(contract.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'phaseId'
          },
          ctx,
          {
            variableValues: {
              phaseId: phase.id
            }
          } as any
        );
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('success for task', async () => {
      const phase = _.find(contract.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.First });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'taskId'
          },
          ctx,
          {
            variableValues: {
              taskId: task.id
            }
          } as any
        );
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('success for decision', async () => {
      const phase = _.find(contract.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.First });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'decisionId'
          },
          ctx,
          {
            variableValues: {
              decisionId: task.decision.id
            }
          } as any
        );
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('success for payment', async () => {
      const phase = _.find(contract.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.First });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'paymentId'
          },
          ctx,
          {
            variableValues: {
              paymentId: task.payment.id
            }
          } as any
        );
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('success for schedule', async () => {
      const phase = _.find(contract.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.First });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'scheduleId'
          },
          ctx,
          {
            variableValues: {
              scheduleId: task.schedule.id
            }
          } as any
        );
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('success for work log', async () => {
      const phase = _.find(contract.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.First });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'workLogId'
          },
          ctx,
          {
            variableValues: {
              workLogId: task.workLog.id
            }
          } as any
        );
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });

    it('success for TaskReminder', async () => {
      const phase = _.find(contract.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.First });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'taskReminderId'
          },
          ctx,
          {
            variableValues: {
              taskReminderId: task.taskReminder.id
            }
          } as any
        );
      } catch (e) {
        error = e;
      } finally {
        assert(error === null, 'Must be no error.' + error);
      }
    });
  });

  // error
  describe('not paid contract', () => {
    const actionBlockedError = new GraphQLError(`Action blocked because Subscription not paid`);

    let contract!: TArray.SingleType<OutputData['contracts']>;

    before(() => {
      contract = _.find(outputData.contracts, { name: ContractName.NotPaid })!;
    });

    it('failed for contract', async () => {
      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'contractId'
          },
          ctx,
          {
            variableValues: {
              contractId: contract.id
            }
          } as any
        );
      } catch (e) {
        error = e;
        Test.Check.error(e, actionBlockedError);
      } finally {
        assert(error !== null, 'Must be error.');
      }
    });

    it('failed for change order', async () => {
      const changeOrder = _.first(contract.changeOrders);
      if (!changeOrder) throw GraphQLError.notFound('changeOrder');

      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'changeOrderId'
          },
          ctx,
          {
            variableValues: {
              changeOrderId: changeOrder.id
            }
          } as any
        );
      } catch (e) {
        error = e;
        Test.Check.error(e, actionBlockedError);
      } finally {
        assert(error !== null, 'Must be error.');
      }
    });

    it('failed for track time', async () => {
      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'trackTimeId'
          },
          ctx,
          {
            variableValues: {
              trackTimeId: contract.trackTime.id
            }
          } as any
        );
      } catch (e) {
        error = e;
        Test.Check.error(e, actionBlockedError);
      } finally {
        assert(error !== null, 'Must be error.');
      }
    });

    it('failed for phase', async () => {
      const phase = _.find(contract.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'phaseId'
          },
          ctx,
          {
            variableValues: {
              phaseId: phase.id
            }
          } as any
        );
      } catch (e) {
        error = e;
        Test.Check.error(e, actionBlockedError);
      } finally {
        assert(error !== null, 'Must be error.');
      }
    });

    it('failed for task', async () => {
      const phase = _.find(contract.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.First });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'taskId'
          },
          ctx,
          {
            variableValues: {
              taskId: task.id
            }
          } as any
        );
      } catch (e) {
        error = e;
        Test.Check.error(e, actionBlockedError);
      } finally {
        assert(error !== null, 'Must be error.');
      }
    });

    it('failed for decision', async () => {
      const phase = _.find(contract.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.First });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'decisionId'
          },
          ctx,
          {
            variableValues: {
              decisionId: task.decision.id
            }
          } as any
        );
      } catch (e) {
        error = e;
        Test.Check.error(e, actionBlockedError);
      } finally {
        assert(error !== null, 'Must be error.');
      }
    });

    it('failed for payment', async () => {
      const phase = _.find(contract.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.First });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'paymentId'
          },
          ctx,
          {
            variableValues: {
              paymentId: task.payment.id
            }
          } as any
        );
      } catch (e) {
        error = e;
        Test.Check.error(e, actionBlockedError);
      } finally {
        assert(error !== null, 'Must be error.');
      }
    });

    it('failed for schedule', async () => {
      const phase = _.find(contract.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.First });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'scheduleId'
          },
          ctx,
          {
            variableValues: {
              scheduleId: task.schedule.id
            }
          } as any
        );
      } catch (e) {
        error = e;
        Test.Check.error(e, actionBlockedError);
      } finally {
        assert(error !== null, 'Must be error.');
      }
    });

    it('failed for work log', async () => {
      const phase = _.find(contract.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.First });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'workLogId'
          },
          ctx,
          {
            variableValues: {
              workLogId: task.workLog.id
            }
          } as any
        );
      } catch (e) {
        error = e;
        Test.Check.error(e, actionBlockedError);
      } finally {
        assert(error !== null, 'Must be error.');
      }
    });

    it('failed for TaskReminder', async () => {
      const phase = _.find(contract.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.First });
      if (!task) throw GraphQLError.notFound('task');

      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'taskReminderId'
          },
          ctx,
          {
            variableValues: {
              taskReminderId: task.taskReminder.id
            }
          } as any
        );
      } catch (e) {
        error = e;
        Test.Check.error(e, actionBlockedError);
      } finally {
        assert(error !== null, 'Must be error.');
      }
    });

    it('invalid variable name', async () => {
      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'subscriptionId'
          },
          ctx,
          {
            variableValues: {
              subscriptionId: contract.partnerId
            }
          } as any
        );
      } catch (e) {
        error = e;
        Test.Check.error(e, new GraphQLError(`Invalid variable name`));
      } finally {
        assert(error !== null, 'Must be error.');
      }
    });

    it('contract not found', async () => {
      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: 'contractId'
          },
          ctx,
          {
            variableValues: {
              contractId: contract.partnerId
            }
          } as any
        );
      } catch (e) {
        error = e;
        Test.Check.error(e, GraphQLError.notFound('contract'));
      } finally {
        assert(error !== null, 'Must be error.');
      }
    });

    it('value by path not exist', async () => {
      const path = 'subscriptionId';

      let error = null;
      try {
        const ctx = {
          sql,
          events: []
        } as any;

        await contractPaid(
          async () => {},
          {},
          {
            path: path
          },
          ctx,
          {
            variableValues: {
              partnerId: contract.partnerId
            }
          } as any
        );
      } catch (e) {
        error = e;
        Test.Check.error(e, new GraphQLError(`Value by path: "${path}" is empty`));
      } finally {
        assert(error !== null, 'Must be error.');
      }
    });
  });
});
