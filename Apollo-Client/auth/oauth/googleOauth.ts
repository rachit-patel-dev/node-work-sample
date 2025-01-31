import querystring, { ParsedUrlQueryInput } from 'querystring';
import { config } from '../../config';
import { makeRequest } from '../../http/client';
import { Mime } from '../../utils/mime';
import * as bodyParser from '../../http/middleware/bodyParser';
import { SocialAuthUser } from './socialOauth';

const OAUTH_BASE_URL = 'https://accounts.google.com/o/oauth2/v2';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_URL = 'https://www.googleapis.com/oauth2/v2';

/**
 * Available scopes
 *
 * https://developers.google.com/identity/protocols/googlescopes#oauth2v2
 */
const SCOPE = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
].join(' ');

/**
 * Obtain authorization code
 *
 * https://developers.google.com/identity/protocols/OAuth2WebServer#creatingclient
 *
 * @param redirectUri URI to which redirect with token
 * @param state       State to return with token
 */
export function createOauthUrl<TState extends TArray.SingleType<TObject.TValues<ParsedUrlQueryInput>>>(
  redirectUri: string,
  state: TState
): string {
  const queryParams: ParsedUrlQueryInput = {
    client_id: config.socialAuth.googleAppId,
    scope: SCOPE,
    redirect_uri: redirectUri,
    access_type: 'offline',
    response_type: 'code',
    state
  };
  return `${OAUTH_BASE_URL}/auth?${querystring.stringify(queryParams)}`;
}

/**
 * Exchange authorization code for access token
 *
 * https://developers.google.com/identity/protocols/OAuth2WebServer#exchange-authorization-code
 *
 * @param  code        Authorization code obtained with createOauthUrl
 * @param  redirectUri Redirect URI
 */
export async function authorize(code: string, redirectUri: string): Promise<string> {
  const queryParams = {
    client_id: config.socialAuth.googleAppId,
    client_secret: config.secrets.googleAppSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code
  };

  const res = await makeRequest(OAUTH_TOKEN_URL, {
    method: 'POST',
    body: querystring.stringify(queryParams),
    headers: {
      'Content-Type': Mime.UrlEncoded,
      accept: Mime.JSON
    }
  });

  const body = await bodyParser.json<{ access_token?: string }>(res);
  if (!body.access_token) {
    throw new Error('Social auth Google cannot get access token');
  }

  return body.access_token;
}

/**
 * Retrive Google user for access token
 *
 *
 *
 * @param  accessToken Token obtained with auhorize function
 */
export async function getUser(accessToken: string): Promise<SocialAuthUser> {
  const res = await makeRequest(`${API_URL}/userinfo`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: Mime.JSON
    }
  });

  const body = await bodyParser.json<RequestUser>(res);
  if (!body.email) {
    throw new Error('Social auth Google cannot get email access');
  }

  return {
    id: body.id,
    email: body.email,
    firstName: body.given_name,
    lastName: body.family_name,
    avatar: body.picture
  };
}

/**
 * Google response with user object
 * https://developers.google.com/apis-explorer/#p/oauth2/v2/oauth2.userinfo.get
 */
interface RequestUser {
  id: string;
  email: string;
  given_name: string;
  family_name: string;
  picture?: string;
}
