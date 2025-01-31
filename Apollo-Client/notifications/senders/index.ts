// Senders exports goes here
export { taskMoved } from './taskMoved';
export { taskAssigneeChanged } from './taskAssigneeChanged';
export { taskCommentCreated } from './taskCommentCreated';
export { fileCreated } from './fileCreated';
export { contractStarted } from './contractStarted';
export { contractEnded } from './contractEnded';
export { changeOrderApproved } from './changeOrderApproved';
export { changeOrderDeclined } from './changeOrderDeclined';
export { changeOrderCreated } from './changeOrderCreated';
export { changeOrderEdited } from './changeOrderEdited';
export { changeOrderOutdated } from './changeOrderOutdated';
export { payoutDeclined } from './payoutDeclined';
export { payoutFailed } from './payoutFailed';
export { payoutReleased } from './payoutReleased';
export { paymentFailed } from './paymentFailed';
export { fundPhase } from './fundPhase';
export { contractCollaboratorCreated } from './contractCollaboratorCreated';
export { contractCollaboratorInvited } from './contractCollaboratorInvited';
export { adminFillProfilesPro } from './adminFillProfilesPro';
export { bookDownload } from './bookDownload';
export { confirmEmail } from './confirmEmail';
export { estimateDeclined } from './estimateDeclined';
export { initPasswordReset } from './initPasswordReset';
export { estimateSubmitted } from './estimateSubmitted';
export { supportRequestCreated } from './supportRequestCreated';
export { passwordChanged } from './passwordChanged';
export { projectInviteAnswered } from './projectInviteAnswered';
export { contractCreated } from './contracts/created';
export { projectInviteOwner } from './projects/inviteOwner';
export { projectInvitePartner } from './projects/invitePartner';
export { teamInviteAnswered } from './teamInviteAnswered';
export { teamInviteCreated } from './teamInviteCreated';
export { stripeInfoRequired } from './stripeInfoRequired';
export { decisionSubmitted } from './decisions/decisionSubmitted';
export { decisionActioned } from './decisions/decisionActioned';
export { decisionUpdated } from './decisions/decisionUpdated';
export { monthlySubscriptionPaymentFailed } from './monthlySubsctiptions/monthlySubscriptionPaymentFailed';

import * as subscriptions from '../subscriptions';
import { PushNotificationOptions } from '../push';
import { EmailTemplate } from '../emails';
import { ReminderEmailOptions } from '../../jobs/consumers/reminder-email';

export type SenderSubscriptions<
  TPublisher extends keyof typeof subscriptions = keyof typeof subscriptions,
  TPublisherOptions extends TFunction.Arg0<typeof subscriptions[TPublisher]> = TFunction.Arg0<
    typeof subscriptions[TPublisher]
  >
> = [TPublisher, TPublisherOptions][];

export type SenderPushes<TRoleId extends string = string> = [
  TRoleId,
  { title: string; subtitle?: string; body?: string },
  PushNotificationOptions
][];

export type SenderEmails = Array<EmailTemplate>;
export type SenderReminderEmails = Array<ReminderEmailOptions>;

export type Sender<TOptions extends {} = {}> = (
  options: TOptions
) => Promise<{
  subscriptions?: SenderSubscriptions;
  pushes?: SenderPushes;
  emails?: SenderEmails;
  reminderEmails?: SenderReminderEmails;
}>;
