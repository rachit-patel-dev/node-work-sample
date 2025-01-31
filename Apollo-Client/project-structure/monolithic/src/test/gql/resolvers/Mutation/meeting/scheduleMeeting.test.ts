/*external modules*/
import _ from 'lodash';
import moment from 'moment';
/*DB*/
import { getClientTransaction, sql } from '../../../../../db';
import { UserRole } from '../../../../../db/types/role';
import { Contract, ContractPermissionResult } from '../../../../../db/types/contract';
import { ActionType } from '../../../../../db/types/actionType';
/*models*/
import { UserModel } from '../../../../../db/models/UserModel';
/*GQL*/
import { execQuery } from '../../..';
import { GraphQLError } from '../../../../../gql';
import { Meeting } from '../../../../../gql/resolvers/Types/Meeting';
/*other*/
import { Test } from '../../../../helpers/Test';
import { safeHtml } from '../../../../../utils/safeHtml';

type TQuery = { scheduleMeeting: Meeting };

const enum Email {
  Pro = 'pro@test.com',
  Home = 'home@test.com',
  Collaborator = 'collaborator@test.com',
  Other = 'other@test.com'
}

const enum ContractName {
  Meeting = 'Meeting'
}

interface OutputData {
  users: Test.TUser[];
  contract: Contract;
}

const requiredFieldSet: Test.TFieldSet<any> = {
  scalar: ['id', 'name', 'date', 'duration', 'details'],
  object: ['location', 'guests']
};

const SCHEDULE_MEETING_MUTATION = `mutation ($contractId: ID!, $input: MeetingCreateInput!) {
  scheduleMeeting(contractId: $contractId, input: $input) {
      id
      name
      date
      duration
      details

      location
      guests {
        id
        ... on MeetingGuestRole {
          role {
            id
          }
        }
        ... on MeetingGuestEmail {
          email
        }
      }
  }
}`;

describe('gql/resolvers/Mutation/meeting/scheduleMeeting', () => {
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
      }
    ],
    project: {
      matchData: {
        createdByOwner: true
      }
    },
    contract: {
      name: ContractName.Meeting
    },
    meeting: {
      name: 'test meeting',
      date: moment()
        .add(1, 'day')
        .toDate(),
      duration: 15,
      location: 'lat: 5.34 / lon: 7.324',
      details: '<h1>details</h1>'
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
        name: ContractName.Meeting
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
  it('should allow to schedule meeting', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });

    const homeUser = _.find(outputData.users, { email: Email.Home });
    const otherUser = _.find(outputData.users, { email: Email.Other });

    const { data, errors } = await execQuery<TQuery>(
      SCHEDULE_MEETING_MUTATION,
      {
        contractId: _.get(outputData, ['contract', 'id']),
        input: {
          ...inputData.meeting,
          guests: [
            {
              email: _.get(otherUser, 'email'),
              actionType: ActionType.Create
            },
            {
              memberId: _.get(homeUser, 'lastRoleId'),
              actionType: ActionType.Create
            }
          ]
        }
      },
      proUser
    );

    Test.Check.noErrors(errors);

    const result = data?.scheduleMeeting;
    if (!result) throw GraphQLError.notFound('data');

    const inputMeeting = _.get(inputData, 'meeting');

    Test.Check.data(
      result,
      {
        name: _.get(inputMeeting, 'name'),
        date: {
          $check: 'equal',
          $value: _.get(inputMeeting, 'date'),
          $func: date => moment(date).format('YYYY-MM-DD HH:mm')
        },
        duration: _.get(inputMeeting, 'duration'),
        details: safeHtml(_.get(inputMeeting, 'details')),
        location: _.get(inputMeeting, 'location')
      },
      requiredFieldSet
    );

    const guestWithEmail = _.find(result.guests, { email: Email.Other });
    if (!guestWithEmail) throw GraphQLError.notFound(`Guest with email`);

    const guestWithRole = _.find(result.guests, ['role.id', _.get(homeUser, 'lastRoleId')]);
    if (!guestWithRole) throw GraphQLError.notFound(`Guest with role`);
  });

  // error
  it("other user have't access to contract", async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const otherUser = _.find(outputData.users, { email: Email.Other });

    const { errors } = await execQuery<TQuery>(
      SCHEDULE_MEETING_MUTATION,
      {
        contractId: _.get(outputData, ['contract', 'id']),
        input: {
          ...inputData.meeting,
          guests: [
            {
              email: _.get(homeUser, 'email'),
              actionType: ActionType.Create
            }
          ]
        }
      },
      otherUser
    );

    Test.Check.error(errors, new GraphQLError(ContractPermissionResult.NotContractUser, 403));
  });

  it('the specified date cannot be in the past', async () => {
    const homeUser = _.find(outputData.users, { email: Email.Home });
    const proUser = _.find(outputData.users, { email: Email.Pro });

    const { errors } = await execQuery<TQuery>(
      SCHEDULE_MEETING_MUTATION,
      {
        contractId: _.get(outputData, ['contract', 'id']),
        input: {
          ...inputData.meeting,
          date: moment()
            .subtract(2, 'day')
            .toDate(),
          guests: [
            {
              email: _.get(homeUser, 'email'),
              actionType: ActionType.Create
            }
          ]
        }
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError(`The specified date cannot be in the past.`));
  });

  it('input must have memberId or email.', async () => {
    const proUser = _.find(outputData.users, { email: Email.Pro });

    const { errors } = await execQuery<TQuery>(
      SCHEDULE_MEETING_MUTATION,
      {
        contractId: _.get(outputData, ['contract', 'id']),
        input: {
          ...inputData.meeting,
          guests: [
            {
              actionType: ActionType.Create
            }
          ]
        }
      },
      proUser
    );

    Test.Check.error(errors, new GraphQLError(`Input must have memberId or email.`));
  });
});
