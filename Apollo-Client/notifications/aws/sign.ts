import { createHash, createHmac } from 'crypto';
import { ClientRequest, OutgoingHttpHeaders } from 'http';
import { config } from '../../config';

const sesTransport = require('nodemailer-ses-transport');

export const AWS_SIGN_V = 'AWS4';
export const AWS_DEFAULT_REGION = 'us-west-2';
export const ALGORITHM = `${AWS_SIGN_V}-HMAC-SHA256`;
export const AWS_REQUEST = 'aws4_request';

export enum AwsService {
  SES = 'email',
  SNS = 'sns',
  S3 = 's3'
}

/**
 * Generates the API URL for the specified AWS service and region.
 * 
 * @param {AwsService} service - The AWS service for which to generate the API URL.
 * @param {string} [region=AWS_DEFAULT_REGION] - The AWS region for which to generate the API URL. Defaults to AWS_DEFAULT_REGION.
 * @returns {string} The generated API URL.
 */
export function apiUrl(service: AwsService, region = AWS_DEFAULT_REGION) {
  return `https://${service}.${region}.amazonaws.com`;
}

export const SESTransport = sesTransport({
  accessKeyId: config.emails.accessKeyId,
  secretAccessKey: config.secrets.emailsSecretAccessKey,
  ServiceUrl: apiUrl(AwsService.SES),
  region: 'us-west-2'
});

/**
 * Signs the given request with AWS Signature Version 4.
 * 
 * @param req - The client request object.
 * @param service - The AWS service to sign the request for.
 * @param body - The request body.
 * @param options - Optional parameters for signing the request.
 * @param options.region - The AWS region. Defaults to 'us-west-2'.
 * @param options.method - The HTTP method. Defaults to 'POST'.
 * @returns void
 */
export function signV4(
  req: ClientRequest,
  service: AwsService,
  body: string,
  { region = AWS_DEFAULT_REGION, method = 'POST' }: { region?: string; method?: 'POST' | 'GET' | 'PUT' | 'DELETE' } = {}
) {
  const isoDate = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
  req.setHeader('x-amz-date', isoDate);

  // For S3 we need to add body hash header
  if (service === AwsService.S3) {
    const bodyHash = createHash('sha256')
      .update(body, 'utf8')
      .digest('hex');
    req.setHeader('x-amz-content-sha256', bodyHash);
  }

  /**
   * 1. Create canonical request
   * https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html?shortFooter=true
   */
  const headers = req.getHeaders();
  const [canonicalHeaders, signedHeaders] = prepareHeaders(headers);
  const canonicalRequest = [
    method,
    req.path,
    '', // query string
    canonicalHeaders,
    signedHeaders,
    sha256(body)
  ].join('\n');

  /**
   * 2. Create string to sign
   * https://docs.aws.amazon.com/general/latest/gr/sigv4-create-string-to-sign.html?shortFooter=true
   */
  const shortDate = isoDate.substr(0, 8); // 20190503T172034Z => 20190503
  // date/region/service/aws4_request
  const credentialScope = [shortDate, region, service, AWS_REQUEST].join('/');
  const stringToSign = [ALGORITHM, isoDate, credentialScope, sha256(canonicalRequest)].join('\n');

  /**
   * 3. Calculate signature
   * https://docs.aws.amazon.com/general/latest/gr/sigv4-calculate-signature.html?shortFooter=true
   */
  const kSecret = config.secrets.emailsSecretAccessKey;
  const kDate = hmac(AWS_SIGN_V + kSecret, shortDate);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, AWS_REQUEST);
  const signature = hmac(kSigning, stringToSign, 'hex');

  /**
   * 4. Sign request
   * https://docs.aws.amazon.com/general/latest/gr/sigv4-add-signature-to-request.html?shortFooter=true
   */
  const authHeader = `${ALGORITHM} Credential=${config.emails.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  req.setHeader('authorization', authHeader);
}

/**
 * Create canonical and signed headers string
 */
function prepareHeaders(headers: OutgoingHttpHeaders): [string, string] {
  const keys = Object.keys(headers);
  keys.sort((key1, key2) => {
    key1 = key1.toLowerCase();
    key2 = key2.toLowerCase();

    if (key1 < key2) return -1;
    else if (key1 > key2) return 1;
    return 0;
  });

  const canonicalHeaders: string[] = [];
  const signedHeaders: string[] = [];

  for (let key of keys) {
    // ' a      a       ' => 'a a'
    const val = String(headers[key])
      .replace(/\s+/g, ' ')
      .trim();
    // 'Host' => 'host'
    key = key.toLowerCase();

    // host:localhost
    canonicalHeaders.push(`${key}:${val}`);
    signedHeaders.push(key);
  }

  return [canonicalHeaders.join('\n') + '\n', signedHeaders.join(';')];
}

/**
 * Calculates the SHA256 hash of a given string.
 * 
 * @param str - The string to calculate the hash for.
 * @returns The SHA256 hash of the input string.
 */
function sha256(str: string): string {
  return createHash('sha256')
    .update(str, 'utf8')
    .digest('hex')
    .toLowerCase();
}

/**
 * Calculates the HMAC (Hash-based Message Authentication Code) using the SHA256 algorithm.
 * 
 * @param key - The key used for the HMAC calculation. It can be either a string or a Buffer.
 * @param str - The string to be hashed.
 * @param encoding - The encoding of the output. It can be either 'hex' or 'buffer'. Default is 'buffer'.
 * @returns The HMAC value as a string if the encoding is 'hex', or as a Buffer if the encoding is 'buffer'.
 */
function hmac(key: string | Buffer, str: string, encoding: 'hex' | 'buffer' = 'buffer'): string | Buffer {
  return createHmac('sha256', key)
    .update(str, 'utf8')
    .digest(encoding as any);
}
