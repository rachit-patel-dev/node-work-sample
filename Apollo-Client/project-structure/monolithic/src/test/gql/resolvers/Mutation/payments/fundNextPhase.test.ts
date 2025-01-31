/*external modules*/
import _ from 'lodash';
import async from 'async';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Payment } from '../../../../../db/types/payment';
import {
  PaymentOperation,
  PaymentOperationStatus,
  PaymentOperationType
} from '../../../../../db/types/paymentOperation';
import { Task, TaskStatus } from '../../../../../db/types/task';
import { Collaborator, COLLABORATOR_TABLE, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { Contract, ContractPermissionResult } from '../../../../../db/types/contract';
import { getTaskTotal } from '../../../../../db/dataUtils/getTaskTotal';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { PaymentOperationModel } from '../../../../../db/models/PaymentOperationModel';
import { PaymentModel } from '../../../../../db/models/PaymentModel';
/*GQL*/
import { execQuery } from '../../../index';
import { GraphQLError } from '../../../../../gql';
import { Phase } from '../../../../../gql/resolvers/Types/Phase/Phase';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { fundNextPhase: Phase };

const enum Email {
  ProFirst = 'proFirst@test.com',
  ProSecond = 'proSecond@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ProjectName {
  First = 'FIRST'
}
const enum ContractName {
  WithUnpaidPhase = 'WithUnpaidPhase',
  WithoutUnpaidPhase = 'WithoutUnpaidPhase'
}
const enum PhaseName {
  FirstWith = 'FIRSTWITH',
  FirstWithout = 'FIRSTWITHOUT',
  SecondWithout = 'SECONDWITHOUT'
}
const enum TaskName {
  One = 'One',
  Two = 'Two',
  Free = 'Free'
}

type PopulatedPhase = Phase & {
  tasks: Array<Task & { payment: Payment & { charge: PaymentOperation; payout?: PaymentOperation } }>;
};
type PopulatedContract = Contract & {
  phases: Array<PopulatedPhase>;
};

interface OutputData {
  users: Test.TUser[];
  collaborators: Collaborator[];
  contracts: Array<PopulatedContract>;
}

const requiredFieldSet: Test.TFieldSet<Phase> = {
  scalar: [
    'id',
    'name',
    'description',
    'divisionTrade',
    'actualMaterialCost',
    'actualLaborCost',
    'actualOtherCost',
    'order'
  ],
  object: ['contract'],
  array: ['tasks']
};

const FUND_NEXT_PHASE_MUTATION = `mutation ($contractId: ID!) {
  fundNextPhase(contractId: $contractId) {
    id
    name
    description
    divisionTrade
    actualMaterialCost
    actualLaborCost
    actualOtherCost
    order

    contract {
      id
    }

    tasks {
      id
      name
    }
  }
}`;

describe('gql/resolvers/Mutation/fundNextPhase', () => {
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
      name: ProjectName.First,
      matchData: {
        createdByOwner: true
      }
    },
    contracts: [
      {
        name: ContractName.WithUnpaidPhase,
        index: 0,
        phases: [
          {
            name: PhaseName.FirstWith,
            order: 1000,
            tasks: [
              {
                name: TaskName.One,
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
                    status: PaymentOperationStatus.Succeeded
                  }
                }
              }
            ]
          }
        ]
      },
      {
        name: ContractName.WithoutUnpaidPhase,
        index: 1,
        phases: [
          {
            name: PhaseName.FirstWithout,
            order: 1000,
            tasks: [
              {
                name: TaskName.One,
                materialCost: 100,
                laborCost: 100,
                otherCost: 100,
                markupPercent: 20,
                order: 500,
                status: TaskStatus.Done,
                payment: {}
              }
            ]
          },
          {
            name: PhaseName.SecondWithout,
            order: 1230,
            tasks: [
              {
                name: TaskName.Two,
                materialCost: 100,
                laborCost: 100,
                otherCost: 100,
                markupPercent: 20,
                order: 500,
                status: TaskStatus.Done,
                payment: {}
              },
              {
                name: TaskName.Free,
                materialCost: 100,
                laborCost: 100,
                otherCost: 100,
                markupPercent: 20,
                order: 500,
                status: TaskStatus.Done
              }
            ]
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
      const contracts: OutputData['contracts'] = await async.map(inputData.contracts, async contractInput => {
        const proUser = pros[contractInput.index];

        await projectGenerate.addContract({
          name: contractInput.name,
          partnerId: proUser.lastRoleId
        });
        const project = projectGenerate.project!;

        const contract = _.find(project.contracts, {
          name: contractInput.name
        });
        if (!contract) throw GraphQLError.notFound('contract');

        const phases = await async.map(contractInput.phases, async phaseInput => {
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
            if (!taskInput.payment || _.isEmpty(taskInput.payment)) return;

            let task = _.last(phaseGenerate.phase?.tasks)!;

            const paymentGenerate = new Test.PaymentGenerate(client, ctx);
            await paymentGenerate.createCharge({
              amount: getTaskTotal(task),
              stripeId: 'px_' + _.get(task, 'name'),
              ..._.get(taskInput, ['payment', 'charge'])
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

        _.set(contract, 'phases', phases);

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

        _.set(contract, 'collaborators', collaborators);

        return contract;
      });

      const collaborators = _.flatMap(contracts, 'collaborators');

      return {
        users,
        collaborators,
        contracts
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      await Promise.all(
        _.map(outputData.contracts, async contract => {
          await getClient(async client => {
            await client.query(
              ctx.sql`
                DELETE
                FROM ${COLLABORATOR_TABLE}
                WHERE "contractId" = ${contract.id}
              `
            );
          });
        })
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
  it('should allow to fund phase', async () => {
    const contract = _.find(outputData.contracts, { name: ContractName.WithoutUnpaidPhase });
    if (!contract) throw GraphQLError.notFound('contract');

    const collaboratorUserFullHome = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });

    const firstPhase = _.find(contract.phases, { name: PhaseName.FirstWithout });
    if (!firstPhase) throw GraphQLError.notFound('First phase');

    const { data, errors } = await execQuery<TQuery>(
      FUND_NEXT_PHASE_MUTATION,
      {
        contractId: _.get(contract, 'id')
      },
      collaboratorUserFullHome
    );

    Test.Check.noErrors(errors);

    const result = data?.fundNextPhase;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        ..._.pick(firstPhase, requiredFieldSet.scalar!),
        contract: {
          id: _.get(contract, 'id')
        }
      },
      requiredFieldSet
    );

    Test.Check.data(result.tasks, (task: Task) => {
      const outputTask = _.find(firstPhase.tasks, { name: task.name });
      if (!outputTask) throw GraphQLError.notFound(task.name);

      return {
        id: _.get(outputTask, 'id')
      };
    });
  });

  // error
  describe('', () => {
    const ctx = { sql, events: [] };

    let homeUser: Test.TUser | undefined;
    let contract: PopulatedContract | undefined;
    let firstPhase: PopulatedPhase | undefined;
    let taskWithoutPayout: Task | undefined;

    let payout: PaymentOperation | undefined;
    let payment: Payment | undefined;

    before(async () => {
      homeUser = _.find(outputData.users, { email: Email.Home });
      contract = _.find(outputData.contracts, { name: ContractName.WithUnpaidPhase })!;
      firstPhase = _.find(contract.phases, { name: PhaseName.FirstWith });

      taskWithoutPayout = _.find(firstPhase?.tasks, { name: TaskName.One });
      const payoutData = {
        type: PaymentOperationType.Payout,
        availableAt: new Date(),
        status: PaymentOperationStatus.Pending,
        amount: getTaskTotal(taskWithoutPayout!),
        stripeId: 'px_' + _.get(taskWithoutPayout, 'name')
      };

      await getClient(async client => {
        payout = await PaymentOperationModel.create.exec(client, payoutData, ctx);
        payment = await PaymentModel.update.exec(
          client,
          {
            id: _.get(taskWithoutPayout, ['paymentId'])!,
            payoutId: payout.id!
          },
          ctx
        );
      });
    });

    after(async () => {
      await getClient(async client => {
        await PaymentModel.update.exec(
          client,
          {
            id: payment!.id,
            payoutId: null
          },
          ctx
        );

        await PaymentOperationModel.remove.exec(
          client,
          {
            paymentOperationId: payout!.id
          },
          ctx
        );
      });
    });

    it('no phases to fund', async () => {
      const { errors } = await execQuery<TQuery>(
        FUND_NEXT_PHASE_MUTATION,
        {
          contractId: _.get(contract, 'id')
        },
        homeUser
      );

      Test.Check.error(errors, new GraphQLError('No phases to fund'));
    });
  });

  it('cannot fund next phase if exist unpaid phase', async () => {
    const contract = _.find(outputData.contracts, { name: ContractName.WithUnpaidPhase });
    if (!contract) throw GraphQLError.notFound('contract');

    const collaboratorUserFullHome = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner
    });

    const { errors } = await execQuery<TQuery>(
      FUND_NEXT_PHASE_MUTATION,
      {
        contractId: _.get(contract, 'id')
      },
      collaboratorUserFullHome
    );

    Test.Check.error(errors, new GraphQLError('You have unpaid phase'));
  });

  it("other user haven't access to contract", async () => {
    const contract = _.find(outputData.contracts, { name: ContractName.WithUnpaidPhase });
    if (!contract) throw GraphQLError.notFound('contract');

    const otherUser = _.find(outputData.users, { email: Email.Other });

    const { errors } = await execQuery<TQuery>(
      FUND_NEXT_PHASE_MUTATION,
      {
        contractId: _.get(contract, 'id')
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });
});
