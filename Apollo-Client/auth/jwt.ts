import { Buffer } from 'buffer';
import { createHmac, createSign } from 'crypto';
import formatEcdsa from 'ecdsa-sig-formatter';
import * as base64 from '../utils/base64';

const JWT_TTL = 30 * 24 * 60 * 60; // 30 days
const JWT_HEADER_TYP = 'JWT';

/**
 * HS256 used for tokens and RS256 for Google etc
 */
export enum JWTAlgo {
  HS256 = 'HS256',
  RS256 = 'RS256',
  ES256 = 'ES256'
}
/**
 * Generates an HMAC signature for the provided secured input using the specified secret key.
 * 
 * @param securedInput - The secured input to sign.
 * @param secretKey - The secret key used for signing.
 * @returns The HMAC signature as a base64-encoded string.
 */
/**
 * We support only limited list of available JWT claims. Because we use only
 * a few of them.
 *
 * Full list: https://tools.ietf.org/html/rfc7519#section-4
 */
export interface JWTClaims {
  /** Expiration date in unix timestamp format */
  exp?: number;
  /** Date when token was issued */
  iat?: number;
  /** Subject of token. Ex. 'auth', 'email' etc */
  sub?: string;
  /** Issuer of token */
  iss?: string;
  /** Audience for which token means. Ex. 'admin' */
  aud?: string;
  /** Date since token is valid */
  nbf?: number;
}

/**
 * Sign payload object with provided secret and claim
 *
 * @param  payload    Any value that can be stringified and parsed with JSON
 * @param  secretKey  Secret for encryption. Recommended length 256 bit+
 * @param  claims     The claims from JWT spec
 */
export function sign<TPayload extends TObject.Indexable<any, JWTClaims>>(
  payload: TPayload,
  secretKey: string,
  {
    claims = {},
    alg = JWTAlgo.HS256,
    headers = {}
  }: {
    claims?: JWTClaims;
    alg?: JWTAlgo;
    headers?: { [key: string]: any };
  }
): string {
  payload.iat = claims.iat || getTimestamp();
  payload.nbf = claims.nbf || payload.iat;
  payload.exp = claims.exp || payload.iat + JWT_TTL;
  payload.iss = claims.iss || JWT_ISSUER;
  payload.sub = claims.sub;
  payload.aud = claims.aud;

  const encodedHeader = encodeJson({ alg, typ: JWT_HEADER_TYP, ...headers });
  const encodedPayload = encodeJson(payload);
  const securedInput = `${encodedHeader}.${encodedPayload}`;

  let signature: string;
  switch (alg) {
    case JWTAlgo.HS256:
      signature = signHmac(securedInput, secretKey);
      break;
    case JWTAlgo.RS256:
      signature = signRsa(securedInput, secretKey);
      break;
    case JWTAlgo.ES256:
      signature = signEcdsa(securedInput, secretKey);
      break;
    default:
      throw new Error(`Algorithm ${alg} is not implemented`);
  }

  return `${securedInput}.${signature}`;
}

/**
 * Verify provided JWT with secret and claims
 *
 * @param  token      HS256 valid JWT
 * @param  secretKey  Secret used to sign this JWT
 * @param  claims     Any claims to verify
 */
export function verify<TPayload extends TObject.Indexable>(
  token: string,
  secretKey: string,
  claims: JWTClaims = {},
  alg = JWTAlgo.HS256
): TPayload {
  const { payload, signature, header } = decode(token);

  if (header.alg !== alg) {
    throw new Error("Token algorithm doesn't match");
  }

  if (header.typ !== JWT_HEADER_TYP) {
    throw new Error(`Token typ must be ${JWT_HEADER_TYP}`);
  }

  if (!signature) {
    throw new Error('Token signature is required');
  }

  const securedInput = token.split('.', 2).join('.');
  const computedSig = Buffer.from(signHmac(securedInput, secretKey));

  if (!computedSig.equals(Buffer.from(signature))) {
    throw new Error('Invalid signature');
  }
  if (payload.nbf > (claims.nbf || getTimestamp())) {
    throw new Error('Token is not valid yet');
  }
  if (payload.exp < (claims.exp || getTimestamp())) {
    throw new Error('Token already expired');
  }
  if (claims.sub && claims.sub !== payload.sub) {
    throw new Error('Token subject is invalid');
  }
  if (claims.aud && claims.aud !== payload.aud) {
    throw new Error('Token audience is invalid');
  }
  if (claims.iss && claims.iss !== payload.iss) {
    throw new Error('Token issuer is invalid');
  }

  return payload;
}
/**
 * Generates an HMAC signature for the provided secured input using the specified secret key.
 * 
 * @param securedInput - The secured input to be signed.
 * @param secretKey - The secret key used for signing.
 * @returns The HMAC signature as a base64-encoded string.
 */
function signHmac(securedInput: string, secretKey: string) {
  const hmac = createHmac('sha256', secretKey);
  hmac.update(securedInput);
  return base64.toURL(hmac.digest('base64'));
}
/**
 * Signs the input using RSA-SHA256 algorithm and the provided private key.
 * 
 * @param securedInput - The input to be signed.
 * @param privateKey - The private key used for signing.
 * @returns The signed input in base64 URL format.
 */
function signRsa(securedInput: string, privateKey: string) {
  const rsa = createSign('RSA-SHA256');
  rsa.update(securedInput);
  return base64.toURL(rsa.sign(privateKey, 'base64'));
}
/**
 * Sign the input using ECDSA algorithm.
 * 
 * @param securedInput - The input to be signed.
 * @param privateKey - The private key used for signing.
 * @returns The signed input in JOSE format.
 */
function signEcdsa(securedInput: string, privateKey: string) {
  const signer = createSign('RSA-SHA256');
  signer.update(securedInput);
  const sig = signer.sign(privateKey, 'base64');
  return formatEcdsa.derToJose(base64.toURL(sig), 'ES256');
}
/**
 * Decodes a JSON Web Token (JWT) and returns the header, payload, and signature.
 * 
 * @param {string} token - The JWT to decode.
 * @returns {{ header: object, payload: object, signature: string }} - The decoded JWT, with the header, payload, and signature.
 * @throws {Error} - If the JWT is invalid or cannot be decoded.
 */
function decode(token: string) {
  const segments = token.split('.');
  if (segments.length !== 3) throw new Error('Invalid JSON Web Token');

  return {
    header: JSON.parse(Buffer.from(segments[0], 'base64').toString('binary')),
    payload: JSON.parse(Buffer.from(segments[1], 'base64').toString('utf8')),
    signature: segments[2]
  };
}
/**
 * Encodes a JSON object into a URL-safe base64 string.
 * 
 * @param json - The JSON object to encode.
 * @returns The URL-safe base64 encoded string.
 */
function encodeJson<T>(json: T) {
  const jsonStr = JSON.stringify(json);
  return base64.toURL(base64.encode(jsonStr));
}
/**
 * Returns the current timestamp in seconds.
 * 
 * @returns {number} The current timestamp in seconds.
 */
function getTimestamp() {
  return Math.floor(Date.now() / 1000);
}
