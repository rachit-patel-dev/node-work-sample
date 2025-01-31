/*external modules*/
import * as argon2 from 'argon2';
import _ from 'lodash';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Contract as ContractDB, ContractPermissionResult } from '../../../../../db/types/contract';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { ContractModel } from '../../../../../db/models/ContractModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { Contract } from '../../../../../gql/resolvers/Types/Contract';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { archiveContract: Contract };

const enum Email {
  Pro1 = 'pro1@test.com',
  Pro2 = 'pro2@test.com',
  Home = 'home@test.com',
  Other = 'other@test.com'
}

const enum ContractName {
  UnarchivedContract = 'UnarchivedContract',
  ArchiveContract = 'ArchiveContract'
}

interface OutputData {
  users: Test.TUser[];
  contracts: Array<ContractDB & { archived: boolean }>;
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

const ARCHIVE_CONTRACT_MUTATION = `mutation($contractId: ID!) {
  archiveContract(contractId: $contractId) {
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

describe('gql/resolvers/Mutation/contracts/archive', () => {
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
        $archived: false,
        $partner: Email.Pro1,
        name: ContractName.UnarchivedContract
      },
      {
        $archived: true,
        $partner: Email.Pro2,
        name: ContractName.ArchiveContract
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

          await projectGenerate.addContract({
            name: contractInput.name,
            partnerId: partner.lastRoleId
          });

          const project = projectGenerate.project!;
          const contract = _.find(project.contracts, { name: contractInput.name })!;

          if (!contractInput.$archived) {
            _.set(contract, 'archived', false);
            return;
          }

          await ContractModel.archive.exec(
            client,
            {
              contractId: contract.id,
              roleId: partner.lastRoleId
            },
            ctx
          );
          _.set(contract, 'archived', true);
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
  it('should allow to archive already archived contract', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro2 });
    if (!proUser) throw GraphQLError.notFound('user');

    const contract = _.find(outputData.contracts, { name: ContractName.ArchiveContract });
    if (!contract) throw GraphQLError.notFound('contract');

    const { data, errors } = await execQuery<TQuery>(
      ARCHIVE_CONTRACT_MUTATION,
      {
        contractId: contract.id
      },
      proUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.archiveContract;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        ..._.pick(contract, _.without(requiredFieldSet.scalar!, 'createdAt', 'updatedAt')),
        archived: true
      },
      requiredFieldSet
    );
  });

  it('should allow to archive contract', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro1 });
    if (!proUser) throw GraphQLError.notFound('user');

    const contract = _.find(outputData.contracts, { name: ContractName.UnarchivedContract });
    if (!contract) throw GraphQLError.notFound('contract');

    const { data, errors } = await execQuery<TQuery>(
      ARCHIVE_CONTRACT_MUTATION,
      {
        contractId: contract.id
      },
      proUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.archiveContract;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        ..._.pick(contract, _.without(requiredFieldSet.scalar!, 'createdAt', 'updatedAt')),
        archived: true
      },
      requiredFieldSet
    );
  });

  // error
  it("other user haven't contract access", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const contract = _.first(outputData.contracts);
    if (!contract) throw GraphQLError.notFound('contract');

    const { errors } = await execQuery<TQuery>(
      ARCHIVE_CONTRACT_MUTATION,
      {
        contractId: contract.id
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('contract not found', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      ARCHIVE_CONTRACT_MUTATION,
      {
        contractId: otherUser.id
      },
      otherUser
    );

    Test.Check.error(errors, GraphQLError.notFound('contract'));
  });
});
