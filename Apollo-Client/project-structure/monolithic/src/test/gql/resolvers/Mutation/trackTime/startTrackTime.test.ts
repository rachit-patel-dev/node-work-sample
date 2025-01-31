/*external modules*/
import _ from 'lodash';
import moment from 'moment';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import {
  Contract,
  ContractPermissionResult
} from '../../../../../db/types/contract';
import {
  Collaborator,
  CollaboratorPermission
} from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { TrackTime } from '../../../../../db/types/trackTime';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { startTrackTime: TrackTime };

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
}

const requiredFieldSet: Test.TFieldSet<any> = {
  scalar: ['id', 'startTime'],
  object: ['contract', 'role']
};

const START_TRACK_TIME_MUTATION = `mutation ($contractId: ID!) {
  startTrackTime(contractId: $contractId) {
      id
      startTime
      endTime

      contract {
        id
      }
      role {
        id
      }
  }
}`;

describe('gql/resolvers/Mutation/trackTime/startTrackTime', () => {
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

      return {
        users,
        contract,
        collaborator
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
  it('should allow to start track time', async () => {
    const collaboratorUser = _.find(outputData.users, {
      email: Email.Collaborator
    });

    const { data, errors } = await execQuery<TQuery>(
      START_TRACK_TIME_MUTATION,
      {
        contractId: _.get(outputData, ['contract', 'id'])
      },
      collaboratorUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.startTrackTime;
    if (!result) throw GraphQLError.notFound('data');

    Test.Check.data(
      result,
      {
        startTime: {
          $check: 'equal',
          $value: moment().toDate(),
          $func: (date: Date) => moment(date).format('YYYY.MM.DD HH.mm')
        },
        endTime: {
          $check: '===',
          $value: null
        },
        'contract.id': _.get(outputData, ['contract', 'id']),
        'role.id': _.get(collaboratorUser, 'lastRoleId')
      },
      requiredFieldSet
    );
  });

  // error
  it('user must be Pro', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });

    const { errors } = await execQuery<TQuery>(
      START_TRACK_TIME_MUTATION,
      {
        contractId: _.get(outputData, ['contract', 'id'])
      },
      homeUser
    );

    Test.Check.error(
      errors,
      new GraphQLError(ContractPermissionResult.BadRole, 403)
    );
  });

  it("other user have't access to contract", async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });

    const { errors } = await execQuery<TQuery>(
      START_TRACK_TIME_MUTATION,
      {
        contractId: _.get(outputData, ['contract', 'id'])
      },
      otherUser
    );

    Test.Check.error(
      errors,
      new GraphQLError(ContractPermissionResult.NotContractUser, 403)
    );
  });
});
