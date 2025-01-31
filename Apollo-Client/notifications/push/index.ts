export enum PushNotificationType {
  TaskMoved = 'TaskMoved',
  TaskUpdated = 'TaskUpdated',
  TaskAssigneeChanged = 'TaskAssigneeChanged',
  TaskCommentCreated = 'TaskCommentCreated',
  ChangeOrderApproved = 'ChangeOrderApproved',
  ChangeOrderDeclined = 'ChangeOrderDeclined',
  ChangeOrderOutdated = 'ChangeOrderOutdated',
  ChangeOrderEdited = 'ChangeOrderEdited',
  ChangeOrderCreated = 'ChangeOrderCreated',
  ContractCollaboratorInvited = 'CollaboratorInvited',
  ContractCollaboratorCreated = 'ContractCollaboratorCreated',
  PayoutDeclined = 'PayoutDeclined',
  PayoutFailed = 'PayoutFailed',
  PayoutReleased = 'PayoutReleased',
  PayoutRequested = 'PayoutRequested',
  PaymentFailed = 'PaymentFailed',
  FundPhase = 'FundPhase',
  FundPhaseRequested = 'FundPhaseRequested',
  ContractEnded = 'ContractEnded',
  ContractStarted = 'ContractStarted',
  ContractCreated = 'ContractCreated',
  MessageCreated = 'MessageCreated',
  FileCreated = 'FileCreated',
  decisionSubmitted = 'decisionSubmitted',
  decisionActioned = 'decisionActioned',
  decisionUpdated = 'decisionUpdated',
  GenericNotificationMatch = 'GenericNotificationMatch',
  GenericNotificationTaskboard = 'GenericNotificationTaskboard',
  GenericNotificationChangeOrder = 'GenericNotificationChangeOrder',
  GenericNotificationPayment = 'GenericNotificationPayment',
  GenericNotificationCollaborator = 'GenericNotificationCollaborator',
  GenericNotificationDocuments = 'GenericNotificationDocuments',
  GenericNotificationMessages = 'GenericNotificationMessages',
  ChangeOrderCommented = 'ChangeOrderCommented',
  TaskReminder = 'TaskReminder',
  MonthlySubscriptionPaymentFailed = 'MonthlySubscriptionPaymentFailed',
  MonthlySubscriptionPaymentWaitAuth = 'MonthlySubscriptionPaymentWaitAuth'
}

export type PushNotificationOptions =
  | ({ contractId: string } & (
      | {
          type:
            | PushNotificationType.TaskMoved
            | PushNotificationType.TaskUpdated
            | PushNotificationType.TaskAssigneeChanged
            | PushNotificationType.TaskCommentCreated
            | PushNotificationType.TaskReminder;
          taskId: string;
        }
      | {
          type:
            | PushNotificationType.ChangeOrderCommented
            | PushNotificationType.ChangeOrderApproved
            | PushNotificationType.ChangeOrderDeclined
            | PushNotificationType.ChangeOrderOutdated
            | PushNotificationType.ChangeOrderEdited
            | PushNotificationType.ChangeOrderCreated;
          changeOrderId: string;
        }
      | {
          type: PushNotificationType.ContractCollaboratorInvited | PushNotificationType.ContractCollaboratorCreated;
          collaboratorId: string;
        }
      | {
          type:
            | PushNotificationType.PayoutDeclined
            | PushNotificationType.PayoutFailed
            | PushNotificationType.PayoutReleased
            | PushNotificationType.PayoutRequested
            | PushNotificationType.PaymentFailed;
          phaseId: string;
        }
      | {
          type:
            | PushNotificationType.ContractEnded
            | PushNotificationType.ContractStarted
            | PushNotificationType.ContractCreated
            | PushNotificationType.GenericNotificationTaskboard
            | PushNotificationType.GenericNotificationChangeOrder
            | PushNotificationType.GenericNotificationPayment
            | PushNotificationType.GenericNotificationCollaborator
            | PushNotificationType.GenericNotificationDocuments
            | PushNotificationType.GenericNotificationMessages;
        }
      | {
          type: PushNotificationType.MessageCreated;
          chatId: string;
          messageId: number;
        }
      | {
          type: PushNotificationType.FileCreated;
          fileId: string;
          fileUrl?: string;
        }
      | {
          type: PushNotificationType.FundPhase;
          phaseId: string;
        }
    ))
  | {
      type:
        | PushNotificationType.decisionSubmitted
        | PushNotificationType.decisionActioned
        | PushNotificationType.decisionUpdated;
      decisionId: string;
    }
  | {
      type: PushNotificationType.GenericNotificationMatch;
    }
  | {
      type: PushNotificationType.MonthlySubscriptionPaymentFailed;
      url: string;
    }
  | {
      type: PushNotificationType.MonthlySubscriptionPaymentWaitAuth;
      url: string;
    }
  | {
      type: PushNotificationType.FundPhaseRequested;
      phaseId: string;
    };

export type PushNotification = {
  title: string;
  subtitle?: string;
  body?: string;
};

/**
 * PushNotificationProvider function is responsible for sending push notifications to a device.
 * 
 * @param data - The data object containing the device token, notification details, and options.
 * @param data.deviceToken - The device token of the recipient device.
 * @param data.notification - The push notification object containing the title, subtitle, and body.
 * @param data.opts - The options object specifying the type of push notification and additional parameters.
 * @returns A Promise that resolves when the push notification is sent successfully.
 */
export type PushNotificationProvider = (data: {
  deviceToken: string;
  notification: PushNotification;
  opts: PushNotificationOptions;
}) => Promise<any>;

/**
 * Represents an error that occurs when attempting to send a push notification.
 *
 * @class PushNotificationError
 * @extends Error
 */
export class PushNotificationError extends Error {
  public reason: string;
  constructor(reason: string) {
    super(`Cannot send push: ${reason}`);
    this.reason = reason;
  }
}
