/*external modules*/
import * as argon2 from 'argon2';
import _ from 'lodash';
import assert from 'assert';
/*DB*/
import { getTaskTotal } from '../../../../../db/dataUtils/getTaskTotal';
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Contract as ContractDB, ContractPermissionResult } from '../../../../../db/types/contract';
import { Task as TaskDB, TaskStatus } from '../../../../../db/types/task';
import { ChangeOrderReason, ChangeOrderStatus } from '../../../../../db/types/changeOrder';
import { PaymentOperation, PaymentOperationStatus } from '../../../../../db/types/paymentOperation';
import { Decision, DecisionSelectionType } from '../../../../../db/types/decision';
import { Phase } from '../../../../../db/types/phase';
import { PaymentHistory, PaymentHistoryAction, PaymentHistoryType } from '../../../../../db/types/paymentHistory';
import { ContractActivity, ContractActivityType } from '../../../../../db/types/contractActivity';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { PaymentHistoryModel } from '../../../../../db/models/PaymentHistoryModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { ContractActivityView } from '../../../../../gql/resolvers/Types/Contract/Activity/ContractActivityView';
import { Task } from '../../../../../gql/resolvers/Types/Task/Task';
import { Payment } from '../../../../../gql/resolvers/Payment';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { seenContractActivity: Array<ContractActivityView> };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Other = 'other@test.com'
}

const enum ContractName {
  SeenContractActivity = 'SeenContractActivity'
}

const enum PhaseName {
  First = 'FIRST',
  Second = 'SECOND'
}
const enum TaskName {
  First = 'FIRST',
  Second = 'SECOND'
}
const enum DecisionName {
  First = 'FIRST',
  Second = 'SECOND'
}

type PopulatedPayment = Payment & { charge: PaymentOperation; payout?: PaymentOperation };
type PopulatedTask = Task & {
  payment: PopulatedPayment;
  decision: Decision;
};
type PopulatedPhase = Phase & { tasks: Array<PopulatedTask> };

interface OutputData {
  users: Test.TUser[];
  contract: ContractDB;
  phases: Array<PopulatedPhase>;
  changeOrders: Array<Test.TChangeOrder>;
  paymentHistories: Array<PaymentHistory>;
  contractActivities: Array<ContractActivity>;
}

const requiredFieldSet: Test.TFieldSet<ContractActivityView> = {
  object: ['role']
};

const SEEN_CONTRACT_ACTIVITY_MUTATION = `mutation($input: SeenContractActivityInput!) {
  seenContractActivity(input: $input) {
    role {
      id
    }

    paymentHistory {
      id
      action
      type

      actionedBy {
        id
      }
      pro {
        id
      }
      payment {
        id
      }
    }
    contractActivity {
      id
      type
      data
      changeOrderId
      decisionId
      taskId
    }
  }
}`;

describe('gql/resolvers/Mutation/contracts/seenActivity', () => {
  let outputData: OutputData;

  const inputData = {
    users: [
      {
        email: Email.Home,
        password: Email.Home,
        role: {
          name: UserRole.HomeOwner
        }
      },
      {
        email: Email.Pro,
        password: Email.Pro,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.Other,
        password: Email.Other,
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
    contract: {
      name: ContractName.SeenContractActivity,
      phases: [
        {
          name: PhaseName.First,
          order: 0,
          tasks: [
            {
              $contractActivities: [
                {
                  type: ContractActivityType.TaskNew,
                  creator: Email.Pro
                }
              ],
              name: TaskName.First,
              materialCost: 100,
              laborCost: 100,
              otherCost: 100,
              markupPercent: 20,
              order: 500,
              status: TaskStatus.Done,
              payment: {
                $paymentHistory: [PaymentHistoryAction.PayoutRequested],
                charge: {
                  availableAt: new Date(),
                  status: PaymentOperationStatus.Succeeded
                }
              },
              decisions: [
                {
                  $createdBy: Email.Pro,
                  $makers: [Email.Home],
                  $contractActivities: [
                    {
                      type: ContractActivityType.TaskDecisionNew,
                      creator: Email.Pro
                    },
                    {
                      type: ContractActivityType.TaskDecisionSubmit,
                      creator: Email.Pro
                    },
                    {
                      type: ContractActivityType.TaskDecisionMake,
                      creator: Email.Home
                    }
                  ],
                  title: DecisionName.First,
                  dueDate: new Date(),
                  notes: '<test>',
                  selectionType: DecisionSelectionType.Single,
                  options: [
                    {
                      $createdBy: Email.Pro,
                      option: '>test<',
                      cost: 1
                    }
                  ]
                }
              ]
            },
            {
              $contractActivities: [
                {
                  type: ContractActivityType.TaskNew,
                  creator: Email.Pro
                },
                {
                  type: ContractActivityType.TaskEdited,
                  creator: Email.Pro
                }
              ],
              name: TaskName.Second,
              materialCost: 150,
              laborCost: 600,
              otherCost: 800,
              markupPercent: 30,
              order: 500,
              status: TaskStatus.Done,
              payment: {
                $paymentHistory: [PaymentHistoryAction.PayoutRequested, PaymentHistoryAction.PayoutApproved],
                payoutRequestedAt: new Date(),
                charge: {
                  availableAt: new Date(),
                  status: PaymentOperationStatus.Failed
                },
                payout: {
                  availableAt: new Date(),
                  status: PaymentOperationStatus.Failed
                }
              },
              decisions: [
                {
                  $createdBy: Email.Pro,
                  $makers: [Email.Home],
                  $contractActivities: [
                    {
                      type: ContractActivityType.TaskDecisionNew,
                      creator: Email.Pro
                    },
                    {
                      type: ContractActivityType.TaskDecisionSubmit,
                      creator: Email.Pro
                    }
                  ],
                  title: DecisionName.Second,
                  dueDate: new Date(),
                  notes: '<test>',
                  selectionType: DecisionSelectionType.Single,
                  options: [
                    {
                      $createdBy: Email.Pro,
                      option: '>test<',
                      cost: 1
                    }
                  ]
                }
              ]
            }
          ]
        }
      ],
      changeOrders: [
        {
          $users: [Email.Home],
          $contractActivities: [
            {
              type: ContractActivityType.ChangeOrderNew,
              creator: Email.Pro
            },
            {
              type: ContractActivityType.ChangeOrderEdited,
              creator: Email.Pro
            },
            {
              type: ContractActivityType.ChangeOrderApproved,
              creator: Email.Home
            }
          ],
          status: ChangeOrderStatus.Approved,
          reason: ChangeOrderReason.Upgrade,
          approvedAt: new Date()
        }
      ]
    }
  };

  before(async () => {
    const ctx = { sql, events: [] };
    outputData = await getClientTransaction(async client => {
      const users = await Promise.all(
        _.map(inputData.users, async userData => {
          const userGenerate = new Test.UserGenerate(client, ctx);

          await userGenerate.create({
            email: userData.email,
            password: await argon2.hash(userData.password)
          });
          await userGenerate.setRole({
            name: userData.role.name
          });

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
        name: ContractName.SeenContractActivity
      });
      if (!contract) throw GraphQLError.notFound('contract');

      const contractActivityGenerate = new Test.ContractActivityGenerate(client, ctx);
      const paymentHistoryGenerate = new Test.PaymentHistoryGenerate(client, ctx);

      const changeOrders = _.flatten(
        await Promise.all(
          _.map(inputData.contract.changeOrders, async changeOrderInput => {
            return Promise.all(
              _.map(changeOrderInput.$users, async userEmail => {
                const user = _.find(users, { email: userEmail });
                if (!user) throw GraphQLError.notFound('user by email');

                const changeOrderGenerate = new Test.ChangeOrderGenerate(client, ctx);
                await changeOrderGenerate.create({
                  contractId: contract.id,
                  requesterId: user.lastRoleId,
                  ..._.omit(changeOrderInput, ['$users'])
                });

                const changeOrder = changeOrderGenerate.changeOrder!;

                await Promise.all(
                  _.map(changeOrderInput.$contractActivities ?? [], async contractActivityInput => {
                    const creator = _.find(users, { email: contractActivityInput.creator });
                    if (!creator) throw GraphQLError.notFound('creator');

                    await contractActivityGenerate.add({
                      type: contractActivityInput.type,
                      data: {},
                      contractId: contract.id,
                      roleId: creator.lastRoleId,
                      changeOrderId: changeOrder.id
                    });
                  })
                );

                return changeOrder;
              })
            );
          })
        )
      );

      const phases = await Promise.all(
        _.map(inputData.contract.phases, async phaseInput => {
          const phaseGenerate = new Test.PhaseGenerate(client, ctx);
          await phaseGenerate.create({
            contractId: contract.id,
            ...phaseInput
          });

          await Promise.all(
            _.map(phaseInput.tasks, async taskInput => {
              await phaseGenerate.addTask({
                creatorId: proUser.lastRoleId,
                ...(taskInput as any)
              });

              const phase = phaseGenerate.phase!;
              let task: TaskDB = _.last(phase.tasks)!;

              if (_.get(taskInput, 'payment')) {
                const paymentInput = taskInput.payment;
                const paymentActivities = paymentInput.$paymentHistory ?? [];

                const paymentGenerate = new Test.PaymentGenerate(client, ctx);
                await paymentGenerate.createCharge({
                  amount: getTaskTotal(task),
                  stripeId: 'px_' + _.get(task, 'name'),
                  ...paymentInput.charge
                });
                await paymentGenerate.createPayment(_.get(taskInput, 'payment') as any);

                if (_.findIndex(paymentActivities, act => act === PaymentHistoryAction.PayoutRequested) > -1) {
                  await paymentHistoryGenerate.add({
                    action: PaymentHistoryAction.PayoutRequested,
                    type: PaymentHistoryType.User,
                    proRoleId: proUser.lastRoleId,
                    actionedByRoleId: proUser.lastRoleId,
                    phaseId: phase.id,
                    paymentId: paymentGenerate.payment?.id
                  });
                }

                if ('payout' in taskInput.payment) {
                  await paymentGenerate.createPayout({
                    amount: getTaskTotal(task),
                    stripeId: 'px_FF' + _.get(task, 'name'),
                    ...paymentInput.payout
                  });

                  if (_.findIndex(paymentActivities, act => act === PaymentHistoryAction.PayoutApproved) > -1) {
                    await paymentHistoryGenerate.add({
                      action: PaymentHistoryAction.PayoutApproved,
                      type: PaymentHistoryType.User,
                      proRoleId: proUser.lastRoleId,
                      actionedByRoleId: homeUser.lastRoleId,
                      phaseId: phase.id,
                      paymentId: paymentGenerate.payment?.id
                    });
                  }
                }

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

              if (!_.isEmpty(taskInput.decisions)) {
                await Promise.all(
                  _.map(taskInput.decisions, async decisionInput => {
                    const createdByUser = _.find(users, { email: decisionInput.$createdBy });
                    if (!createdByUser) throw GraphQLError.notFound('created by user');

                    const decisionGenerate = new Test.DecisionGenerate(client, ctx);
                    await decisionGenerate.create({
                      taskId: task.id,
                      createdById: createdByUser.lastRoleId,
                      ..._.omit(decisionInput, ['$createdBy', '$makers', 'options'])
                    });

                    await Promise.all(
                      _.map(decisionInput.options, async decisionOptionInput => {
                        const createdByUser = _.find(users, { email: decisionOptionInput.$createdBy });
                        if (!createdByUser) throw GraphQLError.notFound('created by user');

                        await decisionGenerate.addOption({
                          createdById: _.get(decisionOptionInput, 'lastRoleId'),
                          ..._.omit(decisionOptionInput, ['$createdBy'])
                        });
                      })
                    );

                    await Promise.all(
                      _.map(decisionInput.$makers, async decisionMakerEmail => {
                        const decisionMaker = _.find(users, { email: decisionMakerEmail });
                        if (!decisionMaker) throw GraphQLError.notFound('decision maker');

                        await decisionGenerate.addMakers({
                          makerIds: [_.get(decisionMaker, 'lastRoleId')]
                        });
                      })
                    );

                    const decision = decisionGenerate.decision!;
                    if (_.get(task, 'decisions')) {
                      _.get(task, 'decisions').push(decision);
                    } else {
                      _.set(task, 'decisions', [decision]);
                    }

                    await Promise.all(
                      _.map(decisionInput.$contractActivities ?? [], async contractActivityInput => {
                        const creator = _.find(users, { email: contractActivityInput.creator });
                        if (!creator) throw GraphQLError.notFound('creator');

                        await contractActivityGenerate.add({
                          type: contractActivityInput.type,
                          data: {},
                          contractId: contract.id,
                          roleId: creator.lastRoleId,
                          decisionId: decision.id
                        });
                      })
                    );
                  })
                );
              }

              await Promise.all(
                _.map(taskInput.$contractActivities ?? [], async contractActivityInput => {
                  const creator = _.find(users, { email: contractActivityInput.creator });
                  if (!creator) throw GraphQLError.notFound('creator');

                  await contractActivityGenerate.add({
                    type: contractActivityInput.type,
                    data: {},
                    contractId: contract.id,
                    roleId: creator.lastRoleId,
                    taskId: task.id
                  });
                })
              );
            })
          );

          const phase = phaseGenerate.phase!;
          if (_.isEmpty(phase.tasks)) throw GraphQLError.notFound('tasks');

          return phase as TArray.SingleType<OutputData['phases']>;
        })
      );

      const paymentHistories = paymentHistoryGenerate.paymentHistories!;
      const contractActivities = contractActivityGenerate.contractActivities!;

      return {
        users,
        contract,
        phases,
        changeOrders,
        paymentHistories,
        contractActivities
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      await Promise.all(
        _.map(outputData.paymentHistories, history =>
          PaymentHistoryModel.remove.exec(
            client,
            {
              paymentHistoryId: history.id
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

  describe('task', () => {
    // success
    it('should allow to pro user seen task contract activity', async () => {
      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('user');

      const phase = _.find(outputData.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.Second });
      if (!task) throw GraphQLError.notFound('task');

      const { data, errors } = await execQuery<TQuery>(
        SEEN_CONTRACT_ACTIVITY_MUTATION,
        {
          input: {
            taskId: task.id
          }
        },
        proUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.seenContractActivity;
      if (!result) throw GraphQLError.notFound('data');

      assert.ok(_.isEmpty(result), 'Mutation result must be empty because we pro user creator of task activity');
    });

    it('should allow to seen task contract activity', async () => {
      const homeUser = _.find(outputData.users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('user');

      const phase = _.find(outputData.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.Second });
      if (!task) throw GraphQLError.notFound('task');

      const taskInput = inputData.contract.phases
        .find(p => p.name === PhaseName.First)
        ?.tasks.find(t => t.name === TaskName.Second);
      if (!taskInput) throw GraphQLError.notFound('task input');

      let contractActivities = _.map(
        _.filter(
          taskInput.$contractActivities,
          contractActivityInput => contractActivityInput.creator !== homeUser.email
        ),
        'type'
      );

      const { data, errors } = await execQuery<TQuery>(
        SEEN_CONTRACT_ACTIVITY_MUTATION,
        {
          input: {
            taskId: task.id
          }
        },
        homeUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.seenContractActivity;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        contractActivityView => {
          const contractActivity = contractActivityView.contractActivity!;

          assert.ok(contractActivity.taskId === task.id, 'invalid task');
          contractActivities = contractActivities.filter(type => type === contractActivity.type);

          return {};
        },
        requiredFieldSet
      );

      assert.ok(_.isEmpty(contractActivities), 'not all contract activities has been watched');
    });

    it('should allow to seen already seened task contract activity', async () => {
      const homeUser = _.find(outputData.users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('user');

      const phase = _.find(outputData.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.Second });
      if (!task) throw GraphQLError.notFound('task');

      const { data, errors } = await execQuery<TQuery>(
        SEEN_CONTRACT_ACTIVITY_MUTATION,
        {
          input: {
            taskId: task.id
          }
        },
        homeUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.seenContractActivity;
      if (!result) throw GraphQLError.notFound('data');

      assert.ok(
        _.isEmpty(result),
        'Mutation result must be empty because we already seen all task contract activities'
      );
    });

    // error
    it("other user haven't contract access", async () => {
      const otherUser = _.find(outputData.users, { email: Email.Other });
      if (!otherUser) throw GraphQLError.notFound('user');

      const phase = _.find(outputData.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.First });
      if (!task) throw GraphQLError.notFound('task');

      const { errors } = await execQuery<TQuery>(
        SEEN_CONTRACT_ACTIVITY_MUTATION,
        {
          input: {
            taskId: task.id
          }
        },
        otherUser
      );

      Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
    });

    it('task order not found', async () => {
      const otherUser = _.find(outputData.users, { email: Email.Other });
      if (!otherUser) throw GraphQLError.notFound('user');

      const { errors } = await execQuery<TQuery>(
        SEEN_CONTRACT_ACTIVITY_MUTATION,
        {
          input: {
            taskId: otherUser.id
          }
        },
        otherUser
      );

      Test.Check.error(errors, GraphQLError.notFound('task'));
    });
  });

  describe('decisions', () => {
    // success
    it('should allow to pro user seen decisions contract activities', async () => {
      const homeUser = _.find(outputData.users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('user');

      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('user');

      const phase = _.find(outputData.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.First });
      if (!task) throw GraphQLError.notFound('task');

      const decision = _.find(task.decisions, { title: DecisionName.First });
      if (!decision) throw GraphQLError.notFound('decision');

      const { data, errors } = await execQuery<TQuery>(
        SEEN_CONTRACT_ACTIVITY_MUTATION,
        {
          input: {
            decisions: [decision.id]
          }
        },
        proUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.seenContractActivity;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          contractActivity: {
            type: ContractActivityType.TaskDecisionMake,
            decisionId: decision.id
          }
        },
        requiredFieldSet
      );
    });

    it('should allow to home user seen decisions contract activities', async () => {
      const homeUser = _.find(outputData.users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('user');

      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('user');

      const phase = _.find(outputData.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.Second });
      if (!task) throw GraphQLError.notFound('task');

      const decision = _.find(task.decisions, { title: DecisionName.Second });
      if (!decision) throw GraphQLError.notFound('decision');

      const { data, errors } = await execQuery<TQuery>(
        SEEN_CONTRACT_ACTIVITY_MUTATION,
        {
          input: {
            decisions: [decision.id]
          }
        },
        homeUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.seenContractActivity;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          contractActivity: {
            type: ContractActivityType.TaskDecisionSubmit,
            decisionId: decision.id
          }
        },
        requiredFieldSet
      );
    });

    // error
    it("other user haven't contract access", async () => {
      const otherUser = _.find(outputData.users, { email: Email.Other });
      if (!otherUser) throw GraphQLError.notFound('user');

      const phase = _.find(outputData.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.First });
      if (!task) throw GraphQLError.notFound('task');

      const decision = _.first(task.decisions);
      if (!decision) throw GraphQLError.notFound('decision');

      const { errors } = await execQuery<TQuery>(
        SEEN_CONTRACT_ACTIVITY_MUTATION,
        {
          input: {
            decisions: [decision.id]
          }
        },
        otherUser
      );

      Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
    });

    it('decision not found', async () => {
      const otherUser = _.find(outputData.users, { email: Email.Other });
      if (!otherUser) throw GraphQLError.notFound('user');

      const { errors } = await execQuery<TQuery>(
        SEEN_CONTRACT_ACTIVITY_MUTATION,
        {
          input: {
            decisions: [otherUser.id]
          }
        },
        otherUser
      );

      Test.Check.error(errors, GraphQLError.notFound('decisions'));
    });
  });

  describe('payments', () => {
    // success
    it('should allow to pro user seen payment history', async () => {
      const homeUser = _.find(outputData.users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('user');

      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('user');

      const phase = _.find(outputData.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.Second });
      if (!task) throw GraphQLError.notFound('task');

      const payment = task.payment;
      if (!payment) throw GraphQLError.notFound('payment');

      const { data, errors } = await execQuery<TQuery>(
        SEEN_CONTRACT_ACTIVITY_MUTATION,
        {
          input: {
            payments: [payment.id]
          }
        },
        proUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.seenContractActivity;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          paymentHistory: {
            action: PaymentHistoryAction.PayoutApproved,
            type: PaymentHistoryType.User,
            actionedBy: {
              id: homeUser.lastRoleId
            },
            pro: {
              id: proUser.lastRoleId
            },
            payment: {
              id: payment.id
            }
          }
        },
        requiredFieldSet
      );
    });

    it('should allow to home user seen payment history', async () => {
      const homeUser = _.find(outputData.users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('user');

      const proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('user');

      const phase = _.find(outputData.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.First });
      if (!task) throw GraphQLError.notFound('task');

      const payment = task.payment;
      if (!payment) throw GraphQLError.notFound('payment');

      const { data, errors } = await execQuery<TQuery>(
        SEEN_CONTRACT_ACTIVITY_MUTATION,
        {
          input: {
            payments: [payment.id]
          }
        },
        homeUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.seenContractActivity;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          paymentHistory: {
            action: PaymentHistoryAction.PayoutRequested,
            type: PaymentHistoryType.User,
            actionedBy: {
              id: proUser.lastRoleId
            },
            pro: {
              id: proUser.lastRoleId
            },
            payment: {
              id: payment.id
            }
          }
        },
        requiredFieldSet
      );
    });

    // error
    it("other user haven't contract access", async () => {
      const otherUser = _.find(outputData.users, { email: Email.Other });
      if (!otherUser) throw GraphQLError.notFound('user');

      const phase = _.find(outputData.phases, { name: PhaseName.First });
      if (!phase) throw GraphQLError.notFound('phase');

      const task = _.find(phase.tasks, { name: TaskName.First });
      if (!task) throw GraphQLError.notFound('task');

      const payment = task.payment;
      if (!payment) throw GraphQLError.notFound('payment');

      const { errors } = await execQuery<TQuery>(
        SEEN_CONTRACT_ACTIVITY_MUTATION,
        {
          input: {
            payments: [payment.id]
          }
        },
        otherUser
      );

      Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
    });

    it('payment not found', async () => {
      const otherUser = _.find(outputData.users, { email: Email.Other });
      if (!otherUser) throw GraphQLError.notFound('user');

      const { errors } = await execQuery<TQuery>(
        SEEN_CONTRACT_ACTIVITY_MUTATION,
        {
          input: {
            payments: [otherUser.id]
          }
        },
        otherUser
      );

      Test.Check.error(errors, GraphQLError.notFound('payments'));
    });
  });

  describe('change-orders', () => {
    // success
    it('should allow to seen change order contract activity', async () => {
      const homeUser = _.find(outputData.users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('user');

      const approvedChangeOrder = _.find(outputData.changeOrders, { status: ChangeOrderStatus.Approved });
      if (!approvedChangeOrder) throw GraphQLError.notFound('change order');

      const approvedChangeOrderInput = _.find(inputData.contract.changeOrders, { status: ChangeOrderStatus.Approved });
      if (!approvedChangeOrderInput) throw GraphQLError.notFound('change order');

      let contractActivities = _.map(
        _.filter(
          approvedChangeOrderInput.$contractActivities,
          contractActivityInput => contractActivityInput.creator !== homeUser.email
        ),
        'type'
      );

      const { data, errors } = await execQuery<TQuery>(
        SEEN_CONTRACT_ACTIVITY_MUTATION,
        {
          input: {
            changeOrders: [approvedChangeOrder.id]
          }
        },
        homeUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.seenContractActivity;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        contractActivityView => {
          const contractActivity = contractActivityView.contractActivity!;

          assert.ok(contractActivity.changeOrderId === approvedChangeOrder.id, 'invalid CO');
          contractActivities = contractActivities.filter(type => type === contractActivity.type);

          return {};
        },
        requiredFieldSet
      );

      assert.ok(_.isEmpty(contractActivities), 'not all contract activities has been watched');
    });

    it('should allow to seen already seened CO contract activity', async () => {
      const homeUser = _.find(outputData.users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('user');

      const approvedChangeOrder = _.find(outputData.changeOrders, { status: ChangeOrderStatus.Approved });
      if (!approvedChangeOrder) throw GraphQLError.notFound('change order');

      const { data, errors } = await execQuery<TQuery>(
        SEEN_CONTRACT_ACTIVITY_MUTATION,
        {
          input: {
            changeOrders: [approvedChangeOrder.id]
          }
        },
        homeUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.seenContractActivity;
      if (!result) throw GraphQLError.notFound('data');

      assert.ok(_.isEmpty(result), 'Mutation result must be empty because we already seen all CO contract activities');
    });

    // error
    it("other user haven't contract access", async () => {
      const otherUser = _.find(outputData.users, { email: Email.Other });
      if (!otherUser) throw GraphQLError.notFound('user');

      const changeOrder = _.first(outputData.changeOrders);
      if (!changeOrder) throw GraphQLError.notFound('change order');

      const { errors } = await execQuery<TQuery>(
        SEEN_CONTRACT_ACTIVITY_MUTATION,
        {
          input: {
            changeOrders: [changeOrder.id]
          }
        },
        otherUser
      );

      Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
    });

    it('change order not found', async () => {
      const otherUser = _.find(outputData.users, { email: Email.Other });
      if (!otherUser) throw GraphQLError.notFound('user');

      const { errors } = await execQuery<TQuery>(
        SEEN_CONTRACT_ACTIVITY_MUTATION,
        {
          input: {
            changeOrders: [otherUser.id]
          }
        },
        otherUser
      );

      Test.Check.error(errors, GraphQLError.notFound('Change Orders'));
    });
  });

  it('several entities at once', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      SEEN_CONTRACT_ACTIVITY_MUTATION,
      {
        input: {
          changeOrders: [otherUser.id],
          payments: [],
          decisions: []
        }
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(`Too many arguments`));
  });

  it('data no provided', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      SEEN_CONTRACT_ACTIVITY_MUTATION,
      {
        input: {
          changeOrders: [],
          payments: [],
          decisions: []
        }
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(`No provided data to update`));
  });
});
