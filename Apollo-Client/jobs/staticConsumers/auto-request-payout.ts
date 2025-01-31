/*external modules*/
import _ from 'lodash';
import { Job } from 'bull';
/*DB*/
import { getClientTransaction } from '../../db';
import * as db from '../../db';
import { Phase, PHASE_TABLE } from '../../db/types/phase';
import { TASK_TABLE, TaskStatus } from '../../db/types/task';
import { Payment, PAYMENT_TABLE } from '../../db/types/payment';
import { PAYMENT_OPERATION_TABLE, PaymentOperationStatus } from '../../db/types/paymentOperation';
/*models*/
/*GQL*/
import { requestPayouts } from '../../gql/resolvers/Mutation/payments/requestPayouts';
/*other*/
import { logger } from '../../logger';
import { CONTRACT_TABLE } from '../../db/types/contract';

export interface AutoRequestPayoutOptions {}

/**
 * Executes the auto-request payout process for a given job.
 *
 * @param job - The job containing the auto-request payout options.
 * @returns A promise that resolves when the auto-request payout process is completed.
 */
export async function autoRequestPayoutConsumer(job: Job<AutoRequestPayoutOptions>) {
  const scope = `auto-request-payout`;

  logger.info(`Started ${scope}`, job.data);

  const ctx = { sql: db.sql, events: [] };
  const { phases } = await db.getClient(async client => {
    const { rows: phases } = await client.query<Phase & { payments: Payment[]; partnerId: string }>(
      // language=PostgreSQL
      ctx.sql`
        SELECT contracts."partnerId",
               phases.*,
               array_agg(row_to_json(payments.*)) "payments"
        FROM ${PHASE_TABLE} phases
            join ${CONTRACT_TABLE} contracts on contracts.id = phases."contractId"
          INNER JOIN ${TASK_TABLE} tasks
            INNER JOIN ${PAYMENT_TABLE} payments
              INNER JOIN ${PAYMENT_OPERATION_TABLE} charges
                ON charges."id" = payments."chargeId"
                AND charges."status" = ${PaymentOperationStatus.Succeeded}
                AND charges."availableAt" <= now()
            ON payments."id" = tasks."paymentId" AND payments."payoutRequestedAt" ISNULL
          ON tasks."phaseId" = phases."id"
          INNER JOIN ${TASK_TABLE} all_tasks ON all_tasks."phaseId" = phases."id"
        WHERE phases."autoPayoutRequest" = true
          AND phases."chargeApprovedAt" NOTNULL
        GROUP BY phases."id", contracts."partnerId"
        HAVING count(tasks.*) != 0
           AND count(tasks.*) FILTER (WHERE tasks.status = ${TaskStatus.Done}) = count(all_tasks.*);
      `.setName('auto-request-payout-20210809')
    );

    return { phases };
  });

  await Promise.all(
    _.map(phases, async phase => {
      await getClientTransaction(client => {
        const _ctx = {
          ...ctx,
          currentUser: {
            // id not needed here
            id: 'none',
            // email not needed here
            email: 'none',
            collectPersonalData: true,
            lastRoleId: phase.partnerId
          }
        };

        return requestPayouts(
          client,
          {
            payments: _.map(phase.payments, 'id'),
            comment: 'Auto requested payout'
          },
          _ctx
        );
      });
    })
  );

  await Promise.all(_.map(ctx.events as any[], event => event()));

  logger.info(`Completed ${scope}`, job.data);
}
