import { config } from '../../config';
import * as google from './googleOauth';
import * as facebook from './facebookOauth';
import * as linkedin from './linkedinOauth';
import * as apple from './appleOauth';
import { Environment } from '../../db/types/Environment';
import { ParsedUrlQueryInput } from 'querystring';

export enum SocialAuthProvider {
  Google = 'google',
  Facebook = 'facebook',
  Linkedin = 'linkedin',
  Apple = 'apple'
}

export interface SocialAuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  avatarMime?: string;
}

/**
 * Social auth flow steps:
 *
 * 1. Create Oauth URL for one of available providers and redirect user to this URL
 * 2. Handle callback URL with code or error query param.
 *    - If code is present then exchange it for access token with authorize function.
 *    - In case of error return user back and show error
 * 3. Retrieve user from provider with access token.
 *    - If user exists and provider is connected to it's profile return JWT.
 *    - If user exists but provider is not connected to profile return error.
 *    - If user does not exists create new account and connect it to provider
 *      and return JWT
 *
 *
 * @NOTE: I have no idea how to make atomated tests for it so there is an list
 * for common test cases to make manually.
 * https://developers.facebook.com/docs/facebook-login/testing-your-login-flow/#common-test-cases
 */

/**
 * Return redirect URL for selected provider
 */
export function createOauthUrl<TState extends TArray.SingleType<TObject.TValues<ParsedUrlQueryInput>>>(
  provider: SocialAuthProvider,
  state: TState
): string {
  const redirectUri = buildRedirectUri(provider);
  return getProvider(provider).createOauthUrl(redirectUri, state);
}

/**
 * Exchange authorization token for accesss token
 */
export function authorize(provider: SocialAuthProvider, code: string): Promise<string> {
  return getProvider(provider).authorize(code, buildRedirectUri(provider));
}

/**
 * Retrieve user profile
 */
export function getUser(
  provider: SocialAuthProvider,
  accessToken: string,
  environment?: Environment
): Promise<SocialAuthUser> {
  return getProvider(provider).getUser(accessToken, environment);
}

/**
 * Retrieves the appropriate provider module based on the given social auth provider.
 * 
 * @param {SocialAuthProvider} provider - The social auth provider.
 * @returns {Object} - The provider module.
 * @throws {Error} - If the social auth provider is not implemented.
 */
function getProvider(provider: SocialAuthProvider) {
  switch (provider) {
    case SocialAuthProvider.Google:
      return google;
    case SocialAuthProvider.Facebook:
      return facebook;
    case SocialAuthProvider.Linkedin:
      return linkedin;
    case SocialAuthProvider.Apple:
      return apple;
    default:
      throw new Error(`Social auth provider '${provider} is not implemented'`);
  }
}

/**
 * Generates a redirect URI for the specified social media provider.
 * 
 * @param provider - The social media provider (e.g. 'google', 'facebook', 'linkedin', 'apple').
 * @returns The redirect URI for the specified provider.
 */
function buildRedirectUri(provider: SocialAuthProvider): string {
  return `${config.http.host}/auth/callback/${provider}`;
}
