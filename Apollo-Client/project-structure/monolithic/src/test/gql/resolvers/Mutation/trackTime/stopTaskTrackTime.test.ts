/*external modules*/
import _ from 'lodash';
import moment from 'moment';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Contract, ContractPermissionResult } from '../../../../../db/types/contract';
import { Collaborator, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { Task } from '../../../../../db/types/task';
import { WorkLog } from '../../../../../db/types/workLog';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { stopTaskTrackTime: WorkLog };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}

const enum ContractName {
  TrackTime = 'TrackTime'
}

interface OutputData {
  users: Test.TUser[];
  contract: Contract;
  collaborator: Collaborator;
  task: Task;
  workLog: WorkLog;
}

const requiredFieldSet: Test.TFieldSet<any> = {
  scalar: ['id', 'time', 'date'],
  object: ['task', 'role']
};

const STOP_TASK_TRACK_TIME_MUTATION = `mutation ($workLogId: ID!) {
  stopTaskTrackTime(workLogId: $workLogId) {
      id
      time
      date

      startTime
      endTime

      task {
        id
      }
      role {
        id
      }
  }
}`;

describe('gql/resolvers/Mutation/trackTime/stopTaskTrackTime', () => {
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
      name: ContractName.TrackTime
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
        name: ContractName.TrackTime
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

      const workLogGenerate = new Test.WorkLogGenerate(client, ctx);
      await workLogGenerate.start({
        taskId: task.id,
        roleId: collaboratorUser.lastRoleId
      });

      const workLog = workLogGenerate.workLog!;

      return {
        users,
        contract,
        collaborator,
        task,
        workLog
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
  it('should allow to stop task track time', async () => {
    const collaboratorUser = _.find(outputData.users, {
      email: Email.Collaborator
    });
    const workLog = _.get(outputData, 'workLog');

    const { data, errors } = await execQuery<TQuery>(
      STOP_TASK_TRACK_TIME_MUTATION,
      {
        workLogId: _.get(workLog, 'id')
      },
      collaboratorUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.stopTaskTrackTime;
    if (!result) throw GraphQLError.notFound('data');

    const time = moment(_.get(result, 'endTime')).valueOf() - moment(_.get(workLog, 'startTime')).valueOf();

    Test.Check.data(
      result,
      {
        id: _.get(workLog, 'id'),
        time: Math.floor(time / 1000),
        date: {
          $check: 'equal',
          $value: moment().toDate(),
          $func: (date: Date) => moment(date).format('YYYY.MM.DD')
        },
        startTime: {
          $check: 'equal',
          $value: moment().toDate(),
          $func: (date: Date) => moment(date).format('YYYY.MM.DD HH.mm')
        },
        endTime: {
          $check: 'equal',
          $value: moment().toDate(),
          $func: (date: Date) => moment(date).format('YYYY.MM.DD HH.mm')
        },
        'task.id': _.get(outputData, ['task', 'id']),
        'role.id': _.get(collaboratorUser, 'lastRoleId')
      },
      requiredFieldSet
    );
  });

  // error
  it("other user have't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });

    const { errors } = await execQuery<TQuery>(
      STOP_TASK_TRACK_TIME_MUTATION,
      {
        workLogId: _.get(outputData, ['workLog', 'id'])
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('work log not found', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });

    const { errors } = await execQuery<TQuery>(
      STOP_TASK_TRACK_TIME_MUTATION,
      {
        workLogId: _.get(otherUser, 'id')
      },
      otherUser
    );

    Test.Check.error(errors, GraphQLError.notFound('work log'));
  });
});
