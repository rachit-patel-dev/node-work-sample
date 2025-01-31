/*external modules*/
import _ from 'lodash';
/*DB*/
import * as db from '../../../db';
/*models*/
import { QuickBooksIntegrationModel } from '../../../db/models/QuickBooksIntegrationModel';
/*GQL*/
import { GraphQLError } from '../../../gql';
/*services*/
import { QuickBooksService } from '../QuickBooksService';
/*other*/

import QuickBooksTypes = QuickBooksService.Types;

/**
 * This code snippet defines an `accountHandler` object with an `OnUpdate` method. 
 * The `OnUpdate` method is an asynchronous function that handles the update event for a QuickBooks account entity. 
 * 
 * @param entity - The updated account entity from QuickBooks.
 * @param ctx - The context object containing additional information and utilities.
 * @returns {Promise<void>} - A promise that resolves when the update operation is complete.
 */
export const accountHandler: QuickBooksTypes.TWebhookEntityHandler<QuickBooksTypes.Entity.Account> = {
  async OnUpdate(entity, ctx) {
    const dbCtx = { sql: db.sql, events: [] };
    await db.getClientTransaction(async client => {
      const quickBooksIntegration = await QuickBooksIntegrationModel.findByAccountId.exec(
        client,
        {
          accountId: entity.Id
        },
        dbCtx
      );
      if (!quickBooksIntegration) throw GraphQLError.notFound('Quick Books Integration Record');

      let dataForQuickBooksIntegrationUpdate: QuickBooksIntegrationModel.update.TArgs | undefined;
      if (entity.Id === quickBooksIntegration.incomeAccountId) {
        if (quickBooksIntegration.incomeAccountName !== entity.Name) {
          dataForQuickBooksIntegrationUpdate = {
            id: quickBooksIntegration.id,
            incomeAccountName: entity.Name
          };

          ctx.logger.info(
            {
              ..._.pick(quickBooksIntegration, ['id', 'incomeAccountId', 'incomeAccountName']),
              newIncomeAccountName: entity.Name
            },
            `Quick Books Income Account name updated.`
          );
        }
      } else {
        if (quickBooksIntegration.expenseAccountName !== entity.Name) {
          dataForQuickBooksIntegrationUpdate = {
            id: quickBooksIntegration.id,
            expenseAccountName: entity.Name
          };

          ctx.logger.info(
            {
              ..._.pick(quickBooksIntegration, ['id', 'expenseAccountId', 'expenseAccountName']),
              newExpenseAccountName: entity.Name
            },
            `Quick Books Expense Account name updated.`
          );
        }
      }

      if (dataForQuickBooksIntegrationUpdate) {
        await QuickBooksIntegrationModel.update.exec(client, dataForQuickBooksIntegrationUpdate, dbCtx);
      }
    });

    await Promise.all(_.map(dbCtx.events as any, event => event()));
  }
};
