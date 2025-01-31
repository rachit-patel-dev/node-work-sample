/*external modules*/
import * as argon2 from 'argon2';
import _ from 'lodash';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Contract as ContractDB, ContractPermissionResult } from '../../../../../db/types/contract';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { Contract } from '../../../../../gql/resolvers/Types/Contract';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { dismissContractReviewDates: Contract };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Other = 'other@test.com'
}

const enum ContractName {
  DismissContractReviewDates = 'DismissContractReviewDates'
}

interface OutputData {
  users: Test.TUser[];
  contract: ContractDB;
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
  object: ['project', 'workingDays'],
  array: ['phases', 'estimatePhases', 'completions', 'schedules', 'collaborators']
};

const DISMISS_CONTRACT_REVIEW_DATES_MUTATION = `mutation($contractId: ID!) {
  dismissContractReviewDates(contractId: $contractId) {
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

describe('gql/resolvers/Mutation/contracts/dismissReviewDates', () => {
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
      name: ContractName.DismissContractReviewDates
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
        name: ContractName.DismissContractReviewDates
      });
      if (!contract) throw GraphQLError.notFound('contract');

      return {
        users,
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
  it('should allow to pro user dismiss contract review dates', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('user');

    const contract = outputData.contract;

    const { data, errors } = await execQuery<TQuery>(
      DISMISS_CONTRACT_REVIEW_DATES_MUTATION,
      {
        contractId: contract.id
      },
      proUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.dismissContractReviewDates;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        ..._.pick(contract, _.without(requiredFieldSet.scalar!, 'createdAt', 'updatedAt')),
        dismissReviewDates: contract.dismissReviewDates + 1
      },
      requiredFieldSet
    );
  });

  // error
  it("other user haven't contract access", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      DISMISS_CONTRACT_REVIEW_DATES_MUTATION,
      {
        contractId: outputData.contract.id
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('contract not found', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      DISMISS_CONTRACT_REVIEW_DATES_MUTATION,
      {
        contractId: otherUser.id
      },
      otherUser
    );

    Test.Check.error(errors, GraphQLError.notFound('contract'));
  });
});
