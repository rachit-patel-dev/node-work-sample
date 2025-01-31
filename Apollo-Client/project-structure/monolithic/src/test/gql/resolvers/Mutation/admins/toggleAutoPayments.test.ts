/*external modules*/
import * as argon2 from 'argon2';
import _ from 'lodash';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Contract as ContractDB } from '../../../../../db/types/contract';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { Contract } from '../../../../../gql/resolvers/Types/Contract';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { adminToggleAutoPayments: Contract };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Other = 'other@test.com',
  Admin = 'admin1@test.com'
}

const enum ContractName {
  Admin = 'Admin'
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

const ADMIN_TOGGLE_AUTO_PAYMENTS_MUTATION = `mutation($contractId: ID!) {
  adminToggleAutoPayments(contractId: $contractId) {
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

describe('gql/resolvers/Mutation/admins/toggleAutoPayments', () => {
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
      },
      {
        email: Email.Admin,
        password: Email.Admin,
        role: {
          name: UserRole.Admin
        }
      }
    ],
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.Admin
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
        name: ContractName.Admin
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
  it('should allow to admin toggle auto payments', async () => {
    const adminUser = _.find(outputData.users, { email: Email.Admin });
    if (!adminUser) throw GraphQLError.notFound('user');

    const contract = outputData.contract;

    const { data, errors } = await execQuery<TQuery>(
      ADMIN_TOGGLE_AUTO_PAYMENTS_MUTATION,
      {
        contractId: contract.id
      },
      adminUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.adminToggleAutoPayments;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        ..._.pick(contract, _.without(requiredFieldSet.scalar!, 'createdAt', 'updatedAt')),
        autoPayments: !contract.autoPayments
      },
      requiredFieldSet
    );
  });

  // error
  it('contract not found', async () => {
    const adminUser = _.find(outputData.users, { email: Email.Admin });
    if (!adminUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      ADMIN_TOGGLE_AUTO_PAYMENTS_MUTATION,
      {
        contractId: adminUser.id
      },
      adminUser
    );

    Test.Check.error(errors, GraphQLError.notFound('contract'));
  });

  it('user is not admin', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      ADMIN_TOGGLE_AUTO_PAYMENTS_MUTATION,
      {
        contractId: '12345'
      },
      otherUser
    );

    Test.Check.error(errors, GraphQLError.forbidden());
  });

  it('user required', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      ADMIN_TOGGLE_AUTO_PAYMENTS_MUTATION,
      {
        contractId: '12345'
      },
      null
    );

    Test.Check.error(errors, GraphQLError.unauthorized());
  });
});
