/*external modules*/
import _ from 'lodash';
import async from 'async';
import { Job } from 'bull';
/*DB*/
import * as db from '../../../db';
import { User, USER_TABLE } from '../../../db/types/user';
import { ROLE_TABLE, UserRole } from '../../../db/types/role';
import { Invite, INVITE_TABLE } from '../../../db/types/invite';
import { Contract, CONTRACT_TABLE } from '../../../db/types/contract';
import { Collaborator, COLLABORATOR_TABLE, CollaboratorPermission } from '../../../db/types/collaborator';
import { USER_VIEW_POINT_TABLE, ViewPoint } from '../../../db/types/userViewPoint';
/*models*/
import { UserViewPointModel } from '../../../db/models/UserViewPointModel';
import { ContractModel } from '../../../db/models/ContractModel';
import { RoleModel, UserWithRole } from '../../../db/models/RoleModel';
/*GQL*/
import { GraphQLError } from '../../../gql';
/*other*/
import jobWorker from '../../index';
import { logger } from '../../../logger';
import { config } from '../../../config';
import { EmailTemplate } from '../../../notifications/emails';
import { PushNotificationType } from '../../../notifications/push';
import { SendPushNotificationOptions } from '../send-push-notification';
import { ControlledEmailType } from '../send-email-controlled';
import { ReminderEmailType } from '../reminder-email';

export interface CollaboratorCreatedOptions {
  collaboratorId: Collaborator['id'];
}

/**
 * Asynchronously handles the creation of a collaborator.
 * 
 * @param job - The job object containing the collaborator creation options.
 * @returns A promise that resolves to void.
 */
export async function collaboratorCreatedConsumer(job: Job<CollaboratorCreatedOptions>): Promise<void> {
  const scope = 'collaborator-created';

  logger.info(`Started: ${scope}.`, job.data);

  const ctx = { sql: db.sql, db, events: [] };
  const { collaboratorId } = job.data;

  const results = await db.getClient(async client => {
    const {
      rows: [collaborator]
    } = await client.query<
      Collaborator & {
        invite?: Invite;
        user?: User;
        contract: Contract;
      }
    >(
      db.sql`
        SELECT cot.*,
               row_to_json(it.*) AS "invite",
               row_to_json(ut.*) AS "user",
               row_to_json(ct.*) AS "contract"
        FROM ${COLLABORATOR_TABLE} AS cot
        LEFT JOIN ${INVITE_TABLE} AS it ON (it."id" = cot."inviteId")
        LEFT JOIN ${ROLE_TABLE} AS rt ON (rt."id" = cot."roleId")
        LEFT JOIN ${USER_TABLE} AS ut ON (ut."id" = rt."userId")
        LEFT JOIN ${USER_VIEW_POINT_TABLE} uview_point ON uview_point."roleId" = rt.id
          AND uview_point."viewPoint" = ${ViewPoint.Match}
        INNER JOIN ${CONTRACT_TABLE} AS ct ON (ct."id" = cot."contractId")
        WHERE cot."id" = ${collaboratorId}
      `
    );

    if (!collaborator) throw GraphQLError.notFound('collaborator');

    const owner = await ContractModel.getOwner.exec(client, { contractId: collaborator.contractId }, ctx);

    const pro = await RoleModel.getUser.exec(client, { roleId: collaborator.contract.partnerId! }, ctx);

    const { rows: collaboratorsToNotify } = await client.query<UserWithRole>(
      db.sql`
        SELECT ut.*,
               rt."name" AS "roleName",
               rt."id" AS "roleId"
        FROM ${COLLABORATOR_TABLE} AS ct
        LEFT JOIN ${ROLE_TABLE} AS rt ON (rt."id" = ct."roleId")
        LEFT JOIN ${USER_TABLE} AS ut ON (ut."id" = rt."userId")
        WHERE ct."contractId" = ${collaborator.contractId}
          AND ct."permissions" = ${CollaboratorPermission.Full}
      `
    );

    const inviter = await RoleModel.getUser.exec(client, { roleId: collaborator.invitedById }, ctx);
    if (!inviter) throw GraphQLError.notFound('inviter');

    // exclude empty records and the inviter as well
    const usersToNotify = _.compact([owner, pro, ...collaboratorsToNotify]).filter(
      user => user.id && user.id !== inviter.id
    );

    return {
      collaborator,
      inviter,
      usersToNotify
    };
  });

  const {
    collaborator,
    collaborator: { contract },
    inviter,
    usersToNotify
  } = results;

  const address = _.get(_.split(contract.name, '/'), 0);
  const projectName = _.get(_.split(address, ','), 0);
  const subject = `${inviter.firstName} invited new collaborator to "${projectName}"`;

  let collaboratorName = 'New Collaborator';
  if (collaborator.user) {
    collaboratorName = `${collaborator.user.firstName} ${collaborator.user.lastName}`;
  } else if (collaborator.invite) {
    collaboratorName = collaborator.invite.firstName;
  }

  await db.getClient(async client => {
    await async.each(
      _.filter(usersToNotify, 'roleId') as (UserWithRole & {
        roleId: string;
      })[],
      async user => {
        const canConfirm = !collaborator.approvedById && collaborator.userRole === user.role?.name;

        const findData: UserViewPointModel.find.TArgs = {
          roleId: user.roleId,
          viewPoint: ViewPoint.Collaborators,
          contractId: contract.id
        };

        const userViewPoint = await UserViewPointModel.find.exec(client, findData, ctx);

        if (userViewPoint?.notified) {
          return;
        }

        const push: SendPushNotificationOptions = {
          roleId: user.roleId,
          notification: {
            title: 'Collaborator Added',
            body: `${collaboratorName} added as ${collaborator.userRole}`
          },
          options: {
            type: PushNotificationType.ContractCollaboratorCreated,
            contractId: collaborator.contractId,
            collaboratorId: collaborator.id
          }
        };

        await jobWorker.getQueue('send-push-notification').add(push);

        if (user.email) {
          const emailData: EmailTemplate = {
            to: user.email,
            template: 'contractCollaboratorCreated',
            subject,
            locals: {
              userName: user.firstName || user.email,
              inviterName: inviter.firstName || inviter.email,
              contractName: projectName,
              canConfirm,
              url: config.utils.clientUrl(`manage/${contract.id}/collaborators`),
              btnText: canConfirm ? 'Confirm Collaborator' : 'View Collaborators'
            }
          };

          let email: UserViewPointModel.ExtendedEmailOptions;
          if (canConfirm) {
            const typeInvite =
              collaborator.userRole === UserRole.Pro
                ? ReminderEmailType.ProApproveAnotherProAsCollaborator
                : ReminderEmailType.OwnerApproveAnotherOwnerAsCollaborator;

            email = {
              data: {
                emailData,
                collaboratorId,
                type: typeInvite
              },
              type: ControlledEmailType.Reminder
            };
          } else {
            email = {
              data: emailData,
              type: ControlledEmailType.Default
            };
          }

          if (canConfirm) {
            await db.getClientTransaction(async client => {
              const data: UserViewPointModel.init.TArgs = {
                roleId: user.roleId!,
                viewPoint: ViewPoint.Collaborators,
                contractId: contract.id,
                repeatTimes: 2,
                email
              };

              return UserViewPointModel.init.exec(client, data, ctx);
            });
          } else {
            await UserViewPointModel.addDelayedEmail.exec(
              client,
              {
                roleId: user.roleId,
                viewPoint: ViewPoint.Collaborators,
                contractId: contract.id,
                email
              },
              ctx
            );
          }
        } else {
          logger.warn(`${scope}: notification email not sent - no user email provided`, collaborator.user, job.data);
        }
      }
    );

    if (collaborator.roleId) {
      const findData: UserViewPointModel.find.TArgs = {
        roleId: collaborator.roleId,
        viewPoint: ViewPoint.Match
      };

      const userViewPoint = await UserViewPointModel.find.exec(client, findData, ctx);

      if (userViewPoint?.notified) {
        return;
      }

      const push: SendPushNotificationOptions = {
        roleId: collaborator.roleId,
        notification: {
          title: 'You are invited to collaborate',
          body: `${inviter.firstName} invited you to collaborate on ${projectName}`
        },
        options: {
          type: PushNotificationType.ContractCollaboratorInvited,
          contractId: contract.id,
          collaboratorId: collaborator.id
        }
      };

      await jobWorker.getQueue('send-push-notification').add(push);

      await db.getClientTransaction(async client => {
        const data: UserViewPointModel.init.TArgs = {
          roleId: collaborator.roleId!,
          viewPoint: ViewPoint.Match
        };

        return UserViewPointModel.init.exec(client, data, ctx);
      });
    }

    if (collaborator.user?.email) {
      const email: EmailTemplate = {
        to: collaborator.user.email,
        template: 'contractCollaboratorCreatedUser',
        subject: `You are invited to "${projectName}"`,
        locals: {
          userName: collaboratorName,
          inviterName: inviter.firstName || inviter.email,
          contractName: projectName,
          url: config.utils.clientUrl(`manage/${contract.id}/taskboard`)
        }
      };

      await jobWorker.getQueue('send-email-controlled').add({
        type: ControlledEmailType.Default,
        data: email
      });
    }
  });

  logger.info(`Completed: ${scope}.`, job.data);
}
