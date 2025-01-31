import * as querystring from 'querystring';
import { config } from '../../config';
import { makeRequest } from '../../http/client';
import * as bodyParser from '../../http/middleware/bodyParser';
import { Mime } from '../../utils/mime';
import { SocialAuthUser } from './socialOauth';
import { ParsedUrlQueryInput } from 'querystring';

const OAUTH_BASE_URL = 'https://www.linkedin.com/oauth/v2';
const API_URL = 'https://api.linkedin.com/v2';

/**
 * Availables scopes
 * https://docs.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/migration-faq#what-permissions-do-i-have-access-to
 */
const SCOPE = ['r_liteprofile', 'r_emailaddress'].join(' ');

/**
 * Request authorization code
 *
 * https://docs.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow?context=linkedin/consumer/context#step-2-request-an-authorization-code
 *
 * @param redirectUri URL to redirect with code
 * @param state       State to return with code
 */
export function createOauthUrl<TState extends TArray.SingleType<TObject.TValues<ParsedUrlQueryInput>>>(
  redirectUri: string,
  state: TState
): string {
  const queryParams: ParsedUrlQueryInput = {
    client_id: config.socialAuth.linkedinAppId,
    redirect_uri: redirectUri,
    scope: SCOPE,
    response_type: 'code',
    state
  };
  return `${OAUTH_BASE_URL}/authorization?${querystring.stringify(queryParams)}`;
}

/**
 * Exchange authorization code for access token
 *
 * https://docs.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow?context=linkedin/consumer/context#step-2-request-an-authorization-code
 *
 * @param  code        Authorization code obtained with createOauthUrl
 * @param  redirectUri Redirect URI
 */
export async function authorize(code: string, redirectUri: string): Promise<string> {
  const queryParams = {
    client_id: config.socialAuth.linkedinAppId,
    client_secret: config.secrets.linkedinAppSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code
  };

  const res = await makeRequest(`${OAUTH_BASE_URL}/accessToken`, {
    method: 'POST',
    body: querystring.stringify(queryParams),
    headers: {
      'content-type': Mime.UrlEncoded,
      accept: Mime.JSON
    }
  });

  const body = await bodyParser.json<{ access_token?: string }>(res);
  if (!body.access_token) {
    throw new Error('Social auth Linkedin cannot get access token');
  }

  return body.access_token;
}

/**
 * Get Linkedin user profile and email
 *
 * https://docs.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin?context=linkedin/consumer/context#retrieving-member-profile-picture
 *
 * @param  accessToken Access Token obtained with authorize function
 */
export async function getUser(accessToken: string): Promise<SocialAuthUser> {
  const profileReq = makeApiRequest<RequestUserProfile>(
    '/me?projection=(id,firstName,lastName,profilePicture(displayImage~:playableStreams))',
    accessToken
  );
  const emailReq = makeApiRequest<RequestUserEmail>(
    '/emailAddress?q=members&projection=(elements*(handle~))',
    accessToken
  );
  const [profileRes, emailRes] = await Promise.all([profileReq, emailReq]);

  if (emailRes.elements.length === 0 || !emailRes.elements[0]['handle~'].emailAddress) {
    throw new Error('Social auth Linkeding cannot get email access');
  }

  const socialAuthUser: SocialAuthUser = {
    id: profileRes.id,
    email: emailRes.elements[0]['handle~'].emailAddress,
    firstName: profileRes.firstName.localized.en_US,
    lastName: profileRes.lastName.localized.en_US
  };

  /**
   * elements[1] – Avatar with 200x200 size
   * identifiers[0] – There is always exactly 1 identifier
   */
  if (profileRes.profilePicture) {
    const avatar = profileRes.profilePicture['displayImage~'].elements[1].identifiers[0];
    socialAuthUser.avatar = avatar.identifier;
    socialAuthUser.avatarMime = avatar.mediaType;
  }

  return socialAuthUser;
}

/**
 * Make Linkedin API request
 *
 * https://docs.microsoft.com/en-us/linkedin/shared/api-guide/concepts/protocol-version?context=linkedin/context
 *
 * @param path        Linkedin API Path
 * @param accessToken Access Token
 */
async function makeApiRequest<TRes extends object>(path: string, accessToken: string): Promise<TRes> {
  const res = await makeRequest(`${API_URL}${path}`, {
    headers: {
      // https://docs.microsoft.com/en-us/linkedin/shared/api-guide/concepts/data-formats?context=linkedin/context
      'content-type': Mime.JSON,
      accept: Mime.JSON,
      // https://docs.microsoft.com/en-us/linkedin/shared/api-guide/concepts/protocol-version?context=linkedin/context
      'x-restli-protocol-version': '2.0.0',
      authorization: `Bearer ${accessToken}`
    }
  });
  return bodyParser.json<TRes>(res);
}

/**
 * Linkedin user profile response
 *
 * https://developer.linkedin.com/docs/ref/v2/profile/profile-picture
 */
interface RequestUserProfile {
  id: string;
  firstName: LocalizedField;
  lastName: LocalizedField;
  profilePicture?: {
    'displayImage~': RequestArrayResponse<{
      identifiers: {
        identifier: string;
        mediaType: string;
      }[];
    }>;
  };
}

type RequestUserEmail = RequestArrayResponse<{
  'handle~': {
    emailAddress: string;
  };
}>;

type RequestArrayResponse<TEntity> = {
  elements: TEntity[];
};

type LocalizedField = {
  localized: { en_US: string };
};
