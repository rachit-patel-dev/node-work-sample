/*external modules*/
import _ from 'lodash';
/*DB*/
import * as db from '../../../db';
import { Payment, PAYMENT_TABLE } from '../../../db/types/payment';
import { TASK_TABLE } from '../../../db/types/task';
import { PHASE_TABLE } from '../../../db/types/phase';
import { Contract, CONTRACT_TABLE, ContractPaymentPlan } from '../../../db/types/contract';
import { PaymentHistoryAction, PaymentHistoryType } from '../../../db/types/paymentHistory';
/*models*/
import { PaymentModel } from '../../../db/models/PaymentModel';
import { StripeModel } from '../../../db/models/StripeModel';
import { PaymentHistoryModel } from '../../../db/models/PaymentHistoryModel';
/*GQL*/
/*services*/
import { QuickBooksService } from '../QuickBooksService';
/*other*/

import QuickBooksTypes = QuickBooksService.Types;

/**
 * invoiceHandler is a handler function for the QuickBooks invoice update event.
 * It checks if the invoice balance is equal to 0 and performs various database operations if it is.
 * The function retrieves the contract and associated payments from the database based on the invoice ID.
 * If the contract payment plan is not MonthlySubscription, it logs a message and returns.
 * Otherwise, it creates payment history records, updates payment records, and creates fake payouts using the StripeModel.
 * Finally, it executes any events stored in the dbCtx.events array.
 */
export const invoiceHandler: QuickBooksTypes.TWebhookEntityHandler<QuickBooksTypes.Entity.Invoice> = {
  async OnUpdate(entity, ctx) {
    if (entity.Balance !== 0) {
      ctx.logger.info({ quickBooksInvoiceId: entity.Id }, `Invoice balance not equal 0. Skip.`);
      return;
    }

    const dbCtx = { sql: db.sql, events: [] };
    await db.getClientTransaction(async client => {
      const {
        rows: [contractWithPayments]
      } = await client.query<Contract & { payments: Payment[] }>(
        dbCtx.sql`
          SELECT contracts.*, "view"."paidOut"
                 array_agg(to_json(payments.*)) AS payments
          FROM ${PAYMENT_TABLE} payments
            INNER JOIN ${TASK_TABLE} tasks
               INNER JOIN ${PHASE_TABLE} phases
                 INNER JOIN ${CONTRACT_TABLE} contracts ON contracts."id" = phases."contractId"
                 LEFT JOIN "paidOut_view" "view" ON "view"."contractId" = contracts.id
               ON phases."id" = tasks."phaseId"
             ON tasks."paymentId" = payments."id"
          WHERE payments."quickBooksInvoiceId" = ${entity.Id}
          GROUP BY contracts."id"
        `
      );
      if (contractWithPayments.paymentPlan !== ContractPaymentPlan.MonthlySubscription) {
        ctx.logger.info(
          {
            quickBooksInvoiceId: entity.Id,
            contractId: contractWithPayments.id,
            payments: _.map(contractWithPayments.payments, 'id')
          },
          `Contract has payment plan as Transaction (our system auto paid QBO Payment). Skip.`
        );
        return;
      }

      const { payments } = contractWithPayments;
      await Promise.all(
        _.map(payments, async payment => {
          await PaymentHistoryModel.create.exec(
            client,
            {
              paymentId: payment.id,
              proRoleId: contractWithPayments.partnerId!,
              action: PaymentHistoryAction.PayoutApproved,
              type: PaymentHistoryType.QuickBooks
            },
            dbCtx
          );

          await PaymentModel.update.exec(
            client,
            {
              id: payment.id,
              approvedAt: new Date()
            },
            dbCtx
          );
        })
      );

      await StripeModel.createFakePayouts.exec(
        client,
        {
          contractId: contractWithPayments.id,
          payments: _.map(payments, 'id'),
          paidOut: contractWithPayments.paidOut
        },
        dbCtx
      );
    });

    await Promise.all(_.map(dbCtx.events as any, event => event()));
  }
};
