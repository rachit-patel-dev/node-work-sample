import { makeStripeRequest, StripeResponseObject } from './makeStripeRequest';

export interface StripeTransfer extends StripeResponseObject {
  object: 'transfer';
  balance_transaction: string;
}

/**
 * Get stripe transfer by Id
 * https://stripe.com/docs/api/transfers/retrieve
 *
 * @param transferId ID
 */
export function retrieve(transferId: string) {
  return makeStripeRequest<StripeTransfer>(`/v1/transfers/${transferId}`);
}
