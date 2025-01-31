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
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { Contract } from '../../../../../gql/resolvers/Types/Contract';
import { DeclineReason } from '../../../../../gql/resolvers/DeclineReason';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { declineEstimate: Contract };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Other = 'other@test.com'
}

const enum ContractName {
  DeclineEstimate = 'DeclineEstimate'
}

interface OutputData {
  users: Test.TUser[];
  contract: ContractDB;
  estimate: Estimate;
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

const DECLINE_ESTIMATE_MUTATION = `mutation (
  $contractId: ID!,
  $reason: DeclineReason!,
  $message: String
) {
  declineEstimate(contractId: $contractId, reason: $reason, message: $message) {
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
      note
      declineNote
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

describe('gql/resolvers/Mutation/estimates/decline', () => {
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
      name: ContractName.DeclineEstimate,
      status: ContractStatus.WaitingReview
    },
    estimate: {
      note: 'test',
      declineNote: 'test'
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

      const estimateGenerate = new Test.EstimateGenerate(client, ctx);
      await estimateGenerate.create(inputData.estimate);
      const estimate = estimateGenerate.estimate!;

      const projectGenerate = new Test.ProjectGenerate(client, ctx);
      await projectGenerate.create({
        ownerId: homeUser.lastRoleId,
        matchData: inputData.project.matchData as any
      });
      await projectGenerate.addContract({
        name: inputData.contract.name,
        status: inputData.contract.status,
        partnerId: proUser.lastRoleId,
        estimateId: estimate.id
      });

      const project = projectGenerate.project!;
      const contract = _.find(project.contracts, {
        name: ContractName.DeclineEstimate
      });
      if (!contract) throw GraphQLError.notFound('contract');

      return {
        users,
        contract,
        estimate
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
  it('should allow to decline estimate', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('user');

    const contract = outputData.contract;
    const declineMessage = 'test decline';

    const { data, errors } = await execQuery<TQuery>(
      DECLINE_ESTIMATE_MUTATION,
      {
        contractId: contract.id,
        reason: DeclineReason.Deferred,
        message: declineMessage
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.declineEstimate;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        status: DeclineReason.Deferred,
        estimate: {
          ...inputData.estimate,
          declineNote: declineMessage
        }
      },
      requiredFieldSet
    );
  });

  // error
  it('no contract partner user cannot decline estimate', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      DECLINE_ESTIMATE_MUTATION,
      {
        contractId: outputData.contract.id,
        reason: DeclineReason.Declined
      },
      otherUser
    );

    Test.Check.error(errors, GraphQLError.notFound('contract'));
  });

  it('contract not found', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      DECLINE_ESTIMATE_MUTATION,
      {
        contractId: otherUser.id,
        reason: DeclineReason.Declined
      },
      otherUser
    );

    Test.Check.error(errors, GraphQLError.notFound('contract'));
  });
});
