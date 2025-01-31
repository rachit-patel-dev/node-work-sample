/*external modules*/
import _ from 'lodash';
/*DB*/
import * as db from '../../../db';
/*models*/
import { ContractModel } from '../../../db/models/ContractModel';
/*GQL*/
import { GraphQLError } from '../../../gql';
/*services*/
import { QuickBooksService } from '../QuickBooksService';
/*other*/

import QuickBooksTypes = QuickBooksService.Types;

/**
 * This code snippet defines a customerHandler object that handles the OnUpdate event for a QuickBooks customer entity.
 * The handler performs the following tasks:
 * 1. Retrieves a contract from the database based on the QuickBooks customer ID.
 * 2. If the contract is found, checks if the QuickBooks customer display name has changed.
 * 3. If the display name has changed, updates the contract in the database with the new display name.
 * 4. Logs an info message with the updated contract details.
 * 5. Executes any events in the dbCtx.events array.
 * 
 * @param entity - The QuickBooks customer entity that triggered the event.
 * @param ctx - The context object containing the logger and other utilities.
 * @returns {Promise<void>} - A promise that resolves when the handler has completed its tasks.
 */
export const customerHandler: QuickBooksTypes.TWebhookEntityHandler<QuickBooksTypes.Entity.Customer> = {
  async OnUpdate(entity, ctx) {
    const dbCtx = { sql: db.sql, events: [] };
    await db.getClientTransaction(async client => {
      const contract = await ContractModel.findByQuickBooksCustomerId.exec(
        client,
        {
          quickBooksCustomerId: entity.Id
        },
        dbCtx
      );
      if (!contract) throw GraphQLError.notFound('contract');

      if (contract.quickBooksCustomerDisplayName !== entity.DisplayName) {
        await ContractModel.update.exec(
          client,
          {
            id: contract.id,
            quickBooksCustomerDisplayName: entity.DisplayName
          },
          dbCtx
        );

        ctx.logger.info(
          {
            ..._.pick(contract, ['id', 'quickBooksCustomerId', 'quickBooksCustomerDisplayName']),
            newQuickBooksCustomerDisplayName: entity.DisplayName
          },
          `Quick Books Customer display name updated.`
        );
      }
    });

    await Promise.all(_.map(dbCtx.events as any, event => event()));
  }
};
