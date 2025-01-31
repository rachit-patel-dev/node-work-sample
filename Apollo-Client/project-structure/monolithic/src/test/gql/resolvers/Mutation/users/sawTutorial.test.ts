/*external modules*/
import _ from 'lodash';
import moment from 'moment';
import * as assert from 'assert';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Contract } from '../../../../../db/types/contract';
import { Collaborator, CollaboratorPermission } from '../../../../../db/types/collaborator';
import { InviteType } from '../../../../../db/types/invite';
import { Tutorials } from '../../../../../db/types/userTutorials';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
import { CollaboratorModel } from '../../../../../db/models/CollaboratorModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { UserTutorials } from '../../../../../gql/resolvers/Types/UserTutorials';
/*other*/
import { Test } from '../../../../helpers/Test';

type TQuery = { userSawTutorial: UserTutorials };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}

const enum ContractName {
  UserTutorials = 'UserTutorials'
}

interface OutputData {
  users: Test.TUser[];
  contract: Contract;
  collaborators: Collaborator[];
}

const requiredFieldSet: Test.TFieldSet<UserTutorials> = {
  scalar: ['userId', 'tutorial'],
  object: ['user'],
  array: []
};

const USER_SAW_TUTORIAL_MUTATION = `mutation($tutorial: Tutorials!) {
  userSawTutorial(tutorial: $tutorial) {
      userId
      tutorial

      createdAt
      updatedAt

      user {
        id

        tutorials {
          userId
          tutorial
        }
      }
  }
}`;

describe('gql/resolvers/Mutation/users/userSawTutorial', () => {
  let outputData: OutputData;

  const inputData = {
    users: [
      {
        email: Email.Home,
        tutorial: [],
        role: {
          name: UserRole.HomeOwner
        }
      },
      {
        email: Email.Pro,
        tutorial: [Tutorials.DetectTone],
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.Other,
        tutorial: [],
        role: {
          name: UserRole.Pro
        }
      },
      {
        email: Email.Collaborator + CollaboratorPermission.Read + UserRole.Pro,
        tutorial: [],
        role: {
          name: UserRole.Pro
        }
      }
    ],
    collaborators: [
      {
        permissions: CollaboratorPermission.Read,
        invite: {
          firstName: 'test',
          inviteMessage: 'test message',
          type: InviteType.ContractCollaborator,
          userRole: UserRole.Pro
        }
      }
    ],
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
      name: ContractName.UserTutorials
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
          await userGenerate.addTutorials(userData.tutorial);

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
        name: ContractName.UserTutorials
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

      return {
        users,
        contract,
        collaborators
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

  // success
  it('should allow to saw new tutorial', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('user');

    const { data, errors } = await execQuery<TQuery>(
      USER_SAW_TUTORIAL_MUTATION,
      {
        tutorial: Tutorials.DetectTone
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.userSawTutorial;
    if (!result) throw GraphQLError.notFound('data');

    assert.ok(_.size(result.user.tutorials) > 0, 'User must be have listened tutorials');

    Test.Check.data(
      result,
      {
        userId: homeUser.id,
        tutorial: Tutorials.DetectTone,
        createdAt: {
          $check: '===',
          $value: new Date(),
          $func: value => moment(value).format('YYYY:MM:DD HH:mm')
        },
        updatedAt: {
          $check: '===',
          $value: new Date(),
          $func: value => moment(value).format('YYYY:MM:DD HH:mm')
        },
        user: {
          id: homeUser.id,
          tutorials: {
            $check: 'every',
            $value: tutorial => _.isEqual(tutorial, { userId: homeUser.id, tutorial: Tutorials.DetectTone })
          }
        }
      },
      requiredFieldSet
    );
  });

  it('should allow to re saw tutorial', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    if (!homeUser) throw GraphQLError.notFound('user');

    const { data, errors } = await execQuery<TQuery>(
      USER_SAW_TUTORIAL_MUTATION,
      {
        tutorial: Tutorials.DetectTone
      },
      homeUser
    );

    Test.Check.noErrors(errors, 'error');

    const result = data?.userSawTutorial;
    if (!result) throw GraphQLError.notFound('data');

    assert.ok(_.size(result.user.tutorials) > 0, 'User must be have listened tutorials');

    Test.Check.data(
      result,
      {
        userId: homeUser.id,
        tutorial: Tutorials.DetectTone,
        createdAt: {
          $check: '===',
          $value: new Date(),
          $func: value => moment(value).format('YYYY:MM:DD HH:mm')
        },
        updatedAt: {
          $check: '===',
          $value: new Date(),
          $func: value => moment(value).format('YYYY:MM:DD HH:mm')
        },
        user: {
          id: homeUser.id,
          tutorials: {
            $check: 'every',
            $value: tutorial => _.isEqual(tutorial, { userId: homeUser.id, tutorial: Tutorials.DetectTone })
          }
        }
      },
      requiredFieldSet
    );

    assert.ok(result.createdAt !== result.updatedAt, 'createdAt and updatedAt must be difference after re saw');
  });

  // error
  it('user not found', async () => {
    const otherUser = _.find(outputData.users, { email: Email.Other });
    if (!otherUser) throw GraphQLError.notFound('user');

    const { errors } = await execQuery<TQuery>(
      USER_SAW_TUTORIAL_MUTATION,
      {
        tutorial: Tutorials.DetectTone
      },
      {
        ...otherUser,
        id: otherUser.lastRoleId
      }
    );

    Test.Check.error(errors, GraphQLError.notFound('user'));
  });
});
