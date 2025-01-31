/*external modules*/
import _ from 'lodash';
import { Job, JobOptions } from 'bull';
import pino from 'pino';
import * as Sentry from '@sentry/node';
/*workers*/
import { sendEmailConsumer, SendEmailOptions } from './consumers/send-email';
import { reminderEmailConsumer, ReminderEmailOptions } from './consumers/reminder-email';
import { fundPhaseConsumer, FundPhaseOptions } from './consumers/fund-phase';
// import { fundPhasesConsumer, FundPhasesOptions } from './consumers/bulk-fund-phase';
import { fundTasksConsumer, FundTasksOptions } from './consumers/fund-tasks';
// import { fundAllTasksConsumer, FundAllTasksOptions } from './consumers/bulk-fund-tasks';
import { uploadUserImageFromUrlConsumer, UploadFileFromUrlOptions } from './consumers/upload-user-image-from-url';
import {
  deleteGoogleStorageFileConsumer,
  DeleteGoogleStorageFileOptions
} from './consumers/delete-google-storage-file';
import { releasePayoutConsumer, ReleasePayoutOptions } from './consumers/release-payout';
import { updateShowInMatchFlagConsumer, UpdateShowInMatchFlagOptions } from './consumers/update-show-in-match-flag';
import { createContractActivityConsumer, CreateContractActivityOptions } from './consumers/create-contract-activity';
import { processInvitesConsumer, ProcessInvitesOptions } from './consumers/process-invites';
import {
  updateLastSeenTimestampConsumer,
  UpdateLastSeenTimestampOptions
} from './consumers/update-last-seen-timestamp';
import { sendNotificationConsumer, SendNotificationOptions } from './consumers/send-notification';
import { sendPushNotificationConsumer, SendPushNotificationOptions } from './consumers/send-push-notification';
import { handleSnsMessageConsumer, HandleSnsMessageOptions } from './consumers/handle-sns-message';
import { contractsCreatedConsumer, ContractsCreatedOptions } from './consumers/contracts-created';
import { inviteProConsumer, InviteProOptions } from './consumers/invite-pro';
import { inviteOwnerConsumer, InviteOwnerOptions } from './consumers/invite-owner';
import { inviteCollaboratorConsumer, InviteCollaboratorOptions } from './consumers/invite-collaborator';
import { taskMovedConsumer, TaskMovedOptions } from './consumers/task-moved';
import { taskCommentedConsumer, TaskCommentedOptions } from './consumers/task-commented';
import { userViewPointNotification, UserViewPointNotificationOptions } from './consumers/user-view-point-notification';
import { taskAssigneeChangedConsumer, TaskAssigneeChangedOptions } from './consumers/task-assignee-changed';
import { changeOrderCreatedConsumer, ChangeOrderCreatedOptions } from './consumers/change-order-created';
import { payoutRequestedConsumer, PayoutRequestedOptions } from './consumers/payout-requested';
import { collaboratorCreatedConsumer, CollaboratorCreatedOptions } from './consumers/collaborators/created';
import {
  collaboratorRequestedToDeleteConsumer,
  CollaboratorRequestedToDeleteOptions
} from './consumers/collaborators/requested-to-delete';
import { fileCreatedConsumer, FileCreatedOptions } from './consumers/file-created';
import { taskUpdatedConsumer, TaskUpdatedOptions } from './consumers/task-updated';
import { sendEmailControlledConsumer, SendControlledEmailOptions } from './consumers/send-email-controlled';
import { messageSentConsumer, MessageSentOptions } from './consumers/message-sent';
import { changeOrderCommentedConsumer, ChangeOrderCommentedOptions } from './consumers/change-order-commented';
import { taskReminderConsumer, TaskReminderOptions } from './consumers/task-reminder';
import { createMeetingConsumer, CreateMeetingOptions } from './consumers/create-meeting';
import {
  checkSubscriptionPaidConsumer,
  CheckSubscriptionPaidConsumerOptions
} from './consumers/check-subscription-paid';
import { autoContractCloseConsumer, AutoContractCloseOptions } from './consumers/auto-contract-close';
import {
  actualizeQuickBooksItemsConsumer,
  ActualizeQuickBooksItemsOptions
} from './consumers/quick-books/actualize-quick-books-items';
import {
  createQuickBooksInvoiceConsumer,
  CreateQuickBooksInvoiceOptions
} from './consumers/quick-books/create-quick-books-invoice';
import {
  createFakeQuickBooksPaymentConsumer,
  CreateFakeQuickBooksPaymentOptions
} from './consumers/quick-books/create-fake-quick-books-payment';
import {
  updateQuickBooksInvoiceConsumer,
  UpdateQuickBooksInvoiceOptions
} from './consumers/quick-books/update-quick-books-invoice';
import {
  removeQuickBooksInvoiceConsumer,
  RemoveQuickBooksInvoiceOptions
} from './consumers/quick-books/remove-quick-books-invoice';
/*static workers*/
import {
  eodUnreadMessagesSummaryConsumer,
  EodUnreadMessagesSummaryOptions
} from './staticConsumers/eod-unread-messages-summary';
import {
  debitExpirationNotificationConsumer,
  DebitExpirationNotificationOptions
} from './staticConsumers/debit-expiration-notification';
import {
  notUpdatedTaskboardNotificationConsumer,
  NotUpdatedTaskboardNotificationOptions
} from './staticConsumers/not-updated-taskboard-notification';
import {
  submitPayoutRequestNotificationsConsumer,
  SubmitPayoutRequestNotificationsOptions
} from './staticConsumers/submit-payout-request-notifications';
import {
  submitChangeOrderNotificationsConsumer,
  SubmitChangeOrderNotificationsOptions
} from './staticConsumers/submit-change-order-notifications';
import {
  submitEstimateNotificationsConsumer,
  SubmitEstimateNotificationsOptions
} from './staticConsumers/submit-estimate-notifications';
import {
  matchProsNotificationsConsumer,
  MatchProsNotificationsOptions
} from './staticConsumers/match-pros-notifications';
import { FundPhaseRequested, fundPhaseRequested } from './consumers/fund-phase-requested';
import { weeklySummaryConsumer, WeeklySummaryOptions } from './staticConsumers/weekly-summary';
import { autoRequestPayoutConsumer, AutoRequestPayoutOptions } from './staticConsumers/auto-request-payout';
import {
  updateQuickBooksRefreshTokensConsumer,
  UpdateQuickBooksRefreshTokenOptions
} from './staticConsumers/update-quick-books-refresh-tokens';
import { stripeWebhookHandler, StripeWebhookPayout } from './consumers/stripe-webhook-handler';
/*other*/
import { logger } from '../logger';
import { config, IConfig } from '../config';
import Queue, { ExtendedQueueOptions } from './ExtendedQueue';
import { reCreateRepeatableJobs } from './utils/reCreateRepeatableJobs';
import { unverifiedUserEmailConsumer, UnverifiedUserEmailOptions } from './consumers/unverified-email';
import {
  unuploadedLicenseInsuraceEmailConsumer,
  UnuploadedLicenseInsuraceEmailOptions
} from './staticConsumers/unuploaded-license-insurance-notification';
import {
  noActivityAfterSignupEmailConsumer,
  NoActivityAfterSignupEmailOptions
} from './staticConsumers/no-activity-after-signup-email-notification';

type JobWorkerOpts = {
  logger: pino.Logger | typeof console;
  config: IConfig;
};

export type QueueNameList =
  | 'send-email'
  | 'reminder-email'
  | 'send-email-controlled'
  | 'fund-phase'
  | 'bulk-fund-phase'
  | 'upload-user-image-from-url'
  | 'delete-google-storage-file'
  | 'release-payout'
  | 'update-show-in-match-flag'
  | 'create-contract-activity'
  | 'process-invites'
  | 'update-last-seen-timestamp'
  | 'send-notification'
  | 'send-push-notification'
  | 'handle-sns-message'
  | 'contracts-created'
  | 'message-sent'
  | 'invite-pro'
  | 'invite-owner'
  | 'invite-collaborator'
  | 'task-moved'
  | 'task-updated'
  | 'task-commented'
  | 'task-assignee-changed'
  | 'change-order-created'
  | 'change-order-commented'
  | 'payout-requested'
  | 'fund-phase-requested'
  | 'collaborator-created'
  | 'file-created'
  | 'user-view-point-notification'
  | 'fund-tasks'
  | 'bulk-fund-tasks'
  | 'eod-unread-messages-summary'
  | 'debit-expiration-notification'
  | 'not-updated-taskboard-notification'
  | 'submit-payout-request-notifications'
  | 'submit-change-order-notifications'
  | 'submit-estimate-notifications'
  | 'match-pros-notifications'
  | 'create-meeting'
  | 'auto-request-payout'
  | 'weekly-summary'
  | 'check-subscription-paid'
  | 'auto-contract-close'
  | 'actualize-quick-books-items'
  | 'update-quick-books-refresh-tokens'
  | 'create-quick-books-invoice'
  | 'create-fake-quick-books-payment'
  | 'update-quick-books-invoice'
  | 'remove-quick-books-invoice'
  | 'stripe-webhook-handler'
  | 'collaborator-requested-to-delete'
  | 'unverified-user-email'
  | 'unuploaded-license-insurance-email'
  | 'no-activity-after-signup';

interface Consumer<T> {
  (job: Job<T>): Promise<void>;
}

const TWELVE_HOURS_IN_MS = config.name === 'development' ? 0 : 1000 * 60 * 60 * 12;

/**
 * Represents a job worker that manages multiple queues for processing jobs.
 */
export class JobWorker {
  readonly prefix: string;
  readonly logger: JobWorkerOpts['logger'];
  readonly config: JobWorkerOpts['config'];
  readonly queues: Record<string, Queue> = {};
  readonly defaultJobOptions: JobOptions = { attempts: 3 };

  constructor(opts: JobWorkerOpts) {
    this.logger = opts.logger;
    this.config = opts.config;
    this.prefix = `${this.config.name}:bull`;
  }

  /**
 * Adds a new queue to the JobWorker.
 * 
 * @param name - The name of the queue.
 * @param consumer - The consumer function for processing jobs in the queue.
 * @param opts - The options for the queue.
 * @returns The newly added queue.
 */
  addQueue<T>(name: string, consumer: Consumer<T>, opts: ExtendedQueueOptions): Queue<T> {
    const queue = (this.queues[name] = new Queue<T>(name, opts));
    queue.process(this.config.name === 'test' ? _.noop : consumer);
    queue.on('failed', (job, jobError) => {
      this.logger.error(jobError, `${queue.name} job failed`);
      // Send errors to Sentry only if job retry limit exceeded
      if (job.attemptsMade >= (job.opts.attempts || this.defaultJobOptions.attempts || 1)) {
        Sentry.withScope(scope => {
          scope.setExtras({ 'job-data': job.data, queue: queue.name });
          Sentry.captureException(jobError);
        });
      }
    });

    this.logger.debug(`Queue "${name}" added.`);

    return this.queues[name];
  }

  getQueue(name: QueueNameList): Queue;
  getQueue(name: string): Queue | undefined;
  getQueue(name: QueueNameList | string): Queue | undefined {
    return this.queues[name];
  }

  /**
   * Start all queues
   */
  async start(): Promise<void> {
    this.logger.debug('Job workers starting..');
    const commonQueueOpts: ExtendedQueueOptions = {
      redis: {
        ...config.redis,
        password: config.secrets.redisPassword
      },
      prefix: this.prefix,
      defaultJobOptions: this.defaultJobOptions
    };

    const queueOptsWithBackoff: ExtendedQueueOptions = {
      ...commonQueueOpts,
      defaultJobOptions: {
        ...commonQueueOpts.defaultJobOptions,
        backoff: {
          type: 'fixed',
          delay: TWELVE_HOURS_IN_MS
        }
      }
    };

    /**
     * Upload user avatars from URL
     */
    this.addQueue<UploadFileFromUrlOptions>(
      'upload-user-image-from-url',
      uploadUserImageFromUrlConsumer,
      commonQueueOpts
    );

    /**
     * Send emails with email API
     */
    this.addQueue<SendEmailOptions>('send-email', sendEmailConsumer, commonQueueOpts);

    /**
     * Send reminder emails
     */
    this.addQueue<ReminderEmailOptions>('reminder-email', reminderEmailConsumer, commonQueueOpts);

    /**
     * Controlled Send emails
     */
    this.addQueue<SendControlledEmailOptions>('send-email-controlled', sendEmailControlledConsumer, {
      ...commonQueueOpts,
      syncJobStatus: true,
      defaultJobOptions: {
        ...commonQueueOpts.defaultJobOptions,
        delay: 1000 * 60 * 15 // 15mins delay
      }
    });

    /**
     * Check subscription pay for new contract
     */
    this.addQueue<CheckSubscriptionPaidConsumerOptions>('check-subscription-paid', checkSubscriptionPaidConsumer, {
      ...commonQueueOpts,
      defaultJobOptions: {
        ...commonQueueOpts.defaultJobOptions,
        removeOnComplete: true,
        removeOnFail: false,
        delay: 1000 * 60 * 60 * 48 // 48 hours delay
      }
    });

    /**
     * Schedule phase funding
     */
    this.addQueue<FundPhaseOptions>('fund-phase', fundPhaseConsumer, queueOptsWithBackoff);

    // /**
    //  * Schedule bulk phase funding
    //  */
    // this.addQueue<FundPhasesOptions>('bulk-fund-phase', fundPhasesConsumer, queueOptsWithBackoff);

    // /**
    //  * Schedule bulk phases tasks funding
    //  */
    // this.addQueue<FundAllTasksOptions>('bulk-fund-tasks', fundAllTasksConsumer, queueOptsWithBackoff);

    /**
     * Schedule tasks funding
     */
    this.addQueue<FundTasksOptions>('fund-tasks', fundTasksConsumer, queueOptsWithBackoff);

    /**
     * Schedule payout release
     */
    this.addQueue<ReleasePayoutOptions>('release-payout', releasePayoutConsumer, queueOptsWithBackoff);

    /**
     * Delete file from google storage
     */
    this.addQueue<DeleteGoogleStorageFileOptions>(
      'delete-google-storage-file',
      deleteGoogleStorageFileConsumer,
      commonQueueOpts
    );

    /**
     * Update Role.showInMatch flag when role updated
     */
    this.addQueue<UpdateShowInMatchFlagOptions>(
      'update-show-in-match-flag',
      updateShowInMatchFlagConsumer,
      commonQueueOpts
    );

    /**
     * Create contract activity
     */
    this.addQueue<CreateContractActivityOptions>(
      'create-contract-activity',
      createContractActivityConsumer,
      commonQueueOpts
    );

    /**
     * Process invites for registered user
     */
    this.addQueue<ProcessInvitesOptions>('process-invites', processInvitesConsumer, commonQueueOpts);

    /**
     * Process notifications for created contracts
     */
    this.addQueue<ContractsCreatedOptions>('contracts-created', contractsCreatedConsumer, commonQueueOpts);

    /**
     * Process notifications for invited Pro
     */
    this.addQueue<InviteProOptions>('invite-pro', inviteProConsumer, commonQueueOpts);

    /**
     * Process notifications for invited Owner
     */
    this.addQueue<InviteOwnerOptions>('invite-owner', inviteOwnerConsumer, commonQueueOpts);

    /**
     * Process notifications for invited Collaborator
     */
    this.addQueue<InviteCollaboratorOptions>('invite-collaborator', inviteCollaboratorConsumer, commonQueueOpts);

    /**
     * Process notifications for task updated
     */
    this.addQueue<TaskUpdatedOptions>('task-updated', taskUpdatedConsumer, commonQueueOpts);

    /**
     * Process notifications for task moved
     */
    this.addQueue<TaskMovedOptions>('task-moved', taskMovedConsumer, commonQueueOpts);

    /**
     * Process notifications for task commented
     */
    this.addQueue<TaskCommentedOptions>('task-commented', taskCommentedConsumer, commonQueueOpts);

    /**
     * Process notifications for task assignee changed
     */
    this.addQueue<TaskAssigneeChangedOptions>('task-assignee-changed', taskAssigneeChangedConsumer, commonQueueOpts);

    /**
     * Process notifications for change order created
     */
    this.addQueue<ChangeOrderCreatedOptions>('change-order-created', changeOrderCreatedConsumer, commonQueueOpts);

    /**
     * Process notifications for change order commented
     */
    this.addQueue<ChangeOrderCommentedOptions>('change-order-commented', changeOrderCommentedConsumer, commonQueueOpts);

    /**
     * Process notifications for payment requested
     */
    this.addQueue<PayoutRequestedOptions>('payout-requested', payoutRequestedConsumer, commonQueueOpts);

    /**
     * Process notifications for fund phase requested
     */
    this.addQueue<FundPhaseRequested>('fund-phase-requested', fundPhaseRequested, commonQueueOpts);

    /**
     * Process notifications for collaborator created
     */
    this.addQueue<CollaboratorCreatedOptions>('collaborator-created', collaboratorCreatedConsumer, commonQueueOpts);

    /**
     * Process notifications for requested to delete collaborator
     */
    this.addQueue<CollaboratorRequestedToDeleteOptions>(
      'collaborator-requested-to-delete',
      collaboratorRequestedToDeleteConsumer,
      commonQueueOpts
    );

    /**
     * Process notifications for file created #contract based
     */
    this.addQueue<FileCreatedOptions>('file-created', fileCreatedConsumer, commonQueueOpts);

    /**
     * Process notifications for chat message sent
     */
    this.addQueue<MessageSentOptions>('message-sent', messageSentConsumer, commonQueueOpts);

    /**
     * Process generic notifications
     */
    this.addQueue<UserViewPointNotificationOptions>('user-view-point-notification', userViewPointNotification, {
      ...commonQueueOpts,
      syncJobStatus: true
    });

    /**
     * Update last seen timestamp
     */
    this.addQueue<UpdateLastSeenTimestampOptions>('update-last-seen-timestamp', updateLastSeenTimestampConsumer, {
      ...commonQueueOpts,
      defaultJobOptions: {
        ...commonQueueOpts.defaultJobOptions,
        removeOnComplete: true,
        removeOnFail: true
      }
    });

    /**
     * Send subscription/email/push
     */
    this.addQueue<SendNotificationOptions>('send-notification', sendNotificationConsumer, {
      ...commonQueueOpts,
      defaultJobOptions: {
        ...commonQueueOpts.defaultJobOptions,
        removeOnComplete: true,
        removeOnFail: false
      }
    });

    /**
     * Send push notifications ios/android
     */
    this.addQueue<SendPushNotificationOptions>('send-push-notification', sendPushNotificationConsumer, {
      ...commonQueueOpts,
      defaultJobOptions: {
        ...commonQueueOpts.defaultJobOptions,
        removeOnComplete: false,
        removeOnFail: false
      }
    });

    /**
     * Handle messages from AWS SNS. Currently used only for accepting email replies
     */
    this.addQueue<HandleSnsMessageOptions>('handle-sns-message', handleSnsMessageConsumer, commonQueueOpts);

    /**
     * Create and send meeting with email API
     */
    this.addQueue<CreateMeetingOptions>('create-meeting', createMeetingConsumer, commonQueueOpts);

    /**
     * Send task reminders
     */
    this.addQueue<TaskReminderOptions>('task-reminder', taskReminderConsumer, {
      ...commonQueueOpts,
      syncJobStatus: true
    });

    /**
     * First 5 days send email about "Need close contract" and after if contract not closed -> close
     */
    this.addQueue<AutoContractCloseOptions>('auto-contract-close', autoContractCloseConsumer, commonQueueOpts);

    /**
     *  Update if need Quick Books items after create / approve Change Order
     */
    this.addQueue<ActualizeQuickBooksItemsOptions>('actualize-quick-books-items', actualizeQuickBooksItemsConsumer, {
      ...commonQueueOpts,
      defaultJobOptions: {
        ...commonQueueOpts.defaultJobOptions,
        removeOnComplete: true,
        removeOnFail: false
      }
    });

    /**
     *  Create Quick Books Invoice by payments
     */
    this.addQueue<CreateQuickBooksInvoiceOptions>('create-quick-books-invoice', createQuickBooksInvoiceConsumer, {
      ...commonQueueOpts,
      defaultJobOptions: {
        ...commonQueueOpts.defaultJobOptions,
        removeOnComplete: true,
        removeOnFail: false
      }
    });

    /**
     *  Update Quick Books Invoice (remove task name for description and other).
     *  This job need because system have some effects on payments (fake payments) and allow to remove task from payments (group).
     */
    this.addQueue<UpdateQuickBooksInvoiceOptions>('update-quick-books-invoice', updateQuickBooksInvoiceConsumer, {
      ...commonQueueOpts,
      defaultJobOptions: {
        ...commonQueueOpts.defaultJobOptions,
        removeOnComplete: true,
        removeOnFail: false
      }
    });

    /**
     *  Update Quick Books Invoice (remove task name for description and other).
     *  This job need because system have some effects on payments (fake payments) and allow to delete such payments (if payment for only one task).
     */
    this.addQueue<RemoveQuickBooksInvoiceOptions>('remove-quick-books-invoice', removeQuickBooksInvoiceConsumer, {
      ...commonQueueOpts,
      defaultJobOptions: {
        ...commonQueueOpts.defaultJobOptions,
        removeOnComplete: true,
        removeOnFail: false
      }
    });

    /**
     *  Create Quick Books Payment for Quick Books Invoice after succeeded Stripe Payout Release
     */
    this.addQueue<CreateFakeQuickBooksPaymentOptions>(
      'create-fake-quick-books-payment',
      createFakeQuickBooksPaymentConsumer,
      {
        ...commonQueueOpts,
        defaultJobOptions: {
          ...commonQueueOpts.defaultJobOptions,
          removeOnComplete: true,
          removeOnFail: false
        }
      }
    );

    /**
     * end of the day unread message summary
     */
    this.addQueue<EodUnreadMessagesSummaryOptions>('eod-unread-messages-summary', eodUnreadMessagesSummaryConsumer, {
      ...commonQueueOpts,
      defaultJobOptions: {
        ...commonQueueOpts.defaultJobOptions,
        removeOnComplete: false,
        removeOnFail: false,
        repeat: {
          cron: '0 0 * * *'
        }
      }
    });

    /**
     * debit expiration notification
     */
    this.addQueue<DebitExpirationNotificationOptions>(
      'debit-expiration-notification',
      debitExpirationNotificationConsumer,
      {
        ...commonQueueOpts,
        defaultJobOptions: {
          ...commonQueueOpts.defaultJobOptions,
          removeOnComplete: false,
          removeOnFail: false,
          repeat: {
            cron: '0 0 * * *'
          }
        }
      }
    );

    /**
     * notification pro if after estimate approval, not update on Taskboard
     */
    this.addQueue<NotUpdatedTaskboardNotificationOptions>(
      'not-updated-taskboard-notification',
      notUpdatedTaskboardNotificationConsumer,
      {
        ...commonQueueOpts,
        defaultJobOptions: {
          ...commonQueueOpts.defaultJobOptions,
          removeOnComplete: false,
          removeOnFail: false,
          repeat: {
            cron: '0 0 * * *'
          }
        }
      }
    );

    /**
     * end of the day after submits Payout Request, the reminder emails frequency to remind Owner to review
       Estimate and Change Order
     */
    this.addQueue<SubmitPayoutRequestNotificationsOptions>(
      'submit-payout-request-notifications',
      submitPayoutRequestNotificationsConsumer,
      {
        ...commonQueueOpts,
        defaultJobOptions: {
          ...commonQueueOpts.defaultJobOptions,
          removeOnComplete: false,
          removeOnFail: false,
          repeat: {
            cron: '0 0 * * *'
          }
        }
      }
    );

    /**
     * end of the day after submits Change Order, the reminder emails frequency to remind Owner to review Change Order
     */
    this.addQueue<SubmitChangeOrderNotificationsOptions>(
      'submit-change-order-notifications',
      submitChangeOrderNotificationsConsumer,
      {
        ...commonQueueOpts,
        defaultJobOptions: {
          ...commonQueueOpts.defaultJobOptions,
          removeOnComplete: false,
          removeOnFail: false,
          repeat: {
            cron: '0 0 * * *'
          }
        }
      }
    );

    /**
     * end of the day after submits Estimate, the reminder emails frequency to remind Owner to review Estimate
     */
    this.addQueue<SubmitEstimateNotificationsOptions>(
      'submit-estimate-notifications',
      submitEstimateNotificationsConsumer,
      {
        ...commonQueueOpts,
        defaultJobOptions: {
          ...commonQueueOpts.defaultJobOptions,
          removeOnComplete: false,
          removeOnFail: false,
          repeat: {
            cron: '0 0 * * *'
          }
        }
      }
    );

    /**
     * end of the day if Owner signed up and have not select any pros (only when there are pros in the system can be matched with them)
     * the reminder emails frequency to remind owner to select a pro from the match
     */
    this.addQueue<MatchProsNotificationsOptions>('match-pros-notifications', matchProsNotificationsConsumer, {
      ...commonQueueOpts,
      defaultJobOptions: {
        ...commonQueueOpts.defaultJobOptions,
        removeOnComplete: false,
        removeOnFail: false,
        repeat: {
          cron: '0 0 * * *'
        }
      }
    });

    /**
     * weekly summary
     */
    this.addQueue<WeeklySummaryOptions>('weekly-summary', weeklySummaryConsumer, {
      ...commonQueueOpts,
      defaultJobOptions: {
        ...commonQueueOpts.defaultJobOptions,
        removeOnComplete: false,
        removeOnFail: false,
        repeat: {
          cron: '0 22 * * 0'
        }
      }
    });

    /**
     * check phases with auto request payout and then request
     */
    this.addQueue<AutoRequestPayoutOptions>('auto-request-payout', autoRequestPayoutConsumer, {
      ...commonQueueOpts,
      defaultJobOptions: {
        ...commonQueueOpts.defaultJobOptions,
        removeOnComplete: false,
        removeOnFail: false,
        repeat: {
          cron: '0 0 * * *'
        }
      }
    });

    /**
     * Update QuickBooks refresh tokens if need
     */
    this.addQueue<UpdateQuickBooksRefreshTokenOptions>(
      'update-quick-books-refresh-tokens',
      updateQuickBooksRefreshTokensConsumer,
      {
        ...commonQueueOpts,
        defaultJobOptions: {
          ...commonQueueOpts.defaultJobOptions,
          removeOnComplete: true,
          removeOnFail: false,
          repeat: {
            cron: '0 22 * * 5'
          }
        }
      }
    );

    /**
     * Creates a delay before processing the webhooks so that we have time to save the data in the DB
     */
    this.addQueue<StripeWebhookPayout>('stripe-webhook-handler', stripeWebhookHandler, {
      ...commonQueueOpts,
      defaultJobOptions: {
        ...commonQueueOpts.defaultJobOptions,
        removeOnComplete: true,
        removeOnFail: false,
        delay: 1000 * 5 // 5 sec delay
      }
    });

    /**
     * Process email notification for non verified user email
     */
    this.addQueue<UnverifiedUserEmailOptions>('unverified-user-email', unverifiedUserEmailConsumer, {
      ...commonQueueOpts,
      defaultJobOptions: {
        ...commonQueueOpts.defaultJobOptions,
        repeat: {
          cron: '0 8 * * *'
        }
      }
    });
    /**
     * Process email notification for not uploaded license and insurance
     */
    this.addQueue<UnuploadedLicenseInsuraceEmailOptions>(
      'unuploaded-license-insurance-email',
      unuploadedLicenseInsuraceEmailConsumer,
      {
        ...commonQueueOpts,
        defaultJobOptions: {
          ...commonQueueOpts.defaultJobOptions,
          repeat: {
            cron: '0 8 * * *'
          }
        }
      }
    );
    /**
     * Process email notification for no account activity after signup in 15 days.
     */
    this.addQueue<NoActivityAfterSignupEmailOptions>('no-activity-after-signup', noActivityAfterSignupEmailConsumer, {
      ...commonQueueOpts,
      defaultJobOptions: {
        ...commonQueueOpts.defaultJobOptions,
        repeat: {
          cron: '0 8 * * *'
        }
      }
    });

    this.logger.debug('Job workers started.');
  }

  async runStaticJobs(): Promise<void> {
    this.logger.info('Starting static jobs..');

    await reCreateRepeatableJobs('eod-unread-messages-summary');

    await reCreateRepeatableJobs('debit-expiration-notification');

    await reCreateRepeatableJobs('not-updated-taskboard-notification');

    await reCreateRepeatableJobs('submit-payout-request-notifications');

    await reCreateRepeatableJobs('submit-change-order-notifications');

    await reCreateRepeatableJobs('submit-estimate-notifications');

    await reCreateRepeatableJobs('match-pros-notifications');

    await reCreateRepeatableJobs('weekly-summary');

    await reCreateRepeatableJobs('auto-request-payout');

    await reCreateRepeatableJobs('update-quick-books-refresh-tokens');

    await reCreateRepeatableJobs('unverified-user-email');

    await reCreateRepeatableJobs('unuploaded-license-insurance-email');

    await reCreateRepeatableJobs('no-activity-after-signup');

    this.logger.info('Static jobs started.');
  }

  /**
   * Stop all queues
   */
  async stop(): Promise<void> {
    await Promise.all(_.map(this.queues, q => q.close()));
    this.logger.debug('Job workers stopped.');
  }
}

export default new JobWorker({ logger, config });
