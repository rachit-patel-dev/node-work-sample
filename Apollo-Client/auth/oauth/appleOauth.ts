import { SocialAuthUser } from './socialOauth';
import { config } from '../../config';
import { Environment } from '../../db/types/Environment';
import { ParsedUrlQueryInput } from 'querystring';

const appleSignin = require('apple-signin-auth');

/**
 * Generates an OAuth URL for Apple Sign In.
 * 
 * @param redirectUri The redirect URI to be used after authentication.
 * @param state The state parameter to be included in the OAuth URL.
 * @returns The generated OAuth URL.
 */
export function createOauthUrl<TState extends TArray.SingleType<TObject.TValues<ParsedUrlQueryInput>>>(
  redirectUri: string,
  state: TState
): string {
  const options = {
    clientID: APPLE_SIGN_IN_SERVICE_ID,
    redirectUri,
    state,
    scope: 'email name'
  };

  return appleSignin.getAuthorizationUrl(options);
}
/**
 * Authorizes a user with Apple Sign In.
 * 
 * @param {string} code - The authorization code received from Apple Sign In.
 * @param {string} redirectUri - The redirect URI used for the authorization request.
 * @returns {Promise<string>} - The ID token of the authorized user.
 */
export async function authorize(code: string, redirectUri: string): Promise<string> {
  const clientSecret = appleSignin.getClientSecret({
    clientID: APPLE_SIGN_IN_SERVICE_ID,
    teamId: config.pushNotifications.appleTeamId,
    privateKey: config.secrets.signInWithAppleSecret,
    keyIdentifier: config.secrets.signInWithAppleKey
  });

  const options = {
    clientID: APPLE_SIGN_IN_SERVICE_ID,
    redirectUri,
    clientSecret
  };

  const tokenResponse = await appleSignin.getAuthorizationToken(code, options);

  return tokenResponse.id_token;
}
/**
 * Retrieves user information from Apple Sign In using the provided id token.
 * 
 * @param idToken - The id token obtained from Apple Sign In.
 * @param environment - (Optional) The environment in which the function is being executed.
 * @returns A promise that resolves to a SocialAuthUser object containing the user information.
 */
export async function getUser(idToken: string, environment?: Environment): Promise<SocialAuthUser> {
  const verifyTokenData = await appleSignin.verifyIdToken(idToken, {
    audience: environment === Environment.Ios ? APPLE_CLIENT_ID : APPLE_SIGN_IN_SERVICE_ID,
    ignoreExpiration: true
  });

  const { sub: id, email } = verifyTokenData;

  return {
    id: id,
    email: email,
    // apple provides firstName and lastName only once and while token verification.
    firstName: 'appleUserFirstName',
    lastName: 'appleUserLastName'
  };
}
