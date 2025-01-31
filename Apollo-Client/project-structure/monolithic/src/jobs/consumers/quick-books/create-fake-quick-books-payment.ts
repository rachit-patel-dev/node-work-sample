/*external modules*/
import _ from 'lodash';
import { Job } from 'bull';
/*DB*/
import * as db from '../../../db';
import { getClientTransaction } from '../../../db';
import { Payment, PAYMENT_TABLE } from '../../../db/types/payment';
import { Contract } from '../../../db/types/contract';
/*models*/
import { QuickBooksIntegrationModel } from '../../../db/models/QuickBooksIntegrationModel';
import { RoleModel } from '../../../db/models/RoleModel';
import { ContractModel } from '../../../db/models/ContractModel';
/*GQL*/
import { GraphQLError } from '../../../gql';
/*services*/
import { QuickBooksService } from '../../../services/quickBooks/QuickBooksService';
/*other*/
import { logger } from '../../../logger';

import QuickBooksError = QuickBooksService.QuickBooksError;

export interface CreateFakeQuickBooksPaymentOptions {
  contractId: Contract['id'];
  payments: Array<Payment['id']>;
}

/**
 * Creates a fake QuickBooks payment consumer.
 * 
 * @param job - The job containing the data for creating the fake QuickBooks payment consumer.
 * @returns A Promise that resolves to void.
 */
export async function createFakeQuickBooksPaymentConsumer(job: Job<CreateFakeQuickBooksPaymentOptions>): Promise<void> {
  const scope = `create-fake-quick-books-payment`;

  logger.info(`Started ${scope}`, job.data);

  const { contractId, payments } = job.data;

  const ctx = { sql: db.sql, events: [] };
  const { quickBooksCustomerId, quickBooksCustomerDisplayName, quickBooksInvoiceId, oauthClient } = await db.getClient(
    async client => {
      const contract = await ContractModel.findById.exec(
        client,
        {
          contractId
        },
        ctx
      );
      if (!contract) throw GraphQLError.notFound('contract');
      if (!contract.quickBooksCustomerId || !contract.quickBooksCustomerDisplayName) {
        throw new GraphQLError(`Contract haven't Quick Books customer id or customer display name.`);
      }

      const { rows: result } = await client.query<
        Required<Pick<Payment, 'id' | 'quickBooksInvoiceId' | 'quickBooksPaymentId'>>
      >(
        ctx.sql`
          SELECT payments."id",
                 payments."quickBooksInvoiceId",
                 payments."quickBooksPaymentId"
          FROM ${PAYMENT_TABLE} payments
          WHERE payments."id" = ANY(${payments});
        `
      );

      const uniqQuickBooksPayments = _.chain(result)
        .map('quickBooksPaymentId')
        .uniq()
        .compact()
        .value();
      if (!_.isEmpty(uniqQuickBooksPayments)) {
        logger.error(
          job.data,
          `Some Payments have not empty Quick Books Payment id. Undefined behavior further.`,
          result
        );
        throw new GraphQLError(`Some Payments have not empty Quick Books Payment id.`);
      }

      const uniqQuickBooksInvoices = _.uniq(_.map(result, 'quickBooksInvoiceId'));
      if (_.size(uniqQuickBooksPayments) > 1) {
        logger.error(
          job.data,
          `Payments have different Quick Books Invoice id but must have only one. Undefined behavior further.`,
          result
        );
        throw new GraphQLError(`Payments have different Quick Books Invoice id.`);
      }

      const [quickBooksInvoiceId] = uniqQuickBooksInvoices;
      if (!quickBooksInvoiceId) {
        logger.error(job.data, `Payments haven't Quick Books Invoice id.`, result);
        throw new GraphQLError(`Payments haven't Quick Books Invoice id.`);
      }

      const quickBooksIntegration = await RoleModel.getQuickBooksIntegration.exec(
        client,
        {
          roleId: contract.partnerId!
        },
        ctx
      );
      if (!quickBooksIntegration) throw GraphQLError.notFound('Quick Books Integration record');

      const { client: oauthClient } = await QuickBooksIntegrationModel.getUpToDateClient.exec(
        client,
        quickBooksIntegration,
        ctx
      );

      return {
        quickBooksCustomerId: contract.quickBooksCustomerId,
        quickBooksCustomerDisplayName: contract.quickBooksCustomerDisplayName,
        quickBooksInvoiceId,
        oauthClient
      };
    }
  );

  let quickBooksInvoice: QuickBooksService.Types.IInvoice | undefined;
  try {
    quickBooksInvoice = await QuickBooksService.Invoice.getById.exec(oauthClient, { invoiceId: quickBooksInvoiceId });
    if (!quickBooksInvoice) throw QuickBooksError.notFound('Quick Books Invoice');
  } catch (error) {
    logger.error(error, `Error on request Quick Books Invoice: "${quickBooksInvoiceId}" by id!`, job.data);
    throw error;
  }

  let quickBooksPaymentId!: string;
  try {
    const quickBooksInvoiceLines = quickBooksInvoice!.Line;
    const quickBooksInvoiceSalesDetail = _.find(quickBooksInvoiceLines, { Id: '1' })!; // our SalesItemLineDetail will always have "id"=1

    const amount = quickBooksInvoiceSalesDetail.Amount * 100; // from dollar to cent

    const quickBooksPayment = await QuickBooksService.Payment.createFakeInvoicePayment.exec(oauthClient, {
      invoiceId: quickBooksInvoice!.Id,
      customerId: quickBooksCustomerId,
      customerDisplayName: quickBooksCustomerDisplayName,
      amount: amount
    });
    quickBooksPaymentId = quickBooksPayment.Id;
  } catch (error) {
    logger.error(error, 'Error when creating Payment record in QBO.', job.data);
    throw error;
  }

  await getClientTransaction(async client => {
    await client.query(
      ctx.sql`
        UPDATE ${PAYMENT_TABLE}
        SET "quickBooksPaymentId" = ${quickBooksPaymentId}
        WHERE "id" = ANY(${payments})
      `
    );
  });

  await Promise.all(_.map(ctx.events as any[], event => event()));

  logger.info(`Completed ${scope}`, job.data);
}
