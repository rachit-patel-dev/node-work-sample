/*external modules*/
/*DB*/
import { getClientTransaction, sql } from '../../db';
import { Role, ROLE_TABLE } from '../../db/types/role';
import { PAYMENT_OPERATION_TABLE, PaymentOperation, PaymentOperationStatus } from '../../db/types/paymentOperation';
import { PAYMENT_TABLE } from '../../db/types/payment';
import { TASK_TABLE } from '../../db/types/task';
import { PHASE_TABLE } from '../../db/types/phase';
import { CONTRACT_TABLE } from '../../db/types/contract';
/*models*/
/*GQL*/
/*other*/
import jobWorker from '../../jobs';
import { StripeEvent } from './index';
import { StripeAccount } from '../account';
import { logger } from '../../logger';
import { sendNotification } from '../../notifications';

/**
 * Handles the account.updated event.
 * 
 * @param event - The Stripe event object.
 * @returns A Promise that resolves to void.
 */
export async function accountUpdatedEvent(event: StripeEvent<StripeAccount>): Promise<void> {
  logger.info(`Handling account.updated event: ${event.type} ${event.id}`);
  if (event.type !== 'account.updated') {
    return logger.warn(`Event is not supported: ${event.type}`);
  }

  const stripeAccount = event.data.object;
  await getClientTransaction(async client => {
    const {
      rows: [role]
    } = await client.query<Role & { prevStripeRequirements: Role['stripeRequirements'] }>(
      sql`UPDATE ${ROLE_TABLE} AS rt
      SET "stripeRequirements" = ${stripeAccount.requirements}
      FROM ${ROLE_TABLE} AS oldrt
      WHERE rt."id" = oldrt."id" AND
            rt."stripeId" = ${stripeAccount.id}
      RETURNING rt.*, oldrt."stripeRequirements" AS "prevStripeRequirements"`
    );
    if (!role) return;

    const { rows: operations } = await client.query<
      PaymentOperation & {
        paymentId: string;
        phaseId: string;
        isPayout: boolean;
      }
    >(
      sql`UPDATE ${PAYMENT_OPERATION_TABLE} AS pot
      SET "ownerError" = NULL,
          "proError" = NULL,
          "retries" = 0,
          "retryKey" = gen_random_uuid(),
          "status" = ${PaymentOperationStatus.Pending},
          "autoRetryOn" = NULL
      FROM ${PAYMENT_OPERATION_TABLE} AS oldpot
      INNER JOIN ${PAYMENT_TABLE} AS pt ON (pt."chargeId" = oldpot."id" OR pt."payoutId" = oldpot."id")
      join ${TASK_TABLE} tasks on tasks."paymentId" = pt."id"
      INNER JOIN ${PHASE_TABLE} AS pht ON (pht."id" = tasks."phaseId")
      INNER JOIN ${CONTRACT_TABLE} AS ct ON (ct."id" = pht."contractId")
      WHERE oldpot."id" = pot."id" AND
            ct."partnerId" = ${role.id} AND
            oldpot."autoRetryOn" IS NOT DISTINCT FROM ${event.type} AND
            oldpot."status" = ${PaymentOperationStatus.Failed}
      RETURNING pot.*,
                pt."id" AS "paymentId",
                pht."id" AS "phaseId",
                (pt."chargeId" IS DISTINCT FROM pot."id") AS "isPayout"`
    );

    // We send an email only if previously user was not disabled
    if (!(role.prevStripeRequirements as any)?.disabled_reason && (role.stripeRequirements as any)?.disabled_reason) {
      await sendNotification('stripeInfoRequired', { roleId: role.id });
    } else {
      const promises: Promise<any>[] = [];
      for (const operation of operations) {
        // TODO _what about this ?
        if (operation.isPayout) {
          promises.push(jobWorker.getQueue('release-payout').add({ paymentId: operation.paymentId }));
        } else {
          promises.push(jobWorker.getQueue('fund-phase').add({ phaseId: operation.phaseId }));
        }
      }
      await Promise.all(promises);
    }
  });
}
