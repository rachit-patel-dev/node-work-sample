/*external modules*/
import _ from 'lodash';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import {
  Contract as ContractDB,
  ContractPaymentPlan,
  ContractPermissionResult,
  ContractStatus
} from '../../../../../db/types/contract';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { Contract } from '../../../../../gql/resolvers/Types/Contract';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { selectContractPaymentPlan: Contract };

const enum Email {
  Pro1 = 'pro1@test.com',
  Pro2 = 'pro2@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}

const enum ContractName {
  One = 'One',
  Two = 'Two'
}

interface OutputData {
  users: Test.TUser[];
  contracts: Array<ContractDB>;
}

const requiredFieldSet: Test.TFieldSet<Contract> = {
  scalar: [
    'id',
    'createdAt',
    'introMessage',
    'name',
    'paid',
    'relativeDates',
    'status',
    'updatedAt',
    'workingDays',
    'autoReleaseDays',
    'currentUserPermission',
    'autoPayments',
    'unreadMessagesCount',
    'dismissReviewDates',
    'archived'
  ],
  object: ['project'],
  array: [
    'phases',
    'estimatePhases',
    'completions',
    'schedules',
    'collaborators',
    'openedChangeOrders',
    'requestedPayouts'
  ]
};

const SELECT_CONTRACT_PAYMENT_PLAN_MUTATION = `mutation($contractId: ID!, $plan: ContractPaymentPlan!) {
  selectContractPaymentPlan(contractId: $contractId, plan: $plan) {
    id
    createdAt
    introMessage
    name
    paid
    relativeDates
    status
    updatedAt
    autoReleaseDays
    currentUserPermission
    autoPayments
    unreadMessagesCount
    dismissReviewDates
    archived

    paymentPlan

    workingDays {
      mon
    }
    project {
      id
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
    openedChangeOrders {
      id
    }
    requestedPayouts {
      id
    }
  }
}`;

describe('gql/resolvers/Mutation/contracts/selectPaymentPlan', () => {
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
        email: Email.Pro1,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.Pro2,
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
      },
      contracts: [
        {
          name: ContractName.One,
          partnerEmail: Email.Pro1,
          status: ContractStatus.PreparingEstimate
        },
        {
          name: ContractName.Two,
          partnerEmail: Email.Pro2,
          status: ContractStatus.Hired
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

          await userGenerate.create({ email: userData.email });
          await userGenerate.setRole({ name: userData.role.name });

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

      const project = projectGenerate.project!;

      await Promise.all(
        _.map(inputData.project.contracts, async contractData => {
          const partner = _.find(users, { email: contractData.partnerEmail });
          if (!partner) {
            throw GraphQLError.notFound(`partner by ${contractData.partnerEmail}`);
          }

          await projectGenerate.addContract({
            name: contractData.name,
            partnerId: partner.lastRoleId,
            status: contractData.status
          });

          const contract = await _.find(project.contracts, {
            name: contractData.name
          });
          if (!contract) throw GraphQLError.notFound(`contract by ${contractData.name}`);
        })
      );

      const contracts = project.contracts!;

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
  it('should allow to select payment plan', async () => {
    const contract = _.find(outputData.contracts, { name: ContractName.One });
    if (!contract) throw GraphQLError.notFound('contract');

    const proUser = _.find(outputData.users, { email: Email.Pro1 });
    if (!proUser) throw GraphQLError.notFound('user');

    const { data, errors } = await execQuery<TQuery>(
      SELECT_CONTRACT_PAYMENT_PLAN_MUTATION,
      {
        contractId: contract.id,
        plan: ContractPaymentPlan.Transaction
      },
      proUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.selectContractPaymentPlan;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        id: contract.id,
        name: contract.name,
        paymentPlan: ContractPaymentPlan.Transaction
      },
      requiredFieldSet
    );
  });

  // error
  it(`other user have't access to contract`, async () => {
    const contract = _.find(outputData.contracts, { name: ContractName.One });
    if (!contract) throw GraphQLError.notFound('contract');

    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      SELECT_CONTRACT_PAYMENT_PLAN_MUTATION,
      {
        contractId: contract.id,
        plan: ContractPaymentPlan.Transaction
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it(`can't select payment plan if contract hired`, async () => {
    const contract = _.find(outputData.contracts, { name: ContractName.Two });
    if (!contract) throw GraphQLError.notFound('contract');

    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      SELECT_CONTRACT_PAYMENT_PLAN_MUTATION,
      {
        contractId: contract.id,
        plan: ContractPaymentPlan.Transaction
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(`Cannot select new payment plan for contract with status "Hired"`));
  });

  it('contract not found', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      SELECT_CONTRACT_PAYMENT_PLAN_MUTATION,
      {
        contractId: otherUser.id,
        plan: ContractPaymentPlan.Transaction
      },
      otherUser
    );

    Test.Check.error(errors, GraphQLError.notFound('contract'));
  });
});
