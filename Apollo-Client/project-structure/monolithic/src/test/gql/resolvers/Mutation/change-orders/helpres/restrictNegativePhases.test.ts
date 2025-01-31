/*external modules*/
import _ from 'lodash';
import async from 'async';
import assert from 'assert';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../../db';
import { UserRole } from '../../../../../../db/types/role';
import { Payment } from '../../../../../../gql/resolvers/Payment';
import { PaymentOperation, PaymentOperationStatus } from '../../../../../../db/types/paymentOperation';
import { TaskStatus } from '../../../../../../db/types/task';
import { Contract } from '../../../../../../db/types/contract';
import { getTaskTotal } from '../../../../../../db/dataUtils/getTaskTotal';
import { buildDataLoader } from '../../../../../../db/dataLoaders';
/*models*/
import { UserModel } from '../../../../../../db/models/UserModel';
/*GQL*/
import { GraphQLError } from '../../../../../../gql';
import { Phase } from '../../../../../../gql/resolvers/Types/Phase/Phase';
import { Task } from '../../../../../../gql/resolvers/Types/Task/Task';
import { TaskInput } from '../../../../../../gql/resolvers/Types/Task/inputs/TaskInput';
import {
  restrictNegativePhases,
  RestrictNegativePhasesTArgsInput
} from '../../../../../../gql/resolvers/Mutation/change-orders/helpers/restrictNegativePhases';
/*other*/
import { Test } from '../../../../../helpers/Test';

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  ChangeOrder = 'ChangeOrder'
}
const enum PhaseName {
  First = 'FIRST',
  Second = 'SECOND',
  Thread = 'THREAD'
}
export enum TaskName {
  First = 'FIRST',
  Second = 'SECOND'
}

type PopulatedPhase = Phase & {
  tasks: Array<Task & { payment: Payment & { charge: PaymentOperation; payout?: PaymentOperation } }>;
};

interface OutputData {
  users: Test.TUser[];
  phases: Array<PopulatedPhase>;
  contract: Contract;
}

describe('gql/resolvers/Mutation/change-order/helpers/{restrictNegativePhases, prevNextPhasesTotalPositive}', () => {
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
      name: ContractName.ChangeOrder
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
            markupPercent: 5,
            order: 500,
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
        name: PhaseName.Second,
        order: 1000,
        tasks: [
          {
            name: TaskName.First,
            materialCost: 1000,
            laborCost: 1000,
            otherCost: 1000,
            markupPercent: 5,
            order: 500,
            status: TaskStatus.Done,
            payment: {
              payoutRequestedAt: new Date(),
              charge: {
                availableAt: new Date(),
                status: PaymentOperationStatus.Succeeded
              }
            }
          },
          {
            name: TaskName.Second,
            materialCost: -500,
            laborCost: -500,
            otherCost: -500,
            markupPercent: 5,
            order: 500,
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
        name: ContractName.ChangeOrder
      });
      if (!contract) throw GraphQLError.notFound('contract');

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
        phases,
        contract
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
  it('should allow not error if destination phase have positive sum and after phase same fave positive sum', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
    if (!firstPhase) throw GraphQLError.notFound('first phase');

    const secondPhase = _.find(outputData.phases, { name: PhaseName.Second });
    if (!secondPhase) throw GraphQLError.notFound('second phase');

    const firstTask = _.find(firstPhase.tasks, { name: TaskName.First });
    if (!firstTask) throw GraphQLError.notFound('first task');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: homeUser
        };

        const data = {
          contractId: outputData.contract.id,
          inputs: [
            toTaskInput({
              ...firstTask,
              phaseId: secondPhase.id
            })
          ]
        };

        await restrictNegativePhases(client, data, ctx as any);
      });
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  it('should allow not error if new phase have positive sum and after phase same fave positive sum', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
    if (!firstPhase) throw GraphQLError.notFound('first phase');

    const firstTask = _.find(firstPhase.tasks, { name: TaskName.First });
    if (!firstTask) throw GraphQLError.notFound('first task');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: homeUser
        };

        const newPhaseName = PhaseName.Thread;

        const data = {
          contractId: outputData.contract.id,
          inputs: [
            toTaskInput({
              ...firstTask,
              phaseName: newPhaseName
            })
          ]
        };

        await restrictNegativePhases(client, data, ctx as any);
      });
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  it('should allow not error if update task cost not critical for the phase sum', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
    if (!firstPhase) throw GraphQLError.notFound('first phase');

    const firstTask = _.find(firstPhase.tasks, { name: TaskName.First });
    if (!firstTask) throw GraphQLError.notFound('first task');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: homeUser
        };

        const data = {
          contractId: outputData.contract.id,
          inputs: [
            toTaskInput({
              ...firstTask,
              materialCost: -(getTaskTotal(firstTask) / 2)
            })
          ]
        };

        await restrictNegativePhases(client, data, ctx as any);
      });
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  it('should allow not error if new task does not make the phase sum negative', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
    if (!firstPhase) throw GraphQLError.notFound('first phase');

    const firstTask = _.find(firstPhase.tasks, { name: TaskName.First });
    if (!firstTask) throw GraphQLError.notFound('first task');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: homeUser
        };

        const data = {
          contractId: outputData.contract.id,
          inputs: [
            toTaskInput({
              ...firstTask,
              id: undefined
            })
          ]
        };

        await restrictNegativePhases(client, data, ctx as any);
      });
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  // error
  it(`error if after new task, phase become negative sum`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const secondPhase = _.find(outputData.phases, { name: PhaseName.Second });
    if (!secondPhase) throw GraphQLError.notFound('second phase');

    const firstTask = _.find(secondPhase.tasks, { name: TaskName.First });
    if (!firstTask) throw GraphQLError.notFound('first task');

    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          currentUser: homeUser
        };

        const data = {
          contractId: outputData.contract.id,
          inputs: [
            toTaskInput({
              ...firstTask,
              id: undefined,
              materialCost: -getTaskTotal(firstTask) - 100
            })
          ]
        };

        await restrictNegativePhases(client, data, ctx as any);
      });
    } catch (e) {
      Test.Check.error(e, new GraphQLError(`Destination phase sum must be zero or positive.`));
    }
  });

  it(`error if after update task cost, phase become negative sum`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const secondPhase = _.find(outputData.phases, { name: PhaseName.Second });
    if (!secondPhase) throw GraphQLError.notFound('second phase');

    const firstTask = _.find(secondPhase.tasks, { name: TaskName.First });
    if (!firstTask) throw GraphQLError.notFound('first task');

    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          currentUser: homeUser
        };

        const data = {
          contractId: outputData.contract.id,
          inputs: [
            toTaskInput({
              ...firstTask,
              materialCost: -getTaskTotal(firstTask) - 100
            })
          ]
        };

        await restrictNegativePhases(client, data, ctx as any);
      });
    } catch (e) {
      Test.Check.error(e, new GraphQLError(`Source phase sum must be zero or positive.`));
    }
  });

  it(`error if new phase become negative sum`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const secondPhase = _.find(outputData.phases, { name: PhaseName.Second });
    if (!secondPhase) throw GraphQLError.notFound('second phase');

    const secondTask = _.find(secondPhase.tasks, { name: TaskName.Second });
    if (!secondTask) throw GraphQLError.notFound('first task');

    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          currentUser: homeUser
        };

        const newPhaseName = PhaseName.Thread;

        const data = {
          contractId: outputData.contract.id,
          inputs: [
            toTaskInput({
              ...secondTask,
              phaseName: newPhaseName
            })
          ]
        };

        await restrictNegativePhases(client, data, ctx as any);
      });
    } catch (e) {
      Test.Check.error(e, new GraphQLError(`Destination phase sum must be zero or positive.`));
    }
  });

  it(`error if destination phase become negative sum; "BY NAME"`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
    if (!firstPhase) throw GraphQLError.notFound('first phase');

    const secondPhase = _.find(outputData.phases, { name: PhaseName.Second });
    if (!secondPhase) throw GraphQLError.notFound('second phase');

    const secondTask = _.find(secondPhase.tasks, { name: TaskName.Second });
    if (!secondTask) throw GraphQLError.notFound('second task');

    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          currentUser: homeUser
        };

        const data = {
          contractId: outputData.contract.id,
          inputs: [
            toTaskInput({
              ...secondTask,
              phaseName: '  ' + firstPhase.name.toLowerCase() + '   '
            })
          ]
        };

        await restrictNegativePhases(client, data, ctx as any);
      });
    } catch (e) {
      Test.Check.error(e, new GraphQLError(`Destination phase sum must be zero or positive.`));
    }
  });

  it(`error if destination phase become negative sum; "BY ID"`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
    if (!firstPhase) throw GraphQLError.notFound('first phase');

    const secondPhase = _.find(outputData.phases, { name: PhaseName.Second });
    if (!secondPhase) throw GraphQLError.notFound('second phase');

    const secondTask = _.find(secondPhase.tasks, { name: TaskName.Second });
    if (!secondTask) throw GraphQLError.notFound('second task');

    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          currentUser: homeUser
        };

        const data = {
          contractId: outputData.contract.id,
          inputs: [
            toTaskInput({
              ...secondTask,
              phaseId: firstPhase.id
            })
          ]
        };

        await restrictNegativePhases(client, data, ctx as any);
      });
    } catch (e) {
      Test.Check.error(e, new GraphQLError(`Destination phase sum must be zero or positive.`));
    }
  });

  it(`error if after phase become negative sum; "BY NAME"`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
    if (!firstPhase) throw GraphQLError.notFound('first phase');

    const secondPhase = _.find(outputData.phases, { name: PhaseName.Second });
    if (!secondPhase) throw GraphQLError.notFound('second phase');

    const firstTask = _.find(secondPhase.tasks, { name: TaskName.First });
    if (!firstTask) throw GraphQLError.notFound('first task');

    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          currentUser: homeUser
        };

        const data = {
          contractId: outputData.contract.id,
          inputs: [
            toTaskInput({
              ...firstTask,
              phaseName: '  ' + firstPhase.name.toLowerCase() + '   '
            })
          ]
        };

        await restrictNegativePhases(client, data, ctx as any);
      });
    } catch (e) {
      Test.Check.error(e, new GraphQLError(`Source phase sum must be zero or positive.`));
    }
  });

  it(`error if after phase become negative sum; "BY ID"`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
    if (!firstPhase) throw GraphQLError.notFound('first phase');

    const secondPhase = _.find(outputData.phases, { name: PhaseName.Second });
    if (!secondPhase) throw GraphQLError.notFound('second phase');

    const firstTask = _.find(secondPhase.tasks, { name: TaskName.First });
    if (!firstTask) throw GraphQLError.notFound('first task');

    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          currentUser: homeUser
        };

        const data = {
          contractId: outputData.contract.id,
          inputs: [
            toTaskInput({
              ...firstTask,
              phaseId: firstPhase.id
            })
          ]
        };

        await restrictNegativePhases(client, data, ctx as any);
      });
    } catch (e) {
      Test.Check.error(e, new GraphQLError(`Source phase sum must be zero or positive.`));
    }
  });

  it(`error if task not found`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const secondPhase = _.find(outputData.phases, { name: PhaseName.Second });
    if (!secondPhase) throw GraphQLError.notFound('second phase');

    const firstTask = _.find(secondPhase.tasks, { name: TaskName.First });
    if (!firstTask) throw GraphQLError.notFound('first task');

    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          currentUser: homeUser
        };

        const data = {
          contractId: outputData.contract.id,
          inputs: [
            toTaskInput({
              ...firstTask,
              id: secondPhase.id
            })
          ]
        };

        await restrictNegativePhases(client, data, ctx as any);
      });
    } catch (e) {
      Test.Check.error(e, GraphQLError.notFound('task'));
    }
  });
});

function toTaskInput<T extends RestrictNegativePhasesTArgsInput>(task: T) {
  const keys: Array<keyof TaskInput> = [
    'id',
    'materialCost',
    'laborCost',
    'otherCost',
    'markupPercent',
    'phaseId',
    'phaseName'
  ];

  return _.pick(task, keys) as RestrictNegativePhasesTArgsInput;
}
