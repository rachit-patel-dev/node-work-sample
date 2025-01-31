/*external modules*/
import _ from 'lodash';
import moment from 'moment';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Contract, ContractPermissionResult } from '../../../../../db/types/contract';
import { Collaborator, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { TrackTime } from '../../../../../db/types/trackTime';
import { WorkLog } from '../../../../../gql/resolvers/Types/WorkLog';
import { Task } from '../../../../../db/types/task';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
/*other*/
import { Test } from '../../../../helpers/Test';
import { safeHtml } from '../../../../../utils/safeHtml';

type TQuery = { setWorkLog: WorkLog };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}

const enum ContractName {
  WorkLog = 'WorkLog'
}

interface OutputData {
  users: Test.TUser[];
  contract: Contract;
  collaborator: Collaborator;
  task: Task;
  trackTime: TrackTime;
}

const requiredFieldSet: Test.TFieldSet<any> = {
  scalar: ['id', 'time', 'date', 'notes'],
  object: ['task', 'role']
};

const SET_WORK_LOG_MUTATION = `mutation ($taskId: ID!, $input: SetWorkLogInput!) {
  setWorkLog(taskId: $taskId, input: $input) {
      id
      time
      date

      notes
      startTime
      endTime

      task {
        id
      }
      role {
        id
      }
      track {
        id
      }
  }
}`;

describe('gql/resolvers/Mutation/workLog/setWorkLog', () => {
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
        email: Email.Collaborator,
        role: {
          name: UserRole.Pro
        }
      }
    ],
    collaborator: {
      permissions: CollaboratorPermission.Read
    },
    invite: {
      firstName: 'test',
      inviteMessage: 'test message',
      type: InviteType.ContractCollaborator,
      userRole: UserRole.Pro
    },
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.WorkLog
    },
    phase: {
      name: 'track time',
      order: 100
    },
    task: {
      name: 'track time task',
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
    setWorkLogInput: {
      time: 4,
      notes: '<test>',
      date: new Date()
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

      const collaboratorUser = _.find(users, { email: Email.Collaborator });
      if (!collaboratorUser) throw GraphQLError.notFound('collaborator');

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
        name: ContractName.WorkLog
      });
      if (!contract) throw GraphQLError.notFound('contract');

      const inviteGenerate = new Test.InviteGenerate(client, ctx);
      await inviteGenerate.create({
        ...inputData.invite,
        email: Email.Collaborator,
        invitedById: homeUser.lastRoleId
      });

      const invite = inviteGenerate.invite!;

      const collaboratorGenerate = new Test.CollaboratorGenerate(client, ctx);
      await collaboratorGenerate.create({
        roleId: collaboratorUser.lastRoleId,
        inviteId: invite.id,
        contractId: contract.id,
        invitedById: proUser.lastRoleId,
        approvedById: homeUser.lastRoleId,
        userRole: collaboratorUser.role!.name,
        email: Email.Collaborator,
        ...inputData.collaborator
      });

      const collaborator = collaboratorGenerate.collaborator!;

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
        ...inputData.task,
        paymentId: payment.id
      });

      const phase = phaseGenerate.phase!;

      if (!phase.tasks) throw GraphQLError.notFound('tasks');

      const task = phase.tasks[0]!;

      const trackTimeGenerate = new Test.TrackTimeGenerate(client, ctx);
      await trackTimeGenerate.start({
        contractId: contract.id,
        roleId: collaboratorUser.lastRoleId
      });

      const trackTime = trackTimeGenerate.trackTime!;

      return {
        users,
        contract,
        collaborator,
        trackTime,
        task
      };
    });
  });

  after(async () => {
    const ctx = { sql, events: [] };
    await getClientTransaction(async client => {
      await CollaboratorModel.remove.exec(
        client,
        {
          collaboratorId: outputData.collaborator.id
        },
        ctx
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
  it('should allow to set work log', async () => {
    const collaboratorUser = _.find(outputData.users, {
      email: Email.Collaborator
    });

    const { data, errors } = await execQuery<TQuery>(
      SET_WORK_LOG_MUTATION,
      {
        taskId: _.get(outputData, ['task', 'id']),
        input: {
          trackTimeId: _.get(outputData, ['trackTime', 'id']),
          ..._.get(inputData, 'setWorkLogInput')
        }
      },
      collaboratorUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.setWorkLog;
    if (!result) throw GraphQLError.notFound('data');

    const setWorkLogInput = _.get(inputData, 'setWorkLogInput');

    Test.Check.data(
      result,
      {
        time: _.get(setWorkLogInput, 'time'),
        date: {
          $check: 'equal',
          $value: _.get(setWorkLogInput, 'date'),
          $func: (date: Date) => moment(date).format('YYYY.MM.DD')
        },
        notes: safeHtml(_.get(setWorkLogInput, 'notes')),
        startTime: {
          $check: '===',
          $value: null
        },
        endTime: {
          $check: '===',
          $value: null
        },
        'task.id': _.get(outputData, ['task', 'id']),
        'role.id': _.get(collaboratorUser, 'lastRoleId'),
        'track.id': _.get(outputData, ['trackTime', 'id'])
      },
      requiredFieldSet
    );
  });

  // error
  it("other user have't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });

    const { errors } = await execQuery<TQuery>(
      SET_WORK_LOG_MUTATION,
      {
        taskId: _.get(outputData, ['task', 'id']),
        input: {
          trackTimeId: _.get(outputData, ['trackTime', 'id']),
          ..._.get(inputData, 'setWorkLogInput')
        }
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('contract not found by task', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });

    const { errors } = await execQuery<TQuery>(
      SET_WORK_LOG_MUTATION,
      {
        taskId: _.get(otherUser, 'id'),
        input: {
          trackTimeId: _.get(outputData, ['trackTime', 'id']),
          ..._.get(inputData, 'setWorkLogInput')
        }
      },
      otherUser
    );

    Test.Check.error(errors, GraphQLError.notFound('contract'));
  });
});
