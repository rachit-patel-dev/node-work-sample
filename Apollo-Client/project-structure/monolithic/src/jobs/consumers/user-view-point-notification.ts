/*external modules*/
import _ from 'lodash';
import { Job } from 'bull';
import moment = require('moment');
/*DB*/
import * as db from '../../db';
import { Chat } from '../../db/types/chat';
import { ViewPoint } from '../../db/types/userViewPoint';
import { UserRole } from '../../db/types/role';
import { Contract } from '../../db/types/contract';
/*models*/
import { UserViewPointModel } from '../../db/models/UserViewPointModel';
import { RoleModel } from '../../db/models/RoleModel';
import { ContractModel } from '../../db/models/ContractModel';
/*GQL*/
/*other*/
import jobWorker from '..';
import { logger } from '../../logger';
import { config } from '../../config';
import { EmailTemplate } from '../../notifications/emails';
import { PushNotificationOptions, PushNotificationType } from '../../notifications/push';
import { SendPushNotificationOptions } from './send-push-notification';
import { naivePluralize } from '../../utils/pluralize';

export type UserViewPointNotificationOptions = {
  roleId: Chat['id'];
  extra?: {
    userRole: UserRole;
  };
} & (
  | {
      viewPoint: ViewPoint.Match;
    }
  | {
      viewPoint: Exclude<ViewPoint, 'Match'>;
      contractId: Contract['id'];
    }
);

/**
 * Sends a notification to a user based on their view point.
 * 
 * @param job - The job containing the notification options.
 * @returns A promise that resolves when the notification is sent.
 */
export async function userViewPointNotification(job: Job<UserViewPointNotificationOptions>) {
  const scope = 'user-view-point-notification';

  logger.info(`Started: ${scope}.`, job.data);

  const { roleId, viewPoint, extra } = job.data;
  const contractId = 'contractId' in job.data ? job.data.contractId : undefined;

  const ctx = { sql: db.sql, db, events: [] };

  const result = await db.getClient(async client => {
    const data: UserViewPointModel.getAmountOfMissedRecords.TArgs = {
      roleId,
      viewPoint,
      contractId
    };

    const results = await UserViewPointModel.getAmountOfMissedRecords.exec(client, data, ctx);

    if (!Number(results.count)) {
      return;
    }

    const user = await RoleModel.getUser.exec(client, { roleId }, ctx);
    if (!user) throw new Error(`${scope}: user not found!`);

    let contract: Contract | undefined;
    if (contractId) {
      contract = await ContractModel.findById.exec(client, { contractId }, ctx);
    }

    return { ...results, user, contract };
  });

  if (!result) {
    // stop if no missed data
    logger.info(`Canceled: ${scope}.`, job.data);
    return;
  }

  const { count, earliestDate, user, contract } = result;
  const daysAgo = Math.abs(moment(earliestDate).diff(moment(), 'days'));
  const { email, firstName, lastName } = user;

  let subject: string | undefined;
  let message: string | undefined;
  let pushOptions: PushNotificationOptions | undefined;
  let btnText = 'Go To XYZ';
  let url = '/';

  const times = naivePluralize(count, 'day', 'days');
  const address = _.get(_.split(contract?.name || '', '/'), 0);
  const projectName = _.get(_.split(address, ','), 0);
  /*dynamic content start*/
  switch (job.data.viewPoint) {
    case ViewPoint.Match:
      {
        if (extra?.userRole === UserRole.Pro) {
          subject = `${firstName}, you have ${count} unread invites for new projects`;
          message = `You have ${count} unread invites for new projects ${daysAgo} ${times} ago. Please respond to the prospective clients in the MATCH section so that you don't lose out new leads.`;
        } else {
          subject = `${firstName}, you have ${count} unread responses from Pros`;
          message = `You have ${count} unread responses for your new projects ${daysAgo} ${times} ago. Please respond to these pros in the MATCH section so that you can get started with your project.`;
        }
        btnText = 'REVIEW MATCH';
        url = `/match`;
        pushOptions = {
          type: PushNotificationType.GenericNotificationMatch
        };
      }
      break;
    case ViewPoint.Taskboard:
      {
        subject = `${firstName}, you have ${count} unread task updates`;
        message = `You have ${count} task updates ${daysAgo} ${times} ago at "${projectName}". Please review the Taskboard so that you may keep track of the project progress.`;
        btnText = 'REVIEW TASKBOARD';
        url = `/manage/${job.data.contractId}/taskboard`;
        pushOptions = {
          type: PushNotificationType.GenericNotificationTaskboard,
          contractId: job.data.contractId
        };
      }
      break;
    case ViewPoint.ChangeOrder:
      {
        subject = `[Action Required] you have ${count} new Change Orders`;
        message = `Please review your ${count} new Change Orders at "${projectName}" and decide so that your team can continue the progress without delay your project.`;
        btnText = 'REVIEW CHANGE ORDERS';
        url = `/manage/${job.data.contractId}/change-order`;
        pushOptions = {
          type: PushNotificationType.GenericNotificationChangeOrder,
          contractId: job.data.contractId
        };
      }
      break;
    case ViewPoint.Payment:
      {
        subject = `[Action Required] you have ${count} new Payment Request`;
        message = `Please review your ${count} new Payment Request at "${projectName}" and decide so that your team can continue the progress without delay your project.`;
        btnText = 'REVIEW PAYMENT';
        url = `/manage/${job.data.contractId}/payment`;
        pushOptions = {
          type: PushNotificationType.GenericNotificationPayment,
          contractId: job.data.contractId
        };
      }
      break;
    case ViewPoint.Collaborators:
      {
        subject = `[Action Required] you have ${count} new Collaborator approvals`;
        message = `Please review your ${count} new Collaborator approvals at "${projectName}". If there is any question, let your team know and figure out the next steps so that your team can continue the progress without delay your project.`;
        btnText = 'REVIEW COLLABORATORS';
        url = `/manage/${job.data.contractId}/collaborators`;
        pushOptions = {
          type: PushNotificationType.GenericNotificationCollaborator,
          contractId: job.data.contractId
        };
      }
      break;
    case ViewPoint.Documents:
      {
        subject = `${firstName}, you have ${count} new Documents uploaded to your project`;
        message = `Please review your ${count} new Documents at "${projectName}". If there is any question, discuss with your team and figure out the next steps so that your team can continue the progress without delay your project.`;
        btnText = 'REVIEW DOCUMENTS';
        url = `/manage/${job.data.contractId}/documents`;
        pushOptions = {
          type: PushNotificationType.GenericNotificationDocuments,
          contractId: job.data.contractId
        };
      }
      break;
    case ViewPoint.Messages:
      {
        subject = `${firstName}, you have ${count} unread messages`;
        message = `Please review your ${count} unread Messages at "${projectName}" so that you may keep up the latest discussion.`;
        btnText = 'REVIEW MESSAGES';
        url = `/manage/${job.data.contractId}/messages`;
        pushOptions = {
          type: PushNotificationType.GenericNotificationMessages,
          contractId: job.data.contractId
        };
      }
      break;
  }
  /*dynamic content end*/

  if (!subject || !message) {
    throw new Error(`${scope}: Something went wrong.`);
  }

  if (pushOptions) {
    const pushData: SendPushNotificationOptions = {
      roleId,
      notification: {
        title: subject,
        body: message
      },
      options: pushOptions
    };

    await jobWorker.getQueue('send-push-notification').add(pushData);
  }

  const userName = `${firstName} ${lastName}`;

  const emailData: EmailTemplate = {
    template: 'generic/generic-notification',
    to: email,
    subject: subject,
    locals: {
      receiverName: userName,
      message,
      btnText,
      url: config.utils.clientUrl(url)
    }
  };

  await jobWorker.getQueue('send-email').add(emailData);

  logger.info(`Completed: ${scope}.`, job.data);
}
