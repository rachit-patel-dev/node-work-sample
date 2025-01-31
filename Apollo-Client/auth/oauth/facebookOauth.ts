import { ParsedUrlQueryInput } from 'querystring';
import * as querystring from 'querystring';
import { createHmac } from 'crypto';
import { config } from '../../config';
import { makeRequest } from '../../http/client';
import * as bodyParser from '../../http/middleware/bodyParser';
import { Mime } from '../../utils/mime';
import { SocialAuthUser } from './socialOauth';

const GRAPH_URL = 'https://graph.facebook.com';
const OAUTH_BASE_URL = `https://www.facebook.com/v3.2/dialog/oauth`;

/**
 * Facebook scopes list
 * https://developers.facebook.com/docs/facebook-login/permissions/
 */
const SCOPE = ['email', 'public_profile'].join(',');

/**
 * Request authorization code
 *
 * https://developers.facebook.com/docs/facebook-login/manually-build-a-login-flow#login
 *
 * @param redirectUri URI to which redirect with token
 * @param state       State to return with token
 */
export function createOauthUrl<TState extends TArray.SingleType<TObject.TValues<ParsedUrlQueryInput>>>(
  redirectUri: string,
  state: TState
): string {
  const queryParams: ParsedUrlQueryInput = {
    client_id: config.socialAuth.facebookAppId,
    redirect_uri: redirectUri,
    scope: SCOPE,
    response_type: 'code',
    state
  };
  return `${OAUTH_BASE_URL}?${querystring.stringify(queryParams)}`;
}

/**
 * Exchange authorization code for access token
 *
 * https://developers.facebook.com/docs/facebook-login/manually-build-a-login-flow#confirm
 *
 * @param  code        Authorization code obtained with createOauthUrl
 * @param  redirectUri Redirect URI
 */
export async function authorize(code: string, redirectUri: string): Promise<string> {
  const queryParams = {
    client_id: config.socialAuth.facebookAppId,
    client_secret: config.secrets.facebookAppSecret,
    redirect_uri: redirectUri,
    code
  };

  const res = await makeRequest(`${GRAPH_URL}/oauth/access_token?${querystring.stringify(queryParams)}`, {
    headers: { accept: Mime.JSON }
  });

  const body = await bodyParser.json<{ access_token?: string }>(res);
  if (!body.access_token) {
    throw new Error('Social auth Facebook cannot get access code');
  }

  return body.access_token;
}

/**
 * Request Facebook user profile
 *
 * https://developers.facebook.com/docs/graph-api/using-graph-api/common-scenarios#get-data-about-me-or-others
 *
 * @param  accessToken Access Token obtained with authorize function
 */
export async function getUser(accessToken: string): Promise<SocialAuthUser> {
  const hmac = createHmac('sha256', config.secrets.facebookAppSecret);
  hmac.update(accessToken);
  const appSecretProof = hmac.digest('hex');

  const queryParams = {
    access_token: accessToken,
    appsecret_proof: appSecretProof,
    fields: ['id', 'email', 'first_name', 'last_name', 'picture.type(large){url}'].join(',')
  };

  const res = await makeRequest(`${GRAPH_URL}/me?${querystring.stringify(queryParams)}`, {
    headers: {
      accept: Mime.JSON
    }
  });

  const body = await bodyParser.json<RequestUser>(res);
  if (!body.email) {
    throw new Error('Social auth Facebook cannot get email access');
  }

  return {
    id: body.id,
    email: body.email,
    firstName: body.first_name,
    lastName: body.last_name,
    avatar: body.picture && body.picture.data.url
  };
}

interface RequestUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  picture?: {
    data: { url: string };
  };
}
