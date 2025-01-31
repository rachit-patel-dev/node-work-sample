import { TaskStatus } from '../../db/types/task';
import { DecisionOption } from '../../db/types/decisionOption';

export type EmailBasicOptions = {
  to: string | string[];
  subject: string;
  fromEmail?: string;
  replyTo?: string;
  usingMJMLChart?: boolean;
};

export type TaskMoved = {
  template: 'taskMoved';
  locals: {
    senderName: string;
    receiverName: string;
    taskName: string;
    projectName: string;
    to: TaskStatus;
    from: TaskStatus;
    url: string;
  };
};

export type TaskUpdated = {
  template: 'taskUpdated';
  locals: {
    initiatorName: string;
    taskName: string;
    contractName: string;
    url: string;
  };
};

export type TaskAssigneeChanged = {
  template: 'taskAssigneeChanged';
  locals: {
    receiverName: string;
    taskName: string;
    initiatorName: string;
    contractName: string;
    taskEndDate: string;
    url: string;
  };
};

export type TaskCommentCreated = {
  template: 'taskCommentCreated';
  locals: {
    receiverName: string;
    senderName: string;
    taskName: string;
    projectName: string;
    message: string;
    url: string;
  };
};

export type ContractStartedOwner = {
  template: 'contractStartedOwner';
  locals: {
    ownerName: string;
    projectName: string;
    proName: string;
    phaseName: string;
    phaseTotal: string;
    url: string;
  };
};

export type ContractStartedPro = {
  template: 'contractStartedPro';
  locals: {
    ownerName: string;
    proName: string;
    phaseName: string;
    phaseTotal: string;
    url: string;
  };
};

export type ContractEndedAdmin = {
  template: 'contractEndedAdmin';
  locals: {
    userName: string;
    contractName: string;
    endReason: string;
    partialPayment: boolean;
    url: string;
  };
};

export type ContractEndedOwner = {
  template: 'contractEndedOwner';
  locals: {
    userName: string;
    initiatorName: string;
    contractName: string;
    proName: string;
    phaseName?: string;
    phaseTotal?: string;
    endDate: string;
    endReason: string;
    partialPayment: boolean;
    btnText: string;
    url: string;
  };
};

export type ContractEndedPro = {
  template: 'contractEndedPro';
  locals: {
    userName: string;
    initiatorName: string;
    contractName: string;
    phaseName?: string;
    phaseTotal?: string;
    endDate: string;
    btnText: string;
    url: string;
  };
};

export type ChangeOrderApproved = {
  template: 'changeOrderApproved';
  locals: {
    projectName: string;
    changeOrderNumber: number;
    url: string;
  };
};

export type ChangeOrderDeclinedPro = {
  template: 'changeOrderDeclinedPro';
  locals: ChangeOrderDeclinedLocals;
};

export type ChangeOrderDeferredPro = {
  template: 'changeOrderDeferredPro';
  locals: ChangeOrderDeclinedLocals;
};

export type ChangeOrderNeedsClarificationPro = {
  template: 'changeOrderNeedsClarificationPro';
  locals: ChangeOrderDeclinedLocals;
};

export type ChangeOrderOutdatedPro = {
  template: 'changeOrderOutdatedPro';
  locals: ChangeOrderDeclinedLocals;
};

export type ChangeOrderCreated = {
  template: 'changeOrderCreated';
  locals: {
    requesterName: string;
    projectName: string;
    reason: string;
    cost: string;
    targetEndDate: string;
    url: string;
  };
};

export type ChangeOrderEdited = {
  template: 'changeOrderEdited';
  locals: {
    projectName: string;
    requesterName: string;
    changeOrderNumber: number;
    cost: string;
    targetEndDate: string;
    url: string;
  };
};

export type ChangeOrderCommented = {
  template: 'change-orders/commented';
  locals: {
    receiverName: string;
    senderName: string;
    changeOrderNo: number;
    message: string;
    url: string;
  };
};

export type PayoutDeclined = {
  template: 'payoutDeclined';
  locals: {
    projectName: string;
    phaseName: string;
    declineComment: string;
    url: string;
  };
};

export type PayoutRequested = {
  template: 'payoutRequested';
  locals: {
    ownerName: string;
    proName: string;
    phaseName: string;
    amount: string;
    requestDate: string;
    nextPhaseName?: string;
    nextPhaseAmount?: string;
    daysLeft: number;
    allPhaseRequested: boolean;
    autoProcessedDate: string;
    url: string;
  };
};

export type PayoutFailed = {
  template: 'payoutFailed';
  locals: {
    proName: string;
    phaseName: string;
    contractName: string;
    reason: string;
    url: string;
  };
};

export type StripeActionFailed = {
  template: 'stripeActionFailed';
  locals: {
    action: string;
    args: any;
    error: any;
  };
};

export type PayoutReleasedOwner = {
  template: 'payoutReleasedOwner';
  locals: {
    ownerName: string;
    proName: string;
    projectName: string;
    amount: string;
    phaseName: string;
    releaseDate: string;
    companyAddress: string;
    proEmail: string;
    url: string;
  };
};

export type PayoutReleasedPro = {
  template: 'payoutReleasedPro';
  locals: {
    proName: string;
    ownerName: string;
    phaseName: string;
    allTasksPaid: boolean;
    url: string;
  };
};

export type PayoutReleased = {
  template: 'payoutReleased';
  locals: {
    userName: string;
    proName: string;
    phaseName: string;
    contractName: string;
    amount: string;
    releaseDate: string;
    companyAddress: string;
    url: string;

    /** owner or pro email required */
    proEmail?: string;
    ownerEmail?: string;
  };
};

export type PaymentFailed = {
  template: 'paymentFailed';
  locals: {
    phaseName: string;
    contractName: string;
    ownerName: string;
    reason: string;
    url: string;
  };
};

export type FundPhase = {
  template: 'fundPhase';
  locals: {
    userName: string;
    proName: string;
    phaseName: string;
    contractName: string;
    amount: string;
    releaseDate: string;
    companyAddress: string;
    url: string;

    /** owner or pro email required */
    proEmail?: string;
    ownerEmail?: string;
  };
};

export type FundPhaseRequested = {
  template: 'fundPhaseRequested';
  locals: {
    ownerName: string;
    proName: string;
    phaseName: string;
    requestDate: string;
    amount: string;
    url: string;
  };
};

export type ContractCollaboratorCreated = {
  template: 'contractCollaboratorCreated';
  locals: {
    userName: string;
    inviterName: string;
    contractName: string;
    canConfirm: boolean;
    url: string;
    btnText: string;
  };
};

export type ContractCollaboratorRequestedToDelete = {
  template: 'collaborators/requestedToDelete';
  locals: {
    userName: string;
    requesterName: string;
    collaboratorName: string;
    contractName: string;
    url: string;
  };
};

export type ContractCollaboratorCreatedUser = {
  template: 'contractCollaboratorCreatedUser';
  locals: {
    userName: string;
    inviterName: string;
    contractName: string;
    url: string;
  };
};
export type ContractCollaboratorInvited = {
  template: 'contractCollaboratorInvited';
  locals: {
    name: string;
    message: string;
    btnText: string;
    url: string;
  };
};

export type FillProfilesPro = {
  template: 'fillProfilesPro';
  locals: {
    firstName: string;
    url: string;
  };
};
export type BookDownload = {
  template: 'bookDownload';
  locals: {
    fullName: string;
    bookUrl: string;
  };
};

export type ConfirmEmail = {
  template: 'confirmEmail';
  locals: {
    name: string;
    confirmUrl: string;
  };
};

export type EstimateDeclinedPro = {
  template: 'estimateDeclinedPro';
  locals: EstimateDeclinedLocals;
};

export type EstimateDeferredPro = {
  template: 'estimateDeferredPro';
  locals: EstimateDeclinedLocals;
};

export type EstimateNeedsClarificationPro = {
  template: 'estimateNeedsClarificationPro';
  locals: EstimateDeclinedLocals;
};

export type InitPasswordReset = {
  template: 'initPasswordReset';
  locals: {
    userName: string;
    url: string;
    locked: boolean;
  };
};

export type EstimateSubmittedOwner = {
  template: 'estimateSubmittedOwner';
  locals: {
    ownerName: string;
    proName: string;
    projectName: string;
    url: string;
    contactEmail: string;
  };
};

export type ContractCreatedPro = {
  template: 'contracts/created';
  locals: {
    receiverName: string;
    ownerName: string;
    introMessage: string;
    url: string;
  };
};

export type SupportRequestCreated = {
  template: 'supportRequestCreated';
  locals: {
    from: string;
    type: string;
    content: string;
  };
};

export type PasswordChanged = {
  template: 'passwordChanged';
  locals: {
    userName: string;
    contactEmail: string;
  };
};

export type ProjectInviteDeclinedOwner = {
  template: 'projectInviteDeclinedOwner';
  locals: {
    ownerName: string;
    proName: string;
    url: string;
  };
};

export type ProjectInviteAcceptedOwner = {
  template: 'projectInviteAcceptedOwner';
  locals: {
    ownerName: string;
    proName: string;
    projectName: string;
    url: string;
  };
};

export type ProjectInviteOwner = {
  template: 'projects/invite-owner';
  locals: {
    inviteeName: string;
    inviterName: string;
    projectName: string;
    message: string;
    btnText: string;
    url: string;
  };
};

export type GenericNotification = {
  template: 'generic/generic-notification';
  locals: {
    receiverName: string;
    message: string;
    btnText: string;
    url: string;
  };
};

export type ProjectInvitePro = {
  template: 'projects/invite-pro';
  locals: {
    inviteeName: string;
    inviterName: string;
    projectName: string;
    message: string;
    btnText: string;
    url: string;
  };
};

export type TeamInviteAccepted = {
  template: 'teamInviteAccepted';
  locals: {
    inviteeName: string;
    teamName: string;
    teamOwnerName: string;
    url: string;
  };
};

export type TeamInviteDeclined = {
  template: 'teamInviteDeclined';
  locals: {
    inviteeName: string;
    teamName: string;
    teamOwnerName: string;
    url: string;
  };
};

export type TeamInviteCreatedUser = {
  template: 'teamInviteCreatedUser';
  locals: {
    inviteeName: string;
    inviterName: string;
    url: string;
  };
};

export type TeamInviteCreated = {
  template: 'teamInviteCreated';
  locals: {
    inviteeName: string;
    inviterName: string;
    url: string;
  };
};

export type StripeInfoRequiredPro = {
  template: 'stripeInfoRequiredPro';
  locals: {
    firstName: string;
    url: string;
  };
};

export type DocumentCreated = {
  template: 'contracts/file-created';
  locals: {
    receiverName: string;
    message: string;
    btnText: string;
    url: string;
  };
};

export type MessageSent = {
  template: 'chat-unread-message';
  locals: {
    receiverName: string;
    contractName: string;
    url: string;
  };
};

export type DecisionSubmitted = {
  template: 'decisionSubmitted';
  locals: {
    projectName: string;
    headerText: string;
    description: string;
    options: Array<
      Pick<DecisionOption, 'option' | 'units'> & {
        originalCost: DecisionOption['cost'];
        cost: string;
      }
    >;
    allowance: string;
    dueDate: string;
    daysLeft: number;
    url: string;
  };
};

export type DecisionUpdated = {
  template: 'decisionUpdated';
  locals: {
    projectName: string;
    headerText: string;
    description: string;
    options: Array<
      Pick<DecisionOption, 'option' | 'units'> & {
        originalCost: DecisionOption['cost'];
        cost: string;
      }
    >;
    allowance: string;
    dueDate: string;
    url: string;
  };
};

export type DecisionActioned = {
  template: 'decisionActioned';
  locals: {
    projectName: string;
    headerText: string;
    description: string;
    options: Array<
      Pick<DecisionOption, 'option' | 'units'> & {
        originalCost: DecisionOption['cost'];
        cost: string;
        selected?: boolean;
      }
    >;
    cost: string;
    allowance: string;
    difference: string;
    url: string;
  };
};

export type TaskReminder = {
  template: 'task-reminder';
  locals: {
    receiverName: string;
    reminder: string;
    projectName: string;
    notes?: string;
    url: string;
  };
};

type ChangeOrderDeclinedLocals = {
  projectName: string;
  isNeedToAddComment: boolean;
  declineComment: string;
  reason: string;
  reviewerFirstName: string;
  requesterFirstName: string;
  changeOrderNumber: number;
  url: string;
};

type EstimateDeclinedLocals = {
  ownerName: string;
  proName: string;
  declineComment: string;
  url: string;
};

export type Welcome = {
  template: 'week-email/welcome';
  locals: {
    projectType: string;
    ownerFirstName: string;
  };
};

export type WelcomeNoAvailablePros = {
  template: 'week-email/welcome-no-available-pros';
  locals: {
    ownerFirstName: string;
  };
};

export type HowToReviewAndAcceptAnEstimate = {
  template: 'week-email/how-to-review-and-accept-an-estimate';
  locals: {
    ownerFirstName: string;
  };
};

export type AcceptingYourEstimate = {
  template: 'week-email/accepting-your-estimate';
  locals: {
    projectScope: string;
    ownerFirstName: string;
  };
};

export type PaymentsAndDeposits = {
  template: 'week-email/payments-and-deposits';
  locals: {
    ownerFirstName: string;
  };
};

export type HowToSubmitAChangeOrder = {
  template: 'week-email/how-to-submit-a-change-order';
  locals: {
    ownerFirstName: string;
  };
};

export type Communication = {
  template: 'week-email/communication';
  locals: {
    ownerFirstName: string;
    projectScope: string;
  };
};

export type DocumentManagement = {
  template: 'week-email/document-management';
  locals: {
    ownerFirstName: string;
  };
};

export type MonitoringProjectTasks = {
  template: 'week-email/monitoring-project-tasks';
  locals: {
    ownerFirstName: string;
  };
};

export type MessageCreated = {
  template: 'messageCreated';
  locals: {
    receiverName: string;
    senderName: string;
    message: string;
    place: string;
    files: { isImage: boolean; url: string }[];
    url: string;
  };
};

export type EODUnreadMessagesSummary = {
  template: 'eod-unread-messages-summary';
  locals: {
    receiverName: string;
    countOfMessages: number;
    url: string;
    contractName: string;
  };
};

export type DebitExpiration = {
  template: 'debit-expiration/pro' | 'debit-expiration/owner';
  locals: {
    proName: string;
    ownerName: string;
    phaseName: string;
    dueDate: string; // debit date + 90 days
    url: string;
  };
};

export type NotUpdatedTaskboard = {
  template: 'tasks/notUpdatedTaskboard';
  locals: {
    proName: string;
    ownerName: string;
    phaseName: string;
    firstTaskName: string;
    url: string;
  };
};

export type NotUpdatedTaskboardCritical = {
  template: 'tasks/notUpdatedTaskboardCritical';
  locals: {
    proName: string;
    ownerName: string;
    firstTaskName: string;
    projectName: string;
    dueDate: string; // first task start date + 20 days
    url: string;
  };
};

export type ReminderPayoutRequested = {
  template:
    | 'payments/payouts/requestedDayEleven'
    | 'payments/payouts/requestedDayTwelve'
    | 'payments/payouts/requestedDayThirteen';
  locals: {
    projectName: string;
    ownerName: string;
    proFullName: string;
    phaseName: string;
    phaseAmount: string;
    url: string;
    dueDate: string; // Request date + 14 days
  };
};

export type ReminderChangeOrderCreated = {
  template: 'change-orders/createdReminder';
  locals: {
    projectName: string;
    ownerName: string;
    proFullName: string;
    url: string;
  };
};

export type ReminderEstimateSubmitted = {
  template: 'estimates/createdReminder';
  locals: {
    ownerName: string;
    proFullName: string;
    url: string;
  };
};

export type ReminderNotSelectAnyProsDay3And6 = {
  template: 'match/notSelectAnyProsDay3And6';
  locals: {
    ownerName: string;
    projectType: string;
    projectScope: string;
    url: string;
  };
};

export type ReminderNotSelectAnyProsDay9And14 = {
  template: 'match/notSelectAnyProsDay9And14';
  locals: {
    ownerName: string;
    url: string;
  };
};

export type ReminderNotSelectAnyProsDay21 = {
  template: 'match/notSelectAnyProsDay21';
  locals: {
    ownerName: string;
    projectType: string;
    projectScope: string;
    url: string;
  };
};

export type WeeklySummary = {
  template: 'dashboard';
  locals: {
    contractName: string;

    payoutRequestUrl: string;
    changeOrderUrl: string;
    paymentUrl: string;
    matchUrl: string;

    /* QuickRecap */
    isCreatedToday: boolean;
    isUserPro: boolean;
    partnerFirstName: string;
    overdueTasksRecap: string[];
    overdueDecisionRecap: string[];
    phaseNameForRecapMsg: string | null;
    contractProgress: string;
    contractFinished: boolean;
    additionalPhrase: string;
    haveAttentionRequiredItems: boolean;
    paymentsAttentionRequired: string[];
    changeOrdersAttentionUrl: string;
    changeOrdersAttentionText: string | null;
    changeOrdersAttentionButtonText: string | null;
    overdueTasksAttentionRequired: string[];
    overdueTasksAttentionRequiredAdditionalText: string;
    overdueDecisionsAttentionRequired: string[];
    overdueDecisionsAttentionRequiredBeforeText: string;
    overdueDecisionsAttentionRequiredAfterText: string;

    /* SummaryCards */
    countOfOverdueTasks: number;
    overduePluralizeTaskText: string;
    remainingTasks: string;
    remainingInMoney: string;
    remainingInPercent: string;
    countOfOpenChangeOrder: number;
    countOfApprovedChangeOrder: number;
    changeOrderMoneyDiff: string | null;

    /* ProjectCompletion */
    targetDate: string;
    daysToComplection: string;
    chd: string;
    chl: string;
    chli: string;

    /* TargetCompletion */
    monthOfEndDate: string;
    dayOfEndDate: string;
    yearOfEndDate: string;
    targetDateIsSameInitialDate: boolean;
    daysPerApproved: string;

    /* DecisionsActions */
    haveContractActivities: boolean;
    activitiesList: Array<{
      date: string;
      userActivities: Array<{
        firstName: string;
        lastName: string;
        userAvatar: string;
        activities: Array<{
          activitiesByGroupedTasks: string[];
          defaultActivityMessage: string | null;
          activityMessagesByIgnoredTypes: string[];
          defaultActivitiesGroup: string | null;
        }>;
      }>;
    }>;
  };
};

export type ReminderVerifiedStripeAccount = {
  template: 'verifiedStripeAccount';
  locals: {
    ownerName: string;
    url: string;
  };
};

export type MonthlySubscriptionPaymentFailed = {
  template: 'monthly-subscription/paymentFailed';
  locals: {
    errorDescription: string;
    url: string;
    nextActionUrl?: string;
  };
};

export type ContractAutoClose = {
  template: 'contracts/auto-close-owner' | 'contracts/auto-close-pro';
  locals: {
    receiverName: string;
    projectName: string;
    url: string;
  };
};

export type UnverifiedUserEmail = {
  template: 'unverifiedUserEmail';
  locals: {
    name: string;
    confirmUrl: string;
    mailContent: string;
  };
};

export type NoActivityAfterSignUp = {
  template: 'no-activity-after-signup';
  locals: {
    receiverName: string;
  };
};
