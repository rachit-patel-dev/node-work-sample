/*external modules*/
import _ from 'lodash';
import async from 'async';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { Phase as PhaseDB } from '../../../../../db/types/phase';
import { UserRole } from '../../../../../db/types/role';
import { Payment } from '../../../../../gql/resolvers/Payment';
import { PaymentOperation } from '../../../../../db/types/paymentOperation';
import { TaskStatus } from '../../../../../db/types/task';
import { Collaborator, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { Contract, ContractPermissionResult } from '../../../../../db/types/contract';
import { PAYMENT_HISTORY_TABLE } from '../../../../../db/types/paymentHistory';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
/*GQL*/
import { execQuery } from '../../../index';
import { GraphQLError } from '../../../../../gql';
import { Phase } from '../../../../../gql/resolvers/Types/Phase/Phase';
import { Task } from '../../../../../gql/resolvers/Types/Task/Task';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { declineFundPhase: Phase };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}
const enum ContractName {
  DeclineFundPhase = 'DeclineFundPhase'
}
const enum PhaseName {
  First = 'FIRST',
  Second = 'SECOND',
  Third = 'THIRD',
  Four = 'FOUR'
}
const enum TaskName {
  First = 'FIRST',
  Second = 'SECOND'
}

type PopulatedPayment = Payment & { charge: PaymentOperation; payout?: PaymentOperation };
type PopulatedTask = Task & {
  payment: PopulatedPayment;
};
type PopulatedPhase = PhaseDB & {
  tasks: Array<PopulatedTask>;
};

interface OutputData {
  users: Test.TUser[];
  collaborators: Collaborator[];
  contract: Contract;
  phases: Array<PopulatedPhase>;
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
    'order',
    'funded',
    'autoPayoutRequest',
    'createdAt',
    'updatedAt'
  ],
  object: ['contract'],
  array: ['tasks']
};
const DECLINE_FUND_PHASE_MUTATION = `mutation ($phaseId: ID!) {
  declineFundPhase(phaseId: $phaseId) {
    id
    name
    description
    divisionTrade
    actualMaterialCost
    actualLaborCost
    actualOtherCost
    order
    funded
    autoPayoutRequest

    chargeRequestedAt
    chargeApprovedAt

    createdAt
    updatedAt

    contract {
      id
    }

    tasks {
      id
    }
  }
}`;

describe('gql/resolvers/Mutation/payments/declineFundPhase', () => {
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
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.Pro,
        role: {
          name: UserRole.Pro
        }
      }
    ],
    collaborators: [
      {
        permissions: CollaboratorPermission.Full,
        invite: {
          firstName: 'test home',
          inviteMessage: 'test home message',
          type: InviteType.ProjectProInvite,
          userRole: UserRole.Pro
        }
      }
    ],
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.DeclineFundPhase
    },
    phases: [
      {
        name: PhaseName.First,
        order: 100,
        chargeRequestedAt: null,
        tasks: [
          {
            name: TaskName.First,
            materialCost: 100,
            laborCost: 100,
            otherCost: 100,
            markupPercent: 20,
            order: 500,
            status: TaskStatus.Done
          }
        ]
      },
      {
        name: PhaseName.Second,
        order: 100,
        chargeRequestedAt: new Date(),
        chargeApprovedAt: new Date(),
        tasks: [
          {
            name: TaskName.First,
            materialCost: 100,
            laborCost: 100,
            otherCost: 100,
            markupPercent: 20,
            order: 500,
            status: TaskStatus.Done,
            chargeApprovedAt: null
          }
        ]
      },
      {
        name: PhaseName.Third,
        order: 100,
        chargeRequestedAt: new Date(),
        tasks: [
          {
            name: TaskName.First,
            materialCost: 100,
            laborCost: 100,
            otherCost: 100,
            markupPercent: 20,
            order: 500,
            status: TaskStatus.Done,
            chargeApprovedAt: null
          }
        ]
      },
      {
        name: PhaseName.Four,
        order: 100,
        chargeRequestedAt: new Date(),
        tasks: [
          {
            name: TaskName.First,
            materialCost: 100,
            laborCost: 100,
            otherCost: 100,
            markupPercent: 20,
            order: 500,
            status: TaskStatus.Done,
            chargeApprovedAt: null
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

          await userGenerate.create({ email: userData.email });
          await userGenerate.setRole({ name: userData.role.name });

          return userGenerate.user!;
        })
      );

      const homeUser = _.find(users, { email: Email.Home });
      if (!homeUser) throw GraphQLError.notFound('owner');

      const proUser = _.find(users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro');

      const collaboratorUserFullPro = _.find(users, {
        email: Email.Collaborator + CollaboratorPermission.Full + UserRole.Pro
      });
      if (!collaboratorUserFullPro) throw GraphQLError.notFound('collaborator full pro');

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
        name: ContractName.DeclineFundPhase
      });
      if (!contract) throw GraphQLError.notFound('contract');

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

      const phases: OutputData['phases'] = await async.map(inputData.phases, async phaseInput => {
        const phaseGenerate = new Test.PhaseGenerate(client, ctx);
        await phaseGenerate.create({
          contractId: contract.id,
          ...(phaseInput as any)
        });

        await Promise.all(
          _.map(phaseInput.tasks, async taskInput => {
            await phaseGenerate.addTask({
              creatorId: proUser.lastRoleId,
              ...(taskInput as any)
            });
          })
        );

        const phase = phaseGenerate.phase!;
        if (_.isEmpty(phase.tasks)) throw GraphQLError.notFound('tasks');

        return phase;
      });

      return {
        users,
        collaborators,
        phases,
        contract
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      await client.query(
        sql`
            DELETE
            FROM ${PAYMENT_HISTORY_TABLE}
            WHERE true
        `
      );

      await Promise.all(
        _.map(outputData.collaborators, collaborator =>
          CollaboratorModel.remove.exec(
            client,
            {
              collaboratorId: collaborator.id
            },
            ctx
          )
        )
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
  it('should allow to decline fund phase', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const phase = _.find(outputData.phases, { name: PhaseName.Four });
    if (!phase) throw GraphQLError.notFound('phase');

    const { data, errors } = await execQuery<TQuery>(
      DECLINE_FUND_PHASE_MUTATION,
      {
        phaseId: _.get(phase, 'id')
      },
      homeUser
    );

    Test.Check.noErrors(errors);

    const result = data?.declineFundPhase;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        chargeRequestedAt: {
          $check: '===',
          $value: null
        },
        autoPayoutRequest: false
      },
      requiredFieldSet
    );
  });

  // error
  it(`only full home must have access`, async () => {
    const phase = _.find(outputData.phases, { name: PhaseName.Third });
    if (!phase) throw GraphQLError.notFound('phase');

    const proUser = _.find(outputData.users, { email: Email.Pro });

    const { errors } = await execQuery<TQuery>(
      DECLINE_FUND_PHASE_MUTATION,
      {
        phaseId: _.get(phase, 'id')
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.BadRole, 403));
  });

  it(`phase already approved`, async () => {
    const phase = _.find(outputData.phases, { name: PhaseName.Second });
    if (!phase) throw GraphQLError.notFound('phase');

    const homeUser = _.find(outputData.users, { email: Email.Home });

    const { errors } = await execQuery<TQuery>(
      DECLINE_FUND_PHASE_MUTATION,
      {
        phaseId: _.get(phase, 'id')
      },
      homeUser
    );

    Test.Check.error(errors, new GraphQLError(`Fund phase already approved.`));
  });

  it(`Fund phase not requested`, async () => {
    const phase = _.find(outputData.phases, { name: PhaseName.First });
    if (!phase) throw GraphQLError.notFound('phase');

    const homeUser = _.find(outputData.users, { email: Email.Home });

    const { errors } = await execQuery<TQuery>(
      DECLINE_FUND_PHASE_MUTATION,
      {
        phaseId: _.get(phase, 'id')
      },
      homeUser
    );

    Test.Check.error(errors, new GraphQLError(`Fund phase not requested.`));
  });

  it(`contract not found by phase`, async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const { errors } = await execQuery<TQuery>(
      DECLINE_FUND_PHASE_MUTATION,
      {
        phaseId: _.get(homeUser, 'id')
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('contract'));
  });
});
