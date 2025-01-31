/*external modules*/
import * as assert from 'assert';
import _ from 'lodash';
import { Job } from 'bull';
/*DB*/
import { getClient, getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Collaborator, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { Task } from '../../../../../db/types/task';
import { DecisionSelectionType, DecisionStatus } from '../../../../../db/types/decision';
import { ContractPermissionResult } from '../../../../../db/types/contract';
/*models*/
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
import { UserModel } from '../../../../../db/models/UserModel';
import { DecisionModel } from '../../../../../db/models/DecisionModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { Decision } from '../../../../../gql/resolvers/Types/Decision';
/*other*/
import jobWorker from '../../../../../jobs';
import { Test } from '../../../../helpers/Test';
import { sendNotification } from '../../../../../notifications';

type TQuery = { deleteDecision: Decision };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}

const enum ContractName {
  Chat = 'Chat',
  Decision = 'Decision'
}

interface OutputData {
  users: Test.TUser[];
  project: Test.TProject;
  decision: Test.TDecision;
  task: Task;
  collaborators: Collaborator[];
}

const requiredFieldSet: Test.TFieldSet<Decision> = {
  scalar: ['id', 'selectionType', 'dueDate', 'status', 'allowance'],
  object: ['task', 'createdBy'],
  array: ['decisionMakers', 'options']
};

const DELETE_DECISION_MUTATION = `mutation ($decisionId: ID!) {
  deleteDecision(decisionId: $decisionId) {
      id
      selectionType
      notes
      dueDate
      allowance
      status

      task {
        id
      }
      createdBy {
        id
      }
      result {
        id
      }

      decisionMakers {
        id
      }
      options {
        id
        option
        cost
      }
  }
}`;

describe('gql/resolvers/Mutation/decisions/delete', () => {
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
        email: Email.Collaborator + CollaboratorPermission.Write + UserRole.Pro,
        role: {
          name: UserRole.Pro
        }
      }
    ],
    collaborators: [
      {
        permissions: CollaboratorPermission.Write,
        invite: {
          firstName: 'test pro',
          inviteMessage: 'test pro message',
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
      name: ContractName.Decision
    },
    phase: {
      name: 'decision',
      order: 100
    },
    task: {
      name: 'decision task',
      order: 100
    },
    payment: {
      payoutRequestedAt: new Date(),
      operation: {
        amount: 100,
        stripeId: '1',
        availableAt: new Date()
      }
    },
    decision: {
      title: 'test',
      dueDate: new Date(),
      notes: '<test>',
      selectionType: DecisionSelectionType.Single,
      options: [
        {
          option: '>test<',
          cost: 1
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
        name: ContractName.Decision
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

      const paymentGenerate = new Test.PaymentGenerate(client, ctx);
      await paymentGenerate.createCharge(inputData.payment.operation);
      await paymentGenerate.createPayment(inputData.payment);

      const payment = paymentGenerate.payment!;

      const phaseGenerate = new Test.PhaseGenerate(client, ctx);
      await phaseGenerate.create({
        contractId: contract.id,
        ...inputData.phase
      });
      await phaseGenerate.addTask({
        creatorId: homeUser.lastRoleId,
        paymentId: payment.id,
        ...inputData.task
      });

      const phase = phaseGenerate.phase!;

      if (!phase.tasks) throw GraphQLError.notFound('tasks');

      const task = phase.tasks[0]!;

      const decisionGenerate = new Test.DecisionGenerate(client, ctx);
      await decisionGenerate.create({
        taskId: task.id,
        dueDate: _.get(inputData, ['decision', 'dueDate']),
        createdById: _.get(proUser, 'lastRoleId'),
        title: _.get(inputData, ['decision', 'title'])
      });

      const { option, cost } = _.get(inputData, ['decision', 'options', 0]);
      await decisionGenerate.addOption({
        createdById: _.get(proUser, 'lastRoleId'),
        option,
        cost
      });
      await decisionGenerate.addMakers({
        makerIds: [_.get(homeUser, 'lastRoleId')]
      });

      const decision = decisionGenerate.decision!;

      return {
        users,
        project,
        task,
        collaborators,
        decision
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };

    await getClientTransaction(async client => {
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

  // error
  describe('', async () => {
    let decision: Test.TDecision | undefined;
    let proUser: Test.TUser | undefined;

    before(async () => {
      const ctx = { sql, events: [] };

      decision = _.get(outputData, 'decision');
      if (!decision) throw GraphQLError.notFound('decision');

      proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro');

      await getClient(async client => {
        await DecisionModel.update.exec(
          client,
          {
            id: _.get(decision!, 'id'),
            status: DecisionStatus.Actioned
          },
          ctx
        );
      });
    });

    after(async () => {
      const ctx = { sql, events: [] };

      await getClient(async client => {
        await DecisionModel.update.exec(
          client,
          {
            id: _.get(decision!, 'id'),
            status: DecisionStatus.Draft
          },
          ctx
        );
      });
    });

    it("can't delete decision after actioned", async () => {
      const { errors } = await execQuery<TQuery>(
        DELETE_DECISION_MUTATION,
        {
          decisionId: _.get(decision, 'id')
        },
        proUser
      );

      Test.Check.error(errors, new GraphQLError("You can't delete decision after actioned"));
    });
  });

  it("not owner can't delete decision", async () => {
    const proCollaborator = _.find(outputData.users, {
      email: Email.Collaborator + CollaboratorPermission.Write + UserRole.Pro
    });
    if (!proCollaborator) throw GraphQLError.notFound('pro collaborator');

    const decision = _.get(outputData, 'decision');

    const { errors } = await execQuery<TQuery>(
      DELETE_DECISION_MUTATION,
      {
        decisionId: _.get(decision, 'id')
      },
      proCollaborator
    );

    Test.Check.error(errors, GraphQLError.forbidden());
  });

  it("other user have't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });

    const decision = _.get(outputData, 'decision');

    const { errors } = await execQuery<TQuery>(
      DELETE_DECISION_MUTATION,
      {
        decisionId: _.get(decision, 'id')
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('decision not found', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('owner');

    const { errors } = await execQuery<TQuery>(
      DELETE_DECISION_MUTATION,
      {
        decisionId: _.get(homeUser, 'lastRoleId')
      },
      homeUser
    );

    Test.Check.error(errors, GraphQLError.notFound('decision'));
  });

  // success
  describe('', () => {
    let job: Job;

    let proUser: Test.TUser | undefined;
    let decision: Test.TDecision | undefined;

    before(async () => {
      proUser = _.find(outputData.users, { email: Email.Pro });
      if (!proUser) throw GraphQLError.notFound('pro');

      decision = _.get(outputData, 'decision');
      if (!decision) throw GraphQLError.notFound('decision');

      job = await sendNotification('decisionSubmitted', {
        decisionId: decision.id
      });

      await getClient(async client => {
        const updatedDecision = await DecisionModel.update.exec(
          client,
          {
            id: decision!.id,
            decisionSubmittedJobId: String(job.id)
          },
          { sql, events: [] }
        );
        if (!updatedDecision) throw GraphQLError.notFound('decision');
      });
    });

    it('allow to delete decision', async () => {
      const { data, errors } = await execQuery<TQuery>(
        DELETE_DECISION_MUTATION,
        {
          decisionId: _.get(decision, 'id')
        },
        proUser
      );

      Test.Check.noErrors(errors, 'error');

      const result = data?.deleteDecision;
      if (!result) throw GraphQLError.notFound('data');

      Test.Check.data(
        result,
        {
          id: {
            $check: 'equal',
            $value: _.get(decision, 'id'),
            $eMessage: () => 'Incorrect decision ID'
          }
        },
        requiredFieldSet
      );

      const deletedJob = await jobWorker.getQueue('send-notification').getJob(job.id);
      assert.ok(_.isEmpty(deletedJob), 'Job must be deleted');
    });
  });
});
