/*external modules*/
import _ from 'lodash';
import async from 'async';
import moment from 'moment';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { CollaboratorPermission } from '../../../../../db/types/collaborator';
import { Contract as ContractDB, ContractPermissionResult, ContractStatus } from '../../../../../db/types/contract';
import { TaskStatus } from '../../../../../db/types/task';
import { PaymentOperation, PaymentOperationStatus } from '../../../../../db/types/paymentOperation';
import { getTaskTotal } from '../../../../../db/dataUtils/getTaskTotal';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { ContractModel } from '../../../../../db/models/ContractModel';
import { PaymentModel } from '../../../../../db/models/PaymentModel';
/*GQL*/
import { execQuery } from '../../../index';
import { GraphQLError } from '../../../../../gql';
import { Contract } from '../../../../../gql/resolvers/Types/Contract';
import { Phase } from '../../../../../gql/resolvers/Types/Phase/Phase';
import { Task } from '../../../../../gql/resolvers/Types/Task/Task';
import { Payment } from '../../../../../gql/resolvers/Payment';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { endContract: Contract };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  End = 'End'
}
const enum PhaseName {
  First = 'FIRST'
}

type PopulatedPhase = Phase & {
  tasks: Array<Task & { payment: Payment & { charge: PaymentOperation; payout?: PaymentOperation } }>;
};

interface OutputData {
  users: Test.TUser[];
  contract: ContractDB;
  phases: Array<PopulatedPhase>;
}

const requiredFieldSet: Test.TFieldSet<Contract> = {
  scalar: [
    'id',
    'introMessage',
    'name',
    'relativeDates',
    'status',
    'currentUserPermission',
    'autoPayments',
    'unreadMessagesCount'
  ],
  object: ['project'],
  array: ['phases', 'completions']
};

const END_CONTRACT_MUTATION = `mutation (
  $contractId: ID!,
  $esign: EsignInput,
  $reason: String!,
  $partialPayment: Boolean!
) {
  endContract(
    contractId: $contractId,
    esign: $esign,
    reason: $reason,
    partialPayment: $partialPayment
  ) {
    id
    introMessage
    name
    relativeDates
    status
    currentUserPermission
    autoPayments
    unreadMessagesCount

    project {
      id
    }

    phases {
      id

      tasks {
        id

        payment {
          id
          esignId
          payoutRequestedAt
        }
      }
    }
    completions {
      id
      initiatedById
      reason
      partialPayment
    }
  }
}`;

describe('gql/resolvers/Mutation/endContract', () => {
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
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.HomeOwner,
        role: {
          name: UserRole.HomeOwner
        }
      }
    ],
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.End,
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
                charge: {
                  availableAt: new Date(),
                  status: PaymentOperationStatus.Succeeded
                }
              }
            },
            {
              name: 'task 2',
              materialCost: 130,
              laborCost: 100,
              otherCost: 14,
              markupPercent: 20,
              order: 500,
              status: TaskStatus.Doing,
              payment: {
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
        name: ContractName.End
      });
      if (!contract) throw GraphQLError.notFound('contract');

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
          await paymentGenerate.createPayment({});

          const payment = paymentGenerate.payment;

          await phaseGenerate.updateTask({
            id: _.get(task, 'id'),
            paymentId: _.get(payment, 'id')
          });

          task = await _.find(phaseGenerate.phase?.tasks, { id: task.id })!;

          _.set(task, 'payment', {
            ...payment,
            paymentId: _.get(payment, 'id'),
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
        phases
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      await ContractModel.removeCompletions.exec(
        client,
        {
          contractId: _.get(outputData, ['contract', 'id'])
        },
        ctx
      );

      const paymentIds = _.chain(outputData.phases)
        .flatMap(phase => phase.tasks)
        .map('paymentId')
        .compact()
        .value();

      await Promise.all(
        _.map(paymentIds, paymentId =>
          PaymentModel.update.exec(
            client,
            {
              id: paymentId,
              esignId: null
            },
            ctx
          )
        )
      );

      await Promise.all(
        _.map(outputData.users, async user => {
          await UserModel.remove.exec(
            client,
            {
              userId: user.id
            },
            ctx
          );
        })
      );
    });
  });

  // success
  it('should allow to end contract if payment partial', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    const contract = _.get(outputData, 'contract');

    const reason = 'test';
    const partialPayment = true;

    const { data, errors } = await execQuery<TQuery>(
      END_CONTRACT_MUTATION,
      {
        contractId: _.get(contract, 'id'),
        partialPayment,
        reason
      },
      proUser
    );

    Test.Check.noErrors(errors);

    const result = data?.endContract;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        ..._.pick(contract, ['id', 'introMessage', 'name', 'relativeDates', 'autoPayments']),
        status: ContractStatus.Completed,
        currentUserPermission: CollaboratorPermission.Full,
        completions: {
          0: {
            initiatedById: _.get(proUser, 'lastRoleId'),
            partialPayment,
            reason
          }
        }
      },
      requiredFieldSet
    );
  });

  describe('', () => {
    const ctx = { sql, events: [] };

    let contract: ContractDB | undefined;
    let homeUser: Test.TUser | undefined;
    let phases: Test.TPhase[] | undefined;

    let contractCompletionLength = 0;

    before(async () => {
      contract = _.get(outputData, 'contract')!;
      homeUser = _.find(outputData.users, { email: Email.Home });
      phases = _.get(outputData, 'phases');

      await getClient(async client => {
        const contractDB = await ContractModel.findById.exec(
          client,
          {
            contractId: contract!.id!
          },
          ctx
        );

        if (!contractDB) throw GraphQLError.notFound('contract');

        if (contractDB.status === ContractStatus.Completed) {
          await ContractModel.update.exec(
            client,
            {
              id: contract!.id!,
              status: contract?.status
            },
            ctx
          );
        }

        const contractCompletions = await ContractModel.getCompletions.exec(
          client,
          {
            contractId: contractDB.id
          },
          ctx
        );

        contractCompletionLength = contractCompletions.length;
      });
    });

    it('should allow to end contract if payment not partial', async () => {
      const inputData = {
        contractId: _.get(contract, 'id'),
        reason: 'test',
        partialPayment: false,
        esign: {
          signature: 'test'
        }
      };

      const { data, errors } = await execQuery<TQuery>(END_CONTRACT_MUTATION, inputData, homeUser);

      Test.Check.noErrors(errors);

      const result = data?.endContract;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          ..._.pick(contract, ['id', 'introMessage', 'name', 'relativeDates', 'autoPayments']),
          status: ContractStatus.Completed,
          currentUserPermission: CollaboratorPermission.Full,
          completions: {
            [contractCompletionLength]: {
              initiatedById: _.get(homeUser, 'lastRoleId'),
              ..._.pick(inputData, ['partialPayment', 'reason'])
            }
          }
        },
        requiredFieldSet
      );

      _.forEach(result.phases, phase => {
        const foundPhase = _.find(phases, { id: phase.id });
        if (!foundPhase) throw GraphQLError.notFound(`phase by id: "${phase.id}"`);

        Test.Check.data(phase.tasks, {
          payment: {
            esignId: {
              $check: '==',
              $value: true,
              $func: (value: string) => Boolean(value)
            },
            payoutRequestedAt: {
              $check: '==',
              $value: new Date(),
              $func: (date: Date) => moment(date).format('YYYY.MM.DD HH:mm')
            }
          }
        });
      });
    });
  });

  // error
  describe('', () => {
    const ctx = { sql, events: [] };

    let contract: ContractDB | undefined;
    let homeUser: Test.TUser | undefined;

    before(async () => {
      contract = _.get(outputData, 'contract')!;
      homeUser = _.find(outputData.users, { email: Email.Home });

      await getClient(async client => {
        await ContractModel.update.exec(
          client,
          {
            id: contract!.id!,
            status: ContractStatus.Completed
          },
          ctx
        );
      });
    });

    after(async () => {
      await getClient(async client => {
        await ContractModel.update.exec(
          client,
          {
            id: contract!.id!,
            status: contract?.status
          },
          ctx
        );
      });
    });

    it('contract does not have to be completed', async () => {
      const { errors } = await execQuery<TQuery>(
        END_CONTRACT_MUTATION,
        {
          contractId: _.get(contract, 'id'),
          reason: 'test',
          partialPayment: true
        },
        homeUser
      );

      Test.Check.error(errors, new GraphQLError(ContractPermissionResult.ContractEnded, 403));
    });
  });

  it(`contract not found`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const { errors } = await execQuery<TQuery>(
      END_CONTRACT_MUTATION,
      {
        contractId: _.get(homeUser, 'lastRoleId'),
        reason: 'test',
        partialPayment: true
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('contract'));
  });

  it(`other user have't access`, async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });

    const { errors } = await execQuery<TQuery>(
      END_CONTRACT_MUTATION,
      {
        contractId: _.get(outputData, ['contract', 'id']),
        reason: 'test',
        partialPayment: true
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('pro can end contract only with partial payment', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });

    const { errors } = await execQuery<TQuery>(
      END_CONTRACT_MUTATION,
      {
        contractId: _.get(outputData, ['contract', 'id']),
        reason: 'test',
        esign: {
          signature: 'test'
        },
        partialPayment: false
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError('Pro can end contract only with partial payment'));
  });

  it('esign is invalid', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const { errors } = await execQuery<TQuery>(
      END_CONTRACT_MUTATION,
      {
        contractId: _.get(outputData, ['contract', 'id']),
        reason: 'test',
        partialPayment: false
      },
      homeUser
    );

    Test.Check.error(errors, new GraphQLError('Esign is invalid'));
  });
});
