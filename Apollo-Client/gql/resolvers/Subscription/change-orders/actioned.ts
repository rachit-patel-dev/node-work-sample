/*external modules*/
/*DB*/
import { getClient } from '../../../../db';
import { Contract } from '../../../../db/types/contract';
/*models*/
import { ChangeOrderModel } from '../../../../db/models/ChangeOrderModel';
/*GQL*/
import { defSubscription, GraphQLError, pubsub } from '../../..';
import { validateContractAccess, WithContractAccess } from '../../../checks/validateContractAccess';
import { ActionedChangeOrder, ChangeOrderAction } from '../../Types/ChangeOrder/ChangeOrderAction';
/*other*/
import { changeOrderActionedTopic } from '../../../../notifications/subscriptions/change-orders/actioned';

type TSubscribeArgs = { contractId: string };
type TResolvePayload = {
  changeOrderId: string;
  action: ChangeOrderAction;
};
type TResolveReturn = ActionedChangeOrder;

/**
 * Defines a subscription for the "changeOrderActioned" event.
 *
 * @param contractId - The ID of the contract.
 * @returns An async iterator that emits the actioned change orders for the specified contract.
 * @throws {GraphQLError} If the change order is not found.
 */
defSubscription<TSubscribeArgs, TResolvePayload, TResolveReturn>(
  `changeOrderActioned(contractId: ID!): ActionedChangeOrder! @authenticated`,
  async (_root, { contractId }, ctx) => {
    const hasContractAccess = ctx.sql.contractAccess(contractId, ctx.currentUser!.lastRoleId, {
      checkContractEnded: true
    });

    const {
      rows: [contract]
    } = await ctx.db.pool.query<WithContractAccess<Contract>>(
      ctx.sql`
        SELECT ${hasContractAccess} as "contractAccess"
      `
    );
    validateContractAccess(contract);

    const topic = changeOrderActionedTopic(contractId);
    return pubsub.asyncIterator(topic);
  },
  ({ changeOrderId, action }, _args, ctx) => {
    if (action === ChangeOrderAction.Deleted) {
      return {
        changeOrderId,
        action
      };
    }

    return getClient(async client => {
      const changeOrder = await ChangeOrderModel.findById.exec(
        client,
        {
          changeOrderId
        },
        ctx
      );
      if (!changeOrder) throw GraphQLError.notFound('Change Order');

      return {
        changeOrder,
        action
      };
    });
  }
);
