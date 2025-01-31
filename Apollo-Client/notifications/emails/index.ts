import * as fs from 'fs';
import * as path from 'path';
import ejs from 'ejs';
import mjml from 'mjml';
import { logger } from '../../logger';
import * as optionTypes from './option-types';

const cache: { [key: string]: ejs.TemplateFunction } = {};

/**
 * Looks up a template file and compiles it with the provided data.
 * If the template is already in cache and the data does not require MJML chart, the cached template is returned.
 * If the data requires MJML chart, the template is compiled with MJML and the resulting HTML is returned.
 * If the template is not in cache, it is read from the file system, compiled with MJML if required, and cached for future use.
 *
 * @param filepath - The path to the template file.
 * @param data - The data to be used for compiling the template.
 * @returns A Promise that resolves to the compiled template as a string.
 */
export async function lookup(filepath: string, data: Record<string, any>): Promise<string> {
  if (!data.usingMJMLChart && cache[filepath]) return cache[filepath](data);

  const filePath = path.join(__dirname, `${filepath}.mjml`);
  const content = await new Promise<string>((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (readError, content) => {
      if (readError) return reject(readError);
      resolve(content);
    });
  });

  if (data.usingMJMLChart) {
    const render = ejs.compile(content);
    const result = render(data);

    const template = mjml(result, {
      validationLevel: 'soft',
      filePath,
      mjmlConfigPath: path.join(__dirname, '../../../.mjmlconfig')
    });

    if (template.errors.length > 0) {
      logger.error(template.errors, `MJML is not valid`);
    }

    return ejs.compile(template.html)(data);
  }

  // @TODO: Get rid of MJML. It is to heavy-weight
  const template = mjml(content, {
    validationLevel: 'soft',
    filePath
  });

  if (template.errors.length > 0) {
    logger.error(template.errors, `MJML is not valid`);
  }

  cache[filepath] = ejs.compile(template.html);
  return cache[filepath](data);
}


export type EmailTemplate = optionTypes.EmailBasicOptions &
  (
    | optionTypes.TaskMoved
    | optionTypes.TaskUpdated
    | optionTypes.TaskAssigneeChanged
    | optionTypes.TaskCommentCreated
    | optionTypes.ContractStartedOwner
    | optionTypes.ContractStartedPro
    | optionTypes.ContractEndedAdmin
    | optionTypes.ContractEndedOwner
    | optionTypes.ContractEndedPro
    | optionTypes.ChangeOrderApproved
    | optionTypes.ChangeOrderDeclinedPro
    | optionTypes.ChangeOrderDeferredPro
    | optionTypes.ChangeOrderNeedsClarificationPro
    | optionTypes.ChangeOrderOutdatedPro
    | optionTypes.ChangeOrderCreated
    | optionTypes.ChangeOrderEdited
    | optionTypes.ChangeOrderCommented
    | optionTypes.PayoutDeclined
    | optionTypes.PayoutRequested
    | optionTypes.PayoutFailed
    | optionTypes.PayoutReleasedOwner
    | optionTypes.PayoutReleasedPro
    | optionTypes.PayoutReleased
    | optionTypes.PaymentFailed
    | optionTypes.StripeActionFailed
    | optionTypes.FundPhase
    | optionTypes.FundPhaseRequested
    | optionTypes.ContractCollaboratorCreated
    | optionTypes.ContractCollaboratorCreatedUser
    | optionTypes.ContractCollaboratorInvited
    | optionTypes.FillProfilesPro
    | optionTypes.BookDownload
    | optionTypes.ConfirmEmail
    | optionTypes.EstimateDeclinedPro
    | optionTypes.EstimateDeferredPro
    | optionTypes.EstimateNeedsClarificationPro
    | optionTypes.InitPasswordReset
    | optionTypes.EstimateSubmittedOwner
    | optionTypes.ContractCreatedPro
    | optionTypes.SupportRequestCreated
    | optionTypes.PasswordChanged
    | optionTypes.ProjectInviteDeclinedOwner
    | optionTypes.ProjectInviteAcceptedOwner
    | optionTypes.ProjectInviteOwner
    | optionTypes.ProjectInvitePro
    | optionTypes.GenericNotification
    | optionTypes.TeamInviteAccepted
    | optionTypes.TeamInviteDeclined
    | optionTypes.TeamInviteCreatedUser
    | optionTypes.TeamInviteCreated
    | optionTypes.StripeInfoRequiredPro
    | optionTypes.DocumentCreated
    | optionTypes.MessageSent
    | optionTypes.DecisionActioned
    | optionTypes.DecisionSubmitted
    | optionTypes.DecisionUpdated
    | optionTypes.TaskReminder
    | optionTypes.Welcome
    | optionTypes.WelcomeNoAvailablePros
    | optionTypes.HowToReviewAndAcceptAnEstimate
    | optionTypes.AcceptingYourEstimate
    | optionTypes.PaymentsAndDeposits
    | optionTypes.HowToSubmitAChangeOrder
    | optionTypes.DocumentManagement
    | optionTypes.MonitoringProjectTasks
    | optionTypes.MessageCreated
    | optionTypes.EODUnreadMessagesSummary
    | optionTypes.DebitExpiration
    | optionTypes.NotUpdatedTaskboard
    | optionTypes.NotUpdatedTaskboardCritical
    | optionTypes.ReminderPayoutRequested
    | optionTypes.ReminderChangeOrderCreated
    | optionTypes.ReminderEstimateSubmitted
    | optionTypes.ReminderNotSelectAnyProsDay3And6
    | optionTypes.ReminderNotSelectAnyProsDay9And14
    | optionTypes.ReminderNotSelectAnyProsDay21
    | optionTypes.WeeklySummary
    | optionTypes.ReminderVerifiedStripeAccount
    | optionTypes.MonthlySubscriptionPaymentFailed
    | optionTypes.ContractAutoClose
    | optionTypes.ContractCollaboratorRequestedToDelete
    | optionTypes.UnverifiedUserEmail
    | optionTypes.NoActivityAfterSignUp
  );
