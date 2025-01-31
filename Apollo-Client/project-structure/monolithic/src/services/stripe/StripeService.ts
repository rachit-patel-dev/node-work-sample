/*external modules*/
import _ from 'lodash';
import Stripe from 'stripe';
import moment from 'moment';
/*DB*/
import { redis } from '../../db/redis';
/*models*/
/*GQL*/
import { GraphQLError } from '../../gql';
/*other*/
import jobWorker from '../../jobs';
import { config } from '../../config';
import { logger } from '../../logger';
import { StripeActionFailed } from '../../notifications/emails/option-types';

export namespace StripeService {
  export type Error = Stripe.Errors;

  export const stripe = new Stripe(config.secrets.stripeSecret, {
    // eslint-disable-next-line
    // @ts-ignore
    apiVersion: '2020-03-02' // TODO _TS Error: Type '"2020-03-02"' is not assignable to type '"2020-08-27"'
  });
  export const stripeDataConfig = {
    CURRENCY: 'usd',
    REFUND_REASON: 'requested_by_customer',
    STATEMENT_DESCRIPTOR: 'XYZ INC.'
  };

  export const stripeErrorTypes: Array<Stripe.RawErrorType> = [
    'card_error',
    'invalid_request_error',
    'api_error',
    'idempotency_error',
    'rate_limit_error',
    'authentication_error',
    'invalid_grant'
  ];

  /**
 * Checks if the given error is a Stripe error.
 * 
 * @param error - The error to check.
 * @returns True if the error is a Stripe error, false otherwise.
 */
  export function isStripeError(error: Error): boolean {
    const type = _.get(error, ['raw', 'type']);
    if (!type) return false;

    return _.some(stripeErrorTypes, errorType => errorType === type);
  }

  /**
 * Calculates the service fee based on the given amount and paid out value.
 * 
 * @param amount - The amount for which the service fee needs to be calculated.
 * @param paidOut - The paid out value.
 * @returns The calculated service fee.
 */
  export function getServiceFee(amount: number, paidOut: number): number {
    let feePercentage: number;

    // TODO: move to env params
    if (paidOut > 1000_000_00) {
      feePercentage = 1.5 / 100;
    } else {
      feePercentage = 2 / 100;
    }

    return Math.round(amount * feePercentage);
  }

  /**
 * Calculates the reduced service fee for a given amount and paid out value.
 * 
 * @param amount - The total amount.
 * @param paidOut - The amount already paid out.
 * @returns The reduced service fee.
 */
  export function reduceServiceFee(amount: number, paidOut: number): number {
    return Math.round(amount - getServiceFee(amount, paidOut));
  }

  /**
   *  Metadata limits:
   *   - 50 keys
   *   - key names up to 40 characters long
   *   - values up to 500 characters long
   * */
  export function checkMetadataLimits(prefix: string, arr: Array<string>): { status: boolean; text?: string } {

    if (prefix.length === 0) {
      return {
        status: false,
        text: `"key name" is tiny`
      };
    }

    if (prefix.length + 3 > 40) {
      return {
        status: false,
        text: `"key name" limit is exceeded`
      };
    }

    const arrSize = _.size(arr);

    let iter = 0;
    let keysLeft = 50;
    let currentValueLength = 0;

    while (iter < arrSize) {
      const valueLength = arr[iter].length;

      if (currentValueLength + valueLength > 500) {
        keysLeft--;
        currentValueLength = 0;
      }

      if (keysLeft < 1) {
        return {
          status: false,
          text: 'Metadata limit exceeded'
        };
      }

      currentValueLength += valueLength;
      iter++;
    }

    return {
      status: true
    };
  }

  /**
 * Builds metadata for new entities.
 * 
 * @param prefix - The prefix for the metadata keys.
 * @param arr - An array of strings representing the metadata values.
 * @returns A record of key-value pairs representing the metadata.
 * @throws Error if the metadata limits are exceeded.
 */  
  export function buildMetadata(prefix: string, arr: Array<string>): Record<string, string> {
    const { status, text } = checkMetadataLimits(prefix, arr);
    if (!status) {
      throw new Error(text ?? `Limit metadata error`);
    }

    const metadata: Record<string, string> = {};

    let currentGroup = 1;
    _.forEach(arr, item => {
      let key = `${prefix}-${currentGroup}`;
      const value = metadata[key] ?? '';

      const nextLength = value.length + item.length + 1;
      if (nextLength >= 500) {
        key = `${prefix}-${++currentGroup}`;
        metadata[key] = item;
      } else {
        metadata[key] = (value.length ? value + ',' : value) + item;
      }
    });

    return metadata;
  }

  /**
 * Parses the metadata object and returns an array of values that match the given prefix.
 *
 * @param {string} prefix - The prefix to filter the metadata keys.
 * @param {Record<string, string>} metadata - The metadata object to parse.
 * @returns {Array<string>} - An array of values that match the given prefix.
 *
 * @note This function is used for new entities.
 */  
  export function parseMetadata(prefix: string, metadata: Record<string, string>): Array<string> {
    return _.chain(Object.entries(metadata))
      .filter(([key]) => key.startsWith(prefix))
      .orderBy(([key]) => parseInt(key.replace(prefix + '-', '')), ['asc'])
      .flatMap(([, value]) => value.split(','))
      .value();
  }

  export namespace Payout {
    export type TPayout = Stripe.Payout;

    export namespace create {
      export type TArgs = {
        amount: number;
        description: string;
        metadata: {
          payouts: string;
        };
        stripeAccount: string;
        retryKey: string;
      };
      export type TReturn = Stripe.Payout | undefined;
      export const exec: (args: TArgs) => Promise<TReturn> = async args => {
        try {
          const payoutData: Stripe.PayoutCreateParams = {
            statement_descriptor: stripeDataConfig.STATEMENT_DESCRIPTOR,
            currency: stripeDataConfig.CURRENCY,
            source_type: 'bank_account',
            amount: args.amount,
            description: args.description,
            metadata: {
              ...args.metadata,
              envName: config.name
            }
          };

          return await stripe.payouts.create(payoutData, {
            stripeAccount: args.stripeAccount,
            idempotencyKey: args.retryKey
          });
        } catch (error) {
          await handleError(error, 'Payout.create', args);
        }
      };
    }
  }

  export namespace Charge {
    export type TCharge = Stripe.Charge;

    export namespace getBalanceTransactionAvailableDate {
      export type TArgs = { chargeId: string } | { transactionId: string };
      export type TReturn = Date | undefined;
      export const exec: (args: TArgs) => Promise<TReturn> = async args => {
        let transactionId: string;

        if ('chargeId' in args) {
          const { transfer } = await stripe.charges.retrieve(args.chargeId, {
            expand: ['transfer']
          });
          transactionId = (transfer as Stripe.Transfer).balance_transaction as string;
        } else {
          transactionId = args.transactionId;
        }

        if (transactionId) {
          const balanceTransaction = await stripe.balanceTransactions.retrieve(transactionId);
          return new Date(balanceTransaction.available_on * 1000);
        }
      };
    }

    export namespace create {
      export type TArgs = {
        amount: number;
        appFeeAmount: number;
        description: string;
        customer: string;
        retryKey: string;
        metadata: {
          charges: string[];
        };
        transfer_data: {
          destination: string;
        };
      };
      export type TReturn = Stripe.Charge | undefined;
      export const exec: (args: TArgs) => Promise<TReturn> = async args => {
        try {
          const chargeData: Stripe.ChargeCreateParams = {
            amount: args.amount,
            description: args.description,
            customer: args.customer,
            application_fee_amount: args.appFeeAmount,
            metadata: {
              charges: args.metadata.charges.join(','),
              envName: config.name
            },
            transfer_data: {
              ...args.transfer_data
            },
            currency: stripeDataConfig.CURRENCY
          };

          return await stripe.charges.create(chargeData, {
            idempotencyKey: args.retryKey
          });
        } catch (error) {
          await handleError(error, 'Charge.create', args);
        }
      };
    }
    /**
 * Executes the 'list' operation for charges.
 * 
 * @param args - The arguments for the operation.
 * @param args.customer - The customer ID.
 * @param args.createdAt - Optional. The date range for filtering charges.
 * @param args.createdAt.gte - Optional. The minimum date for filtering charges.
 * @param args.createdAt.lte - Optional. The maximum date for filtering charges.
 * 
 * @returns A Promise that resolves to an ApiList of charges.
 */
    export namespace list {
      export type TArgs = {
        customer: string;
        createdAt?: Date | { gte: any; lte: any };
      };
      export type TReturn = Stripe.ApiList<Stripe.Charge>;
      export const exec: (args: TArgs) => Promise<TReturn> = async args => {
        const listData: Stripe.ChargeListParams = {
          customer: args.customer
        };

        if (args.createdAt) {
          listData.created = _.isDate(args.createdAt) ? args.createdAt.valueOf() : args.createdAt;
        }

        return stripe.charges.list(listData);
      };
    }
  }

  export namespace Subscription {
    export type TSubscription = Stripe.Subscription;

    export namespace create {
      export type TArgs = {
        customer: string;
        quantity: number;
        metadata?: Record<string, string>;
        paymentMethodId?: string;
        sourceId?: string;
      };
      export type TReturn = TSubscription | undefined;
      export const exec: (args: TArgs) => Promise<TReturn> = async args => {
        try {
          const billingCycleAnchor = moment()
            .set({
              ...(config.stripe.livemode ? { date: 1 } : {}),
              hours: 1,
              minutes: 0,
              seconds: 0
            })
            .add(1, config.stripe.livemode ? 'month' : 'day')
            .valueOf();

          const subscriptionCreateData: Stripe.SubscriptionCreateParams = {
            customer: args.customer,
            cancel_at_period_end: false,
            /**
             *  "cancel_at_period_end" - Boolean indicating whether this subscription should cancel at the end of the current period.
             * */
            payment_behavior: 'allow_incomplete',
            /**
             *    https://stripe.com/docs/api/subscriptions/create#create_subscription-payment_behavior
             *    "payment_behavior"="allow_incomplete" -
             *      Use allow_incomplete to create subscriptions with status=incomplete if the first invoice cannot be paid.
             *      Creating subscriptions with this status allows you to manage scenarios
             *      where additional user actions are needed to pay a subscription’s invoice.
             *      For example, SCA regulation may require 3DS authentication to complete payment.
             * */
            billing_cycle_anchor: Math.floor(billingCycleAnchor / 1000),
            /**
             *    https://stripe.com/docs/billing/subscriptions/billing-cycle
             *    "billing_cycle_anchor" -
             *      A future timestamp to anchor the subscription’s billing cycle.
             *      This is used to determine the date of the first full invoice,
             *      and, for plans with month or year intervals, the day of the month for subsequent invoices.
             * */
            collection_method: 'charge_automatically',
            /**
             *    https://stripe.com/docs/api/subscriptions/create#create_subscription-collection_method
             *    "collection_method"="charge_automatically" -
             *      When charging automatically, Stripe will attempt to pay this subscription at the end of the cycle using the default source attached to the customer.
             * */
            proration_behavior: 'create_prorations', // default
            /**
             *    https://stripe.com/docs/api/subscriptions/create#create_subscription-proration_behavior
             *    https://stripe.com/docs/billing/subscriptions/prorations
             *    "proration_behavior" - will cause proration invoice items to be created when applicable.
             * */
            items: [
              {
                price: config.stripe.priceId,
                quantity: args.quantity
              }
            ],
            metadata: args.metadata ?? {}
          };

          if (args.paymentMethodId) {
            subscriptionCreateData.default_payment_method = args.paymentMethodId;
          }

          if (args.sourceId) {
            subscriptionCreateData.default_source = args.sourceId;
          }

          return await stripe.subscriptions!.create(subscriptionCreateData);
        } catch (error) {
          await handleError(error, 'Subscription.create', args);
        }
      };
    }
  }
/**
 * Executes the 'SubscriptionItem.exec' function.
 * 
 * @param args - The arguments for the function.
 * @returns A promise that resolves to a 'TSubscriptionItem' object or 'undefined'.
 * @throws {GraphQLError} If there is an error during execution.
 */
  export namespace SubscriptionItem {
    export type TSubscriptionItem = Stripe.SubscriptionItem;

    export namespace increaseQuantity {
      export type TArgs = {
        id: string;
        quantity: number;
      };
      export type TReturn = TSubscriptionItem | undefined;
      export const exec: (args: TArgs) => Promise<TReturn> = async args => {
        try {
          return await stripe.subscriptionItems!.update(args.id, {
            quantity: args.quantity,
            proration_behavior: 'always_invoice',
            /**
             *    https://stripe.com/docs/api/subscription_items/update#update_subscription_item-proration_behavior
             *    "proration_behavior"="always_invoice" -
             *      will cause proration invoice items to be created when applicable.
             *      Passes "always_invoice" for in order to always invoice immediately for prorations
             * */
            payment_behavior: 'allow_incomplete'
            /**
             *    https://stripe.com/docs/api/subscriptions/create#create_subscription-payment_behavior
             *    "payment_behavior"="allow_incomplete" -
             *      Use allow_incomplete to create subscriptions with status=incomplete if the first invoice cannot be paid.
             *      Creating subscriptions with this status allows you to manage scenarios
             *      where additional user actions are needed to pay a subscription’s invoice.
             *      For example, SCA regulation may require 3DS authentication to complete payment.
             * */
          });
        } catch (error) {
          await handleError(error, 'SubscriptionItem.increaseQuantity', args);
        }
      };
    }

    export namespace reduceQuantity {
      export type TArgs = {
        id: string;
        quantity: number;
      };
      export type TReturn = TSubscriptionItem | undefined;
      export const exec: (args: TArgs) => Promise<TReturn> = async args => {
        try {
          return await stripe.subscriptionItems!.update(args.id, {
            quantity: args.quantity,
            proration_behavior: 'none'
            /**
             *    "proration_behavior"="none" - disabled prorations
             * */
          });
        } catch (error) {
          await handleError(error, 'SubscriptionItem.increaseQuantity', args);
        }
      };
    }
  }
}

/**
 * Handles errors that occur during the execution of a Stripe request.
 * 
 * @param error - The error object that was thrown.
 * @param action - The name of the Stripe action that was being executed.
 * @param args - The arguments that were passed to the Stripe action.
 * @returns A Promise that resolves to void.
 * @throws GraphQLError - If the error is a Stripe error, a GraphQLError is thrown with the error message.
 */
const handleError = async (error: any, action: string, args: any): Promise<void> => {
  const isStripeError = StripeService.isStripeError(error);
  if (!isStripeError) {
    logger.error('Not a stripe error', error);
    throw error;
  }

  const err = `Stripe account ${error.raw?.headers['stripe-account']}: ${error.raw?.message}`;
  const isSent = !!(await redis.get(
    `stripe-service-error:${error.raw?.headers['stripe-account']}-${action}-${error.raw?.code}`
  ));
  if (isSent) return;

  logger.error(err, `Stripe ${action} request execution error`);
  await jobWorker.getQueue('send-email').add({
    template: 'stripeActionFailed',
    subject: `IMPORTANT: An attempt to complete ${action} request failed`,
    to: config.emails.alertEmails,
    locals: { action, args, error: err }
  } as StripeActionFailed);

  await redis.set(
    `stripe-service-error:${error.raw?.headers['stripe-account']}-${action}-${error.raw?.code}`,
    true,
    'EX',
    60
  ); // 1 min
  throw new GraphQLError(err, 400);
};
