/*external modules*/
import _ from 'lodash';
import async from 'async';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Contract, ContractStatus } from '../../../../../db/types/contract';
import { PaymentOperation, PaymentOperationStatus } from '../../../../../db/types/paymentOperation';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { ContractModel } from '../../../../../db/models/ContractModel';
import { PaymentOperationModel } from '../../../../../db/models/PaymentOperationModel';
/*GQL*/
import { execQuery } from '../../../index';
import { GraphQLError } from '../../../../../gql';
import { Phase } from '../../../../../gql/resolvers/Types/Phase/Phase';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { adminFundPhase: Phase };

const enum Email {
  Home = 'home@test.com',
  Pro = 'pro@test.com',
  Admin = 'qdmin@test.com'
}
const enum ContractName {
  Fund = 'Fund'
}

interface OutputData {
  users: Test.TUser[];
  contract: Contract;
  phase: Test.TPhase;
  charge: PaymentOperation;
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
    'contractId',
    'order'
  ],
  object: ['contract'],
  array: ['tasks']
};

const ADMIN_FUND_PHASE_MUTATION = `mutation ($phaseId: ID!) {
  adminFundPhase(phaseId: $phaseId) {
      id
      name
      description
      divisionTrade
      actualMaterialCost
      actualLaborCost
      actualOtherCost
      contractId
      order

      contract {
        id
      }
      tasks {
        id
      }
  }
}`;

describe('gql/resolvers/Mutation/adminFundPhase', () => {
  let outputData: OutputData;

  const inputData = {
    users: [
      {
        email: Email.Home,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.Pro,
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.Admin,
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
      name: ContractName.Fund
    },
    phase: {
      name: 'decision',
      order: 1000
    },
    tasks: [
      {
        name: 'task 1',
        materialCost: 100,
        laborCost: 100,
        otherCost: 100,
        markupPercent: 20,
        order: 500
      }
    ],
    charge: {
      stripeId: 'px_sdfsdf',
      status: PaymentOperationStatus.Failed,
      amount: 500
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
      const contract = _.find(project.contracts, { name: ContractName.Fund });
      if (!contract) throw GraphQLError.notFound('contract');

      const phaseGenerate = new Test.PhaseGenerate(client, ctx);
      await phaseGenerate.create({
        contractId: contract.id,
        ...inputData.phase
      });
      await async.each(inputData.tasks, async task => {
        await phaseGenerate.addTask({
          creatorId: proUser.lastRoleId,
          ...task
        });
      });

      const phase = phaseGenerate.phase!;
      if (_.isEmpty(phase.tasks)) throw GraphQLError.notFound('tasks');

      const paymentGenerate = new Test.PaymentGenerate(client, ctx);
      await paymentGenerate.createCharge(inputData.charge);
      await paymentGenerate.createPayment({});

      const payment = paymentGenerate.payment!;
      const charge = paymentGenerate.charge!;

      await phaseGenerate.updateLastTask({
        paymentId: payment.id
      });

      return {
        users,
        contract,
        phase,
        charge
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
  it('should allow admin user to fund phase', async () => {
    const adminUser = _.find(outputData.users, { email: Email.Admin });
    const phase = _.get(outputData, 'phase');

    const { data, errors } = await execQuery<TQuery>(
      ADMIN_FUND_PHASE_MUTATION,
      {
        phaseId: _.get(phase, 'id')
      },
      adminUser
    );

    Test.Check.noErrors(errors);

    const result = data?.adminFundPhase;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        id: _.get(phase, 'id'),
        name: _.get(phase, 'name'),
        description: _.get(phase, 'description'),
        divisionTrade: _.get(phase, 'divisionTrade'),
        actualMaterialCost: _.get(phase, 'actualMaterialCost'),
        actualLaborCost: _.get(phase, 'actualLaborCost'),
        actualOtherCost: _.get(phase, 'actualOtherCost'),
        order: _.get(phase, 'order'),
        contract: {
          id: _.get(outputData, ['contract', 'id'])
        }
      },
      requiredFieldSet
    );
  });

  // error
  describe('', () => {
    const ctx = { sql, events: [] };

    let adminUser: Test.TUser | undefined;
    let charge: PaymentOperation | undefined;
    let phase: Test.TPhase | undefined;

    before(async () => {
      adminUser = _.find(outputData.users, { email: Email.Admin });
      charge = _.get(outputData, 'charge');
      phase = _.get(outputData, 'phase');

      await getClient(async client => {
        await PaymentOperationModel.update.exec(
          client,
          {
            id: _.get(charge, 'id')!,
            status: PaymentOperationStatus.Succeeded
          },
          ctx
        );
      });
    });

    after(async () => {
      await getClient(async client => {
        await PaymentOperationModel.update.exec(
          client,
          {
            id: _.get(charge, 'id')!,
            status: PaymentOperationStatus.Pending
          },
          ctx
        );
      });
    });

    it('forbidden phase is already funded', async () => {
      const { errors } = await execQuery<TQuery>(
        ADMIN_FUND_PHASE_MUTATION,
        {
          phaseId: _.get(phase, 'id')
        },
        adminUser
      );

      Test.Check.error(errors, new GraphQLError('Phase is already funded'));
    });
  });

  describe('', () => {
    const ctx = { sql, events: [] };

    let adminUser: Test.TUser | undefined;
    let contract: Contract | undefined;
    let phase: Test.TPhase | undefined;

    before(async () => {
      adminUser = _.find(outputData.users, { email: Email.Admin });
      contract = _.get(outputData, 'contract');
      phase = _.get(outputData, 'phase');

      await getClient(async client => {
        await ContractModel.update.exec(
          client,
          {
            id: _.get(contract, 'id')!,
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
            id: _.get(contract, 'id')!,
            status: ContractStatus.WaitingReview
          },
          ctx
        );
      });
    });

    it('forbidden if the contract is completed', async () => {
      const { errors } = await execQuery<TQuery>(
        ADMIN_FUND_PHASE_MUTATION,
        {
          phaseId: _.get(phase, 'id')
        },
        adminUser
      );

      Test.Check.error(errors, new GraphQLError('Contract is ended', 403));
    });
  });

  it('phase not found', async () => {
    const adminUser = _.find(outputData.users, { email: Email.Admin });

    const { errors } = await execQuery<TQuery>(
      ADMIN_FUND_PHASE_MUTATION,
      {
        phaseId: _.get(adminUser, 'id')
      },
      adminUser
    );

    Test.Check.error(errors, GraphQLError.notFound('phase'));
  });

  it('only admin have access', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });

    const { errors } = await execQuery<TQuery>(
      ADMIN_FUND_PHASE_MUTATION,
      {
        phaseId: _.get(proUser, 'id')
      },
      proUser
    );

    Test.Check.error(errors, GraphQLError.forbidden());
  });
});
