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
import { checkPositiveSumOfPhases } from '../../../../../../gql/resolvers/Mutation/change-orders/helpers/checkPositiveSumOfPhases';
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
  Second = 'SECOND'
}
export enum TaskName {
  First = 'FIRST'
}

type PopulatedPhase = Phase & {
  tasks: Array<Task & { payment: Payment & { charge: PaymentOperation; payout?: PaymentOperation } }>;
};

interface OutputData {
  users: Test.TUser[];
  phases: Array<PopulatedPhase>;
  contract: Contract;
}

// TODO: deprecated since restrictNegativePhases.ts
describe('gql/resolvers/Mutation/change-order/helpers/checkPositiveSumOfPhases', () => {
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
            materialCost: -1,
            laborCost: -1,
            otherCost: -1,
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
  it('should allow not error', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const firstPhase = _.find(outputData.phases, { name: PhaseName.First });
    if (!firstPhase) throw GraphQLError.notFound('first phase');

    let error = null;
    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          dataLoader: buildDataLoader(),
          currentUser: homeUser
        };

        await checkPositiveSumOfPhases(client, [firstPhase.id], ctx as any);
      });
    } catch (e) {
      error = e;
    } finally {
      assert(error === null, 'Must be no error.' + error);
    }
  });

  // error
  it(`error if phase sum is negative `, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('home user');

    const secondPhase = _.find(outputData.phases, { name: PhaseName.Second });
    if (!secondPhase) throw GraphQLError.notFound('second phase');

    try {
      await getClient(async client => {
        const ctx = {
          sql,
          events: [],
          currentUser: homeUser
        };

        await checkPositiveSumOfPhases(client, [secondPhase.id], ctx as any);
      });
    } catch (e) {
      Test.Check.error(e, new GraphQLError(`Sum of phase must be zero or positive.`));
    }
  });
});
