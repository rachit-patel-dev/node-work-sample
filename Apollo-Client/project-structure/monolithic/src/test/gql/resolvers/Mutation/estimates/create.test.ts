/*external modules*/
import * as argon2 from 'argon2';
import _ from 'lodash';
import moment from 'moment';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Contract as ContractDB, ContractStatus } from '../../../../../db/types/contract';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { Estimate } from '../../../../../gql/resolvers/Types/Estimate';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { createEstimate: Estimate };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Other = 'other@test.com'
}

const enum ContractName {
  CreateEstimate = 'createEstimate'
}

interface OutputData {
  users: Test.TUser[];
  contract: ContractDB;
}

const requiredFieldSet: Test.TFieldSet<Estimate> = {
  scalar: ['id', 'note', 'declineNote', 'createdAt', 'updatedAt'],
  object: ['contract'],
  array: ['files']
};

const CREATE_ESTIMATE_MUTATION = `mutation ($contractId: ID!) {
  createEstimate(contractId: $contractId) {
    id
    note
    declineNote
    createdAt
    updatedAt

    contract {
      id
      status

      estimate {
        id
      }
    }
    files {
      id
    }
  }
}`;

describe('gql/resolvers/Mutation/estimates/create', () => {
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
      name: ContractName.CreateEstimate
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
        name: ContractName.CreateEstimate
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
  it('should allow to create estimate', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });
    if (!proUser) throw GraphQLError.notFound('user');

    const contract = outputData.contract;

    const { data, errors } = await execQuery<TQuery>(
      CREATE_ESTIMATE_MUTATION,
      {
        contractId: contract.id
      },
      proUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.createEstimate;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        contract: {
          status: ContractStatus.PreparingEstimate,
          estimate: {
            id: result.id
          }
        },
        createdAt: {
          $check: '===',
          $value: new Date(),
          $func: (value: any) => moment(value).format('YYYY:MM:DD HH')
        },
        updatedAt: {
          $check: '===',
          $value: new Date(),
          $func: (value: any) => moment(value).format('YYYY:MM:DD HH')
        }
      },
      requiredFieldSet
    );
  });

  // error
  it('no contract partner user cannot create estimate', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      CREATE_ESTIMATE_MUTATION,
      {
        contractId: outputData.contract.id
      },
      otherUser
    );

    Test.Check.error(errors, GraphQLError.notFound('contract'));
  });

  it('contract not found', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      CREATE_ESTIMATE_MUTATION,
      {
        contractId: otherUser.id
      },
      otherUser
    );

    Test.Check.error(errors, GraphQLError.notFound('contract'));
  });
});
