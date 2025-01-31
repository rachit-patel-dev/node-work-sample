import { pubsub } from '../../../gql';
import { ChangeOrder } from '../../../db/types/changeOrder';

/**
 * Generates a topic string for a change order update event.
 * 
 * @param contractId - The contract ID associated with the change order.
 * @returns The topic string in the format 'sub:contract-change-orders-updated:{contractId}'.
 */
export function changeOrderUpdatedTopic({ contractId }: Pick<ChangeOrder, 'contractId'>): string {
  return `sub:contract-change-orders-updated:${contractId}`;
}

/**
 * Publishes a change order update event to the specified topic.
 * 
 * @param changeOrder - The change order object containing the id and contractId.
 * @returns A promise that resolves to void.
 */
export function publishChangeOrderUpdated(changeOrder: Pick<ChangeOrder, 'id' | 'contractId'>): Promise<void> {
  const topic = changeOrderUpdatedTopic(changeOrder);
  return pubsub.publish(topic, { changeOrderId: changeOrder.id });
}
