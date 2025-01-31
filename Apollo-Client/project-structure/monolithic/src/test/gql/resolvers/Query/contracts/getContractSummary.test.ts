/*external modules*/
import _ from 'lodash';
import async from 'async';
import moment from 'moment';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { PaymentOperation, PaymentOperationStatus } from '../../../../../db/types/paymentOperation';
import { TaskStatus } from '../../../../../db/types/task';
import { Contract, ContractPermissionResult } from '../../../../../db/types/contract';
import { ChangeOrder, ChangeOrderReason, ChangeOrderStatus } from '../../../../../db/types/changeOrder';
import { Phase } from '../../../../../db/types/phase';
import { getTaskTotal } from '../../../../../db/dataUtils/getTaskTotal';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../../index';
import { GraphQLError } from '../../../../../gql';
import { Payment } from '../../../../../gql/resolvers/Payment';
import { ContractSummary } from '../../../../../gql/resolvers/Types/Contract/ContractSummary';
import { Task } from '../../../../../gql/resolvers/Types/Task/Task';
import { PhasePaymentStatus } from '../../../../../gql/resolvers/PhasePaymentStatus';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { getContractSummary: ContractSummary };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  Summary = 'Summary'
}

type PopulatedPhase = Phase & {
  tasks: Array<Task & { payment: Payment & { charge: PaymentOperation; payout?: PaymentOperation } }>;
};

interface OutputData {
  users: Test.TUser[];
  contract: Contract;
  phases: PopulatedPhase[];
  changeOrders: ChangeOrder[];
}

const requiredFieldSet: Test.TFieldSet<ContractSummary> = {
  scalar: [
    'total',
    'openChangeOrders',
    'approvedChangeOrders',
    'targetEndDate',
    'targetStartDate',
    'initialEndDate',
    'createdAt'
  ],
  object: ['owner', 'partner'],
  array: ['phases']
};

const GET_CONTRACT_SUMMARY_QUERY = `query ($contractId: ID!) {
  getContractSummary(contractId: $contractId) {
    total
    openChangeOrders
    approvedChangeOrders
    targetEndDate
    targetStartDate
    initialEndDate
    createdAt

    owner {
      id
    }
    partner {
      id
    }

    phases {
      id
      name
      total
      paymentStatus
      totalTodo
      totalDoing
      totalDone

      tasks {
        id
        name
        status
        total
        paymentStatus
      }
    }
  }
}`;

describe('gql/resolvers/Query/getContractSummary', () => {
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
      }
    ],
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.Summary,
      phases: [
        {
          name: 'test 1',
          order: 1000,
          tasks: [
            {
              name: 'task 1',
              materialCost: 100,
              laborCost: 100,
              otherCost: 10,
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
          name: 'test 2',
          order: 250,
          tasks: [
            {
              name: 'task 1',
              materialCost: 100,
              laborCost: 100,
              otherCost: 100,
              markupPercent: 20,
              order: 50,
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
      ],
      changeOrders: [
        {
          status: ChangeOrderStatus.Open,
          reason: ChangeOrderReason.Descope,
          approvedAt: new Date()
        },
        {
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
            email: userData.email
          });
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
        name: ContractName.Summary
      });
      if (!contract) throw GraphQLError.notFound('contract');

      const changeOrders: ChangeOrder[] = await async.map(inputData.contract.changeOrders, async inputCO => {
        const changeOrderGenerate = new Test.ChangeOrderGenerate(client, ctx);
        await changeOrderGenerate.create({
          contractId: contract.id,
          requesterId: homeUser.lastRoleId,
          ...inputCO
        });

        return changeOrderGenerate.changeOrder!;
      });

      const phases: OutputData['phases'] = await async.map(inputData.contract.phases, async phaseInput => {
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

          let task = _.last(phaseGenerate.phase?.tasks)!;

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
        });

        const phase = phaseGenerate.phase!;
        if (_.isEmpty(phase.tasks)) throw GraphQLError.notFound('tasks');

        return phase;
      });

      return {
        users,
        contract,
        phases,
        changeOrders
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
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
  it(`should allow other user to getUserRequiredActions`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const proUser = _.find(outputData.users, { email: Email.Pro });

    const { data, errors } = await execQuery<TQuery>(
      GET_CONTRACT_SUMMARY_QUERY,
      {
        contractId: _.get(outputData, ['contract', 'id'])
      },
      homeUser
    );

    Test.Check.noErrors(errors);

    const result = data?.getContractSummary;
    if (!result) throw GraphQLError.notFound('data');

    const openChangeOrders = _.filter(outputData.changeOrders, { status: ChangeOrderStatus.Open }).length;
    const approvedChangeOrders = _.filter(outputData.changeOrders, { status: ChangeOrderStatus.Approved }).length;

    const total = _.chain(outputData.phases)
      .flatMap(phase => _.map(phase.tasks, task => getTaskTotal(task)))
      .reduce((acc, taskTotal) => acc + taskTotal, 0)
      .value();

    const targetStartDate = _.chain(outputData.phases)
      .flatMap(phase => phase.tasks)
      .sort((prev, next) => {
        const prevDate = moment(prev.startDate).valueOf();
        const nextDate = moment(next.startDate).valueOf();

        return prevDate - nextDate;
      })
      .first()
      .get('startDate')
      .value();

    const targetEndDate = _.chain(outputData.phases)
      .flatMap(phase => phase.tasks)
      .sort((prev, next) => {
        const prevDate = moment(prev.endDate).valueOf();
        const nextDate = moment(next.endDate).valueOf();

        return prevDate - nextDate;
      })
      .first()
      .get('endDate')
      .value();

    Test.Check.data(
      result,
      {
        total,
        openChangeOrders,
        approvedChangeOrders,
        targetStartDate: {
          $check: '==',
          $value: targetStartDate,
          $func: date => moment(date).format('YYYY.MM.DD HH:mm')
        },
        targetEndDate: {
          $check: '==',
          $value: targetEndDate,
          $func: date => moment(date).format('YYYY.MM.DD HH:mm')
        },
        // initialEndDate equal targetEndDate if not TaskVersions
        initialEndDate: {
          $check: '==',
          $value: targetEndDate,
          $func: date => moment(date).format('YYYY.MM.DD HH:mm')
        },
        owner: {
          id: _.get(homeUser, 'lastRoleId')
        },
        partner: {
          id: _.get(proUser, 'lastRoleId')
        }
      },
      requiredFieldSet
    );

    Test.Check.data(result.phases, phase => {
      const foundedPhase = _.find(outputData.phases, { id: phase.id });
      if (!foundedPhase) throw GraphQLError.notFound('phase');

      const totalTodo = _.filter(foundedPhase.tasks, task => task.status === TaskStatus.Todo).length;
      const totalDoing = _.filter(foundedPhase.tasks, task => task.status === TaskStatus.Doing).length;
      const totalDone = _.filter(foundedPhase.tasks, task => task.status === TaskStatus.Done).length;

      const total = _.reduce(foundedPhase.tasks, (acc, task) => acc + getTaskTotal(task), 0);

      const tasksPaymentStatus = _.chain(foundedPhase.tasks)
        .map(task => {
          let paymentStatus = PhasePaymentStatus.None;
          if (task.payment?.payout) {
            paymentStatus = PhasePaymentStatus.Released;
          } else if (task.payment?.payoutRequestedAt) {
            paymentStatus = PhasePaymentStatus.Requested;
          } else if (task.payment) {
            paymentStatus = PhasePaymentStatus.Funded;
          }

          return paymentStatus;
        })
        .uniq()
        .value();

      let paymentStatus = PhasePaymentStatus.None;
      if (_.every(tasksPaymentStatus, status => status === PhasePaymentStatus.Released)) {
        paymentStatus = PhasePaymentStatus.Released;
      } else if (_.every(tasksPaymentStatus, status => status === PhasePaymentStatus.Requested)) {
        paymentStatus = PhasePaymentStatus.Requested;
      } else if (_.every(tasksPaymentStatus, status => status === PhasePaymentStatus.Funded)) {
        paymentStatus = PhasePaymentStatus.Funded;
      }

      Test.Check.data(phase.tasks, task => {
        const foundedTask = _.find(foundedPhase.tasks, { id: task.id });
        if (!foundedTask) throw GraphQLError.notFound('task');

        const total = getTaskTotal(foundedTask);

        let paymentStatus = PhasePaymentStatus.None;
        if (foundedTask.payment?.payout) {
          paymentStatus = PhasePaymentStatus.Released;
        } else if (foundedTask.payment?.payoutRequestedAt) {
          paymentStatus = PhasePaymentStatus.Requested;
        } else if (foundedTask.payment) {
          paymentStatus = PhasePaymentStatus.Funded;
        }

        return {
          total,
          paymentStatus,
          ..._.pick(foundedTask, ['name', 'status'])
        };
      });

      return {
        total,
        paymentStatus,
        totalTodo,
        totalDoing,
        totalDone,
        ..._.pick(foundedPhase, ['name'])
      };
    });
  });

  // error
  it("other user have't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });

    const { errors } = await execQuery<TQuery>(
      GET_CONTRACT_SUMMARY_QUERY,
      {
        contractId: _.get(outputData, ['contract', 'id'])
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it(`contract not found`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const { errors } = await execQuery<TQuery>(
      GET_CONTRACT_SUMMARY_QUERY,
      {
        contractId: _.get(homeUser, 'id')
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('contract'));
  });
});
