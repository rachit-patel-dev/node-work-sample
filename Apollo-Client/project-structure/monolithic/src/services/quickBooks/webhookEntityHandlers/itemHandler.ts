/*external modules*/
import _ from 'lodash';
/*DB*/
import * as db from '../../../db';
/*models*/
import { PhaseModel } from '../../../db/models/PhaseModel';
/*GQL*/
import { GraphQLError } from '../../../gql';
/*services*/
import { QuickBooksService } from '../QuickBooksService';
/*other*/

import QuickBooksTypes = QuickBooksService.Types;

/**
 * Represents the itemHandler object which handles the OnUpdate event for the QuickBooks item entity.
 * 
 * @property {Function} OnUpdate - Handles the OnUpdate event for the QuickBooks item entity.
 * @param {QuickBooksTypes.Entity.Item} entity - The updated QuickBooks item entity.
 * @param {any} ctx - The context object.
 * @returns {Promise<void>} - A promise that resolves when the update operation is completed.
 */
export const itemHandler: QuickBooksTypes.TWebhookEntityHandler<QuickBooksTypes.Entity.Item> = {
  async OnUpdate(entity, ctx) {
    const dbCtx = { sql: db.sql, events: [] };
    await db.getClientTransaction(async client => {
      const phase = await PhaseModel.findByQuickBooksItemId.exec(
        client,
        {
          quickBooksItemId: entity.Id
        },
        dbCtx
      );
      if (!phase) throw GraphQLError.notFound('phase');

      if (phase.quickBooksItemName !== entity.Name) {
        await PhaseModel.update.exec(
          client,
          {
            id: phase.id,
            quickBooksItemName: entity.Name
          },
          dbCtx
        );

        ctx.logger.info(
          {
            ..._.pick(phase, ['id', 'quickBooksItemId', 'quickBooksItemName']),
            newQuickBooksItemName: entity.Name
          },
          `Quick Books Item name updated.`
        );
      }
    });

    await Promise.all(_.map(dbCtx.events as any, event => event()));
  }
};
