/*external modules*/
import * as argon2 from 'argon2';
import _ from 'lodash';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Contract as ContractDB, ContractStatus } from '../../../../../db/types/contract';
import { Estimate } from '../../../../../db/types/estimate';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { ContractModel } from '../../../../../db/models/ContractModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { Contract } from '../../../../../gql/resolvers/Types/Contract';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { submitEstimate: Contract };

const enum Email {
  Pro1 = 'pro1@test.com',
  Pro2 = 'pro2@test.com',
  Home = 'home@test.com',
  Other = 'other@test.com'
}

const enum ContractName {
  HiredContract = 'HiredContract',
  PreparingEstimateContract = 'PreparingEstimateContract'
}

interface OutputData {
  users: Test.TUser[];
  contracts: Array<ContractDB & { estimate: Estimate }>;
}

const requiredFieldSet: Test.TFieldSet<Contract> = {
  scalar: [
    'id',
    'introMessage',
    'name',
    'relativeDates',
    'status',
    'autoReleaseDays',
    'autoPayments',
    'unreadMessagesCount',
    'dismissReviewDates',
    'archived',
    'createdAt',
    'updatedAt'
  ],
  object: ['project', 'workingDays', 'estimate'],
  array: ['phases', 'estimatePhases', 'completions', 'schedules', 'collaborators']
};

const SUBMIT_ESTIMATE_MUTATION = `mutation($contractId: ID!) {
  submitEstimate(contractId: $contractId) {
    id
    introMessage
    name
    relativeDates
    status
    autoReleaseDays
    autoPayments
    unreadMessagesCount
    dismissReviewDates
    archived
    createdAt
    updatedAt

    estimate {
      id
    }
    project {
      id
    }
    workingDays {
      mon
    }

    phases {
      id
    }
    estimatePhases {
      id
    }
    completions {
      id
    }
    schedules {
      id
    }
    collaborators {
      id
    }
  }
}`;

describe('gql/resolvers/Mutation/estimates/submit', () => {
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
        email: Email.Pro1,
        password: Email.Pro1,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.Pro2,
        password: Email.Pro2,
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
    contracts: [
      {
        $partner: Email.Pro1,
        name: ContractName.HiredContract,
        status: ContractStatus.Hired,
        estimate: {
          note: 'test1',
          declineNote: 'test1'
        }
      },
      {
        $partner: Email.Pro2,
        name: ContractName.PreparingEstimateContract,
        status: ContractStatus.PreparingEstimate,
        estimate: {
          note: 'test2',
          declineNote: 'test2'
        }
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

      const projectGenerate = new Test.ProjectGenerate(client, ctx);
      await projectGenerate.create({
        ownerId: homeUser.lastRoleId,
        matchData: inputData.project.matchData as any
      });
      await Promise.all(
        _.map(inputData.contracts, async contractInput => {
          const partner = _.find(users, { email: contractInput.$partner });
          if (!partner) throw GraphQLError.notFound('pro');

          const estimateGenerate = new Test.EstimateGenerate(client, ctx);
          await estimateGenerate.create(contractInput.estimate);
          const estimate = estimateGenerate.estimate!;

          await projectGenerate.addContract({
            name: contractInput.name,
            status: contractInput.status,
            partnerId: partner.lastRoleId,
            estimateId: estimate.id
          });

          const project = projectGenerate.project!;
          const contract = _.find(project.contracts, { name: contractInput.name })!;

          _.set(contract, 'estimate', estimate);
        })
      );

      const project = projectGenerate.project!;
      const contracts = project.contracts! as OutputData['contracts'];

      return {
        users,
        contracts
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      await Promise.all(
        _.map(outputData.users, async user => {
          await Promise.all(
            _.map(outputData.contracts, contract =>
              ContractModel.unarchive.exec(
                client,
                {
                  contractId: contract.id,
                  roleId: user.lastRoleId
                },
                ctx
              )
            )
          );

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
  it('should allow to submit estimate', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro2 });
    if (!proUser) throw GraphQLError.notFound('user');

    const contract = _.find(outputData.contracts, { name: ContractName.PreparingEstimateContract });
    if (!contract) throw GraphQLError.notFound('contract');

    const { data, errors } = await execQuery<TQuery>(
      SUBMIT_ESTIMATE_MUTATION,
      {
        contractId: contract.id
      },
      proUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.submitEstimate;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        ..._.pick(contract, _.without(requiredFieldSet.scalar!, 'createdAt', 'updatedAt')),
        status: ContractStatus.WaitingReview
      },
      requiredFieldSet
    );
  });

  // error
  it('contract must be have valid status before submit estimate', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro1 });
    if (!proUser) throw GraphQLError.notFound('user');

    const contract = _.find(outputData.contracts, { name: ContractName.HiredContract });
    if (!contract) throw GraphQLError.notFound('contract');

    const { errors } = await execQuery<TQuery>(
      SUBMIT_ESTIMATE_MUTATION,
      {
        contractId: contract.id
      },
      proUser
    );

    Test.Check.error(errors, GraphQLError.notFound('contract'));
  });

  it("other user haven't contract access", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const contract = _.find(outputData.contracts, { name: ContractName.HiredContract });
    if (!contract) throw GraphQLError.notFound('contract');

    const { errors } = await execQuery<TQuery>(
      SUBMIT_ESTIMATE_MUTATION,
      {
        contractId: contract.id
      },
      otherUser
    );

    Test.Check.error(errors, GraphQLError.notFound('contract'));
  });

  it('contract not found', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      SUBMIT_ESTIMATE_MUTATION,
      {
        contractId: otherUser.id
      },
      otherUser
    );

    Test.Check.error(errors, GraphQLError.notFound('contract'));
  });
});
