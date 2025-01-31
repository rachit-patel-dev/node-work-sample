import * as querystring from 'querystring';
import * as url from 'url';
import { createVerify } from 'crypto';
import { logger as appLogger } from '../../logger';
import { config } from '../../config';
import { Mime } from '../../utils/mime';
import { makeRequest } from '../../http/client';
import * as bodyParser from '../../http/middleware/bodyParser';
import { signV4, apiUrl, AwsService } from './sign';

const logger = appLogger.child({ component: 'AWS SNS' });

const API_URL = apiUrl(AwsService.SNS);
const SUBSCRIPTION_ENDPOINT = config.utils.apiUrl('/aws/sns');

interface ListSubscriptionsByTopicResponse {
  ListSubscriptionsByTopicResponse: {
    ListSubscriptionsByTopicResult: {
      Subscriptions: {
        Endpoint: string;
        Protocol: 'https' | 'http';
        SubscriptionArn: string;
        TopicArn: string;
      }[];
    };
  };
}

interface SubscribeResponse {
  SubscribeResponse: {
    ResponseMetadata: {
      RequestId: string;
    };
    SubscribeResult: {
      SubscriptionArn: string;
    };
  };
}

/**
 * Create or request subscription for specified topic for current server
 */
export async function subscribe(topicArn: string) {
  logger.info(`Validating SNS subscription to the topic: ${topicArn}`);

  // Get the list of all available subscriptions
  // https://docs.aws.amazon.com/sns/latest/api/API_ListSubscriptionsByTopic.html
  const subscriptionsListBody = querystring.stringify({
    Action: 'ListSubscriptionsByTopic',
    TopicArn: topicArn
  });
  logger.info('Querying the list of existing subscriptions:');
  const subscriptionsListRes = await makeRequest(API_URL, {
    method: 'POST',
    headers: {
      'content-type': `${Mime.UrlEncoded}; charset=utf-8`,
      accept: Mime.JSON,
      'content-length': Buffer.byteLength(subscriptionsListBody)
    },
    body: subscriptionsListBody,
    middleware: [req => signV4(req, AwsService.SNS, subscriptionsListBody)]
  });

  if (
    !subscriptionsListRes.statusCode ||
    subscriptionsListRes.statusCode !== 200
  ) {
    const msg = await bodyParser.text(subscriptionsListRes);
    throw new Error(`Cannot get list of subscriptions for ${topicArn}: ${msg}`);
  }

  const subscriptionsListJson = await bodyParser.json<
    ListSubscriptionsByTopicResponse
  >(subscriptionsListRes);
  const subscriptionsList =
    subscriptionsListJson.ListSubscriptionsByTopicResponse
      .ListSubscriptionsByTopicResult.Subscriptions;
  logger.debug(subscriptionsList);

  const currentSubscription = subscriptionsList.find(
    subscription => subscription.Endpoint === SUBSCRIPTION_ENDPOINT
  );
  if (
    !currentSubscription ||
    currentSubscription.SubscriptionArn === 'PendingConfirmation'
  ) {
    // Subscribe
    // https://docs.aws.amazon.com/sns/latest/api/API_Subscribe.html
    logger.info('Subscribing');
    const subscribeBody = querystring.stringify({
      Action: 'Subscribe',
      Endpoint: SUBSCRIPTION_ENDPOINT,
      Protocol: 'https',
      TopicArn: topicArn,
      ReturnSubscriptionArn: true
    });
    const subscribeRes = await makeRequest(API_URL, {
      method: 'POST',
      headers: {
        'content-type': `${Mime.UrlEncoded}; charset=utf-8`,
        accept: Mime.JSON,
        'content-length': Buffer.byteLength(subscribeBody)
      },
      body: subscribeBody,
      middleware: [req => signV4(req, AwsService.SNS, subscribeBody)]
    });

    if (!subscribeRes.statusCode || subscribeRes.statusCode !== 200) {
      const msg = await bodyParser.text(subscribeRes);
      throw new Error(`Cannot subscribe to ${topicArn}: ${msg}`);
    }

    const subsribeJson = await bodyParser.json<SubscribeResponse>(subscribeRes);
    logger.debug(subsribeJson.SubscribeResponse.SubscribeResult);
    logger.info('Awaiting confirmation…');
  } else {
    return logger.info('Subscription is ready');
  }
}

/**
 * Confirm subscription with SubscriptionConfirmation message
 */
export async function confirmSubscription(message: SnsMessage) {
  if (!('Token' in message)) {
    throw new Error('Cannot confirm non-subscription message');
  }

  // Confirm existing subscription
  // https://docs.aws.amazon.com/sns/latest/api/API_ConfirmSubscription.html
  const body = querystring.stringify({
    Action: 'ConfirmSubscription',
    AuthenticateOnUnsubscribe: true,
    Token: message.Token,
    TopicArn: message.TopicArn
  });

  logger.info('Confirming subscription');
  const res = await makeRequest(API_URL, {
    method: 'POST',
    headers: {
      'content-type': `${Mime.UrlEncoded}; charset=utf-8`,
      accept: Mime.JSON,
      'content-length': Buffer.byteLength(body)
    },
    body,
    middleware: [req => signV4(req, AwsService.SNS, body)]
  });

  if (!res.statusCode || res.statusCode !== 200) {
    const msg = await bodyParser.text(res);
    throw new Error(
      `Cannot confirm subscribtion to ${message.TopicArn}: ${msg}`
    );
  }

  logger.info('Subscription confirmed');
}

const SNS_SIGNATURE_KEYS = [
  'Signature',
  'SigningCertURL',
  'SignatureVersion'
] as const;
const SNS_NOTIFICATION_KEYS = [
  'Message',
  'MessageId',
  'Timestamp',
  'TopicArn',
  'Type'
] as const;
const SNS_SUBSCRIPTION_KEYS = [
  'Message',
  'MessageId',
  'SubscribeURL',
  'Timestamp',
  'Token',
  'TopicArn',
  'Type'
] as const;

type SnsNotification = {
  [key in typeof SNS_NOTIFICATION_KEYS[number]]: string;
} & { Type: 'Notification' };
type SnsSubscription = {
  [key in typeof SNS_SUBSCRIPTION_KEYS[number]]: string;
} & { Type: 'SubscriptionConfirmation' | 'UnsubscribeConfirmation' };
type SnsSignature = { [key in typeof SNS_SIGNATURE_KEYS[number]]: string };
export type SnsMessage = SnsSignature & (SnsNotification | SnsSubscription);

export class SignatureValidationError extends Error {}

/**
 * We need to validate each SNS notification to reject spoofed notifications
 * https://docs.aws.amazon.com/en_pv/sns/latest/dg/sns-verify-signature-of-message.html
 * https://github.com/aws/aws-js-sns-message-validator/blob/dc059618626df739763713415773121fb2595098/index.js
 */
const certCache: TObject.Indexable = {};
const defaultHostPattern = /^sns\.[a-zA-Z0-9\-]{3,}\.amazonaws\.com(\.cn)?$/;

/**
 * Validates the signature of an SNS message.
 * 
 * @param msg - The SNS message to verify.
 * @throws {SignatureValidationError} If the message signature is invalid or if required keys are missing.
 */
export async function verifySignature(msg: SnsMessage) {
  logger.debug(msg, 'Validating SNS message signature');
  // Validate required keys
  const keysToValidate = [];
  if (isNotification(msg)) {
    for (const key of SNS_NOTIFICATION_KEYS) {
      keysToValidate.push(key);
    }
    // We need to validate Subject only if it is exists in the message
    if (
      'Subject' in msg ||
      (typeof msg.Message === 'string' && JSON.parse(msg.Message).Subject)
    ) {
      keysToValidate.push('Subject');
    }
  } else {
    for (const key of SNS_SUBSCRIPTION_KEYS) {
      keysToValidate.push(key);
    }
  }
  for (const key of keysToValidate) {
    if (!(msg as any)[key]) {
      throw new SignatureValidationError(
        `Received message does not have key: ${key}`
      );
    }
  }
  keysToValidate.sort();
  logger.debug(keysToValidate, 'Keys to validate');

  // Validate cert URL
  const parsed = url.parse(msg.SigningCertURL);

  const isCertUrlValid =
    parsed.protocol === 'https:' &&
    parsed.path &&
    parsed.host &&
    parsed.path.substr(-4) === '.pem' &&
    defaultHostPattern.test(parsed.host);
  if (!isCertUrlValid) {
    throw new SignatureValidationError(
      `Provided certificate URL is invalid: ${msg.SigningCertURL}`
    );
  }

  // Validate signature
  let cert = certCache[msg.SigningCertURL];
  if (!cert) {
    logger.debug('Downloading Signing Cert');
    const res = await makeRequest(msg.SigningCertURL);

    if (!res.statusCode || res.statusCode !== 200) {
      throw new SignatureValidationError('Cannot get a signing certificate');
    }
    cert = certCache[msg.SigningCertURL] = await bodyParser.text(res);
  }

  let msgToVerify = '';
  for (const key of keysToValidate) {
    const val = (msg as any)[key];
    msgToVerify += key + '\n' + val + '\n';
  }
  logger.debug('Verifying the message', msgToVerify);

  const verifier = createVerify('RSA-SHA1');
  verifier.update(msgToVerify, 'utf8');
  const isValid = verifier.verify(cert, msg.Signature, 'base64');
  if (!isValid) {
    throw new SignatureValidationError('Message signature is invalid');
  }
}

/**
 * Checks if the given message is a notification.
 * 
 * @param msg - The SnsMessage to check.
 * @returns True if the message is a notification, false otherwise.
 */
export function isNotification(
  msg: SnsMessage
): msg is SnsSignature & SnsNotification {
  return msg.Type === 'Notification';
}
