/*external modules*/
import _ from 'lodash';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';
/*DB*/
import { redis } from '../db/redis';
import { User } from '../db/types/user';
import { Role, UserRole } from '../db/types/role';
/*models*/
import { UserModel } from '../db/models/UserModel';
import { RoleModel } from '../db/models/RoleModel';
/*GQL*/
import { GraphQLError } from '../gql';
import { UserWithToken } from '../gql/resolvers/UserWithToken';
/*other*/
import * as jwt from './jwt';
import { SocialAuthUser, SocialAuthProvider } from './oauth/socialOauth';
import { sendNotification } from '../notifications';
import { decrypt, encrypt } from '../utils/aes256';

namespace BasicAuth {
  export type TUserDataInToken = Pick<User, 'id' | 'lastRoleId' | 'email' | 'collectPersonalData'>;

  export type ResetPasswordPayload = {
    user: string;
    password: string;
    jwtVersion: number;
  };
  export type AuthTokenPayload = TUserDataInToken & {
    jwtVersion: number;
  };
  export type DeprecatedAuthTokenPayload = {
    id: string;
    jwtVersion: number;
  };

  export const AUTH_TOKEN_SUBJECT = 'auth';
  export const FAILED_ATTEMPTS_LIMIT = 10;
  export const RESET_TOKEN_TTL = 60 * 60 * 1000;

  export const RESET_PASSWORD_SUB = 'tfa-reset-password';

  export const AUTH_TOKEN_PAYLOAD_PROPS = ['id', 'lastRoleId', 'email', 'collectPersonalData', 'jwtVersion'] as const;

  export class LoginError extends Error {}

  export namespace generateAuthToken {
    export type TArgs = { user: User; jwtSecret: string };
    export type TReturn = string;
    export const exec: TFunction.GraphqlClientBasedResolver.ReturnRequired<TArgs, TReturn> = async (client, args) => {
      const { user, jwtSecret } = args;

      const payload = {
        ..._.pick(user, AUTH_TOKEN_PAYLOAD_PROPS),
        jwtVersion: user.jwtVersion
      };
      const opts = { claims: { sub: AUTH_TOKEN_SUBJECT } };

      return jwt.sign<AuthTokenPayload>(payload, jwtSecret, opts);
    };
  }

  /**
 * Executes the getCurrentUser function.
 * 
 * @param {string} token - The JWT token.
 * @param {string} jwtSecret - The secret key used to sign the JWT token.
 * @returns {AuthTokenPayload | DeprecatedAuthTokenPayload} - The payload of the JWT token containing user information.
 * @throws {Error} - If the token algorithm doesn't match, the token typ is not JWT, the token signature is missing, the signature is invalid, the token is not valid yet, the token has already expired, the token subject is invalid, the token audience is invalid, or the token issuer is invalid.
 */
  export namespace getCurrentUser {
    export type TArgs = { token: string; jwtSecret: string };
    export type TReturn = AuthTokenPayload | DeprecatedAuthTokenPayload;
    export const exec: TFunction.GraphqlClientBasedResolver.PossibleUndefined<TArgs, TReturn> = async (
      client,
      args
    ) => {
      const { token, jwtSecret } = args;
      const opts = { sub: AUTH_TOKEN_SUBJECT };
      const payload = jwt.verify<AuthTokenPayload>(token, jwtSecret, opts, jwt.JWTAlgo.HS256);

      return _.pick(payload, AUTH_TOKEN_PAYLOAD_PROPS);
    };
  }

  /**
 * Executes the 'initPasswordReset' operation.
 * 
 * @param {GraphqlClient} client - The GraphQL client.
 * @param {initPasswordReset.TArgs} args - The arguments for the operation.
 * @returns {Promise<initPasswordReset.TReturn>} - A promise that resolves to a string indicating the result of the operation.
 */
  export namespace initPasswordReset {
    export type TArgs = { user: User };
    export type TReturn = String;
    export const exec: TFunction.GraphqlClientBasedResolver.ReturnRequired<TArgs, TReturn> = async (client, args) => {
      const { user } = args;

      const resetToken = randomBytes(48).toString('hex');
      const key = `reset-password:${resetToken}`;
      await redis.set(key, user.id, 'PX', RESET_TOKEN_TTL);

      await sendNotification('initPasswordReset', {
        userId: user.id,
        token: resetToken,
        locked: user.locked
      });

      return "If your email exists in our database, you'll receive a reset link";
    };
  }

  /**
 * Executes the resetPassword function.
 * 
 * @param client - The GraphQL client.
 * @param args - The arguments for the resetPassword function.
 * @param ctx - The context object.
 * @returns A UserWithToken object.
 * @throws GraphQLError - If the token is invalid or the user is not found.
 */
  export namespace resetPassword {
    export type TArgs = {
      token: string;
      password: string;
      jwtSecret: string;
    };
    export type TReturn = UserWithToken;
    export const exec: TFunction.GraphqlClientBasedResolver.ReturnRequired<TArgs, TReturn> = async (
      client,
      args,
      ctx
    ) => {
      const { password, token, jwtSecret } = args;

      const userId = await redis.get(`reset-password:${token}`);
      await redis.del(`reset-password:${token}`);

      if (!userId) {
        throw new GraphQLError('Invalid Token!', 403);
      }

      let user = await UserModel.findById.exec(client, { userId }, ctx);
      if (!user) throw GraphQLError.notFound('user');

      if (user.tfaSecret) {
        const payload: ResetPasswordPayload = {
          user: user.id,
          password,
          jwtVersion: user.jwtVersion
        };

        const opts = {
          claims: {
            sub: RESET_PASSWORD_SUB,
            // 10min TTL
            exp: Math.floor(Date.now() / 1000) + 600
          }
        };

        const authToken = jwt.sign<ResetPasswordPayload>(payload, jwtSecret, opts);

        return { token: authToken };
      }

      const hash = await argon2.hash(password);

      const userDataForUpdate: UserModel.update.TArgs = {
        id: userId,
        password: hash,
        jwtVersion: user.jwtVersion + 1,
        failedLoginAttempts: 0,
        locked: false
      };

      user = await UserModel.update.exec(client, userDataForUpdate, ctx);
      if (!user) throw GraphQLError.notFound('user');

      const authData: generateAuthToken.TArgs = {
        user,
        jwtSecret
      };

      const authToken = await generateAuthToken.exec(client, authData, ctx);

      return { user, token: authToken };
    };
  }

  /**
 * Executes the updatePassword mutation.
 * 
 * @param client - The GraphQL client.
 * @param args - The arguments for the mutation.
 * @param ctx - The context object.
 * @returns A promise that resolves to a UserWithToken object.
 * @throws GraphQLError - If the user is not found, the old password is not provided, or the old password is incorrect.
 */
  export namespace updatePassword {
    export type TArgs = {
      userId: User['id'];
      oldPassword?: string;
      newPassword: string;
      jwtSecret: string;
    };
    export type TReturn = UserWithToken;
    export const exec: TFunction.GraphqlClientBasedResolver.ReturnRequired<TArgs, TReturn> = async (
      client,
      args,
      ctx
    ) => {
      const { userId, oldPassword, newPassword, jwtSecret } = args;

      let user = await UserModel.findById.exec(client, { userId }, ctx);
      if (!user) throw GraphQLError.notFound('user');

      if (user.password && !oldPassword) {
        throw new GraphQLError(
          'Your account is protected with password. To change it you must provide an old password',
          401
        );
      }

      if (oldPassword) {
        const isValid = await argon2.verify(user.password!, oldPassword);
        if (!isValid) throw GraphQLError.unauthorized();
      }

      const hash = await argon2.hash(newPassword);

      let tfaSecret: string | undefined;
      if (user.tfaSecret) {
        tfaSecret = decrypt(user.tfaSecret, oldPassword!);
        tfaSecret = encrypt(tfaSecret, newPassword);
      }

      const userData: UserModel.update.TArgs = {
        id: userId,
        password: hash,
        jwtVersion: user.jwtVersion + 1,
        tfaSecret
      };

      user = await UserModel.update.exec(client, userData, ctx);
      if (!user) throw GraphQLError.notFound('user');

      ctx.dataLoader!('users').primeForce(user.id, user);

      const authData: generateAuthToken.TArgs = {
        user,
        jwtSecret
      };

      const authToken = await generateAuthToken.exec(client, authData, ctx);

      return { user, token: authToken };
    };
  }

  /**
 * Executes the login process for a user.
 * 
 * @param client - The GraphQL client.
 * @param args - The arguments for the login process.
 * @param ctx - The context object.
 * @returns A UserWithToken object containing the user and the authentication token.
 * @throws {GraphQLError} If the user is not found.
 * @throws {LoginError} If the user account has been deleted, locked, or if the password is invalid.
 */
  export namespace login {
    export type TArgs = {
      email: string;
      password: string;
      jwtSecret: string;
    };
    export type TReturn = UserWithToken;
    export const exec: TFunction.GraphqlClientBasedResolver.ReturnRequired<TArgs, TReturn> = async (
      client,
      args,
      ctx
    ) => {
      const { email, password, jwtSecret } = args;

      const user = await UserModel.findByEmail.exec(client, { email }, ctx);
      if (!user) throw GraphQLError.notFound('user');

      if (user.deleted) {
        throw new LoginError('Your account has been deleted.');
      }

      if (user.locked) {
        throw new LoginError('locked');
      }
      if (!user.password) {
        throw new LoginError(
          'You cannot login to this account with password. Please login with another method and setup password first.'
        );
      }

      let isPasswordValid: boolean;
      try {
        isPasswordValid = await argon2.verify(user.password, password);
      } catch (e) {
        isPasswordValid = false;
      }

      let failedLoginAttempts = user.failedLoginAttempts;
      let userLocked: boolean = user.locked;
      if (!isPasswordValid) {
        failedLoginAttempts += 1;
        if (failedLoginAttempts > FAILED_ATTEMPTS_LIMIT) {
          userLocked = true;
          await initPasswordReset.exec(client, { user }, ctx);
        }
      } else {
        failedLoginAttempts = 0;
      }

      if (user.locked !== userLocked || user.failedLoginAttempts !== failedLoginAttempts) {
        const userDataForUpdate: UserModel.update.TArgs = {
          id: user.id,
          failedLoginAttempts,
          locked: userLocked
        };

        await UserModel.update.exec(client, userDataForUpdate, ctx);
      }

      if (!isPasswordValid) {
        throw new LoginError('Email or password is invalid');
      }

      if (user.tfaSecret) {
        return {
          token: jwt.sign(
            {
              email: user.email,
              password: createHash('sha256')
                .update(password, 'utf8')
                .digest('hex')
            },
            jwtSecret,
            {
              claims: {
                sub: 'tfa',
                // 10min TTL
                exp: Math.floor(Date.now() / 1000) + 600
              }
            }
          )
        };
      }

      const authToken = await generateAuthToken.exec(client, { user, jwtSecret }, ctx);

      return { token: authToken, user };
    };
  }

  /**
 * Executes the registration process for a new user.
 * 
 * @param client - The GraphQL client.
 * @param args - The arguments for the registration process.
 * @param ctx - The context object.
 * @returns A promise that resolves to an object containing the registered user, their role, and the authentication token.
 * @throws {GraphQLError} If the user tries to register as an admin or superadmin, or if the email is already in use.
 */
  export namespace register {
    export type TArgs = {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      role: UserRole;
      emailConfirmed?: boolean;
      jwtSecret: string;
    };
    export type TReturn = UserWithToken & { role: Role };
    export const exec: TFunction.GraphqlClientBasedResolver.ReturnRequired<TArgs, TReturn> = async (
      client,
      args,
      ctx
    ) => {
      const { email, role, password, jwtSecret } = args;

      // Users cannot register as admin
      if (role === UserRole.Admin || role == UserRole.SuperAdmin) {
        throw new GraphQLError('You cannot register as admin or superadmin', 403);
      }

      let user = await UserModel.findByEmail.exec(client, { email }, ctx);
      if (user) {
        throw new GraphQLError(
          'The email you typed is already in use. Please type a different email or login with correct password.'
        );
      }

      const passwordHash = await argon2.hash(password);

      const userData: UserModel.create.TArgs = {
        ...args,
        password: passwordHash
      };

      // create new user
      user = await UserModel.create.exec(client, userData, ctx);

      const roleData: RoleModel.create.TArgs = {
        name: role,
        userId: user.id
      };

      // create role for the new user
      const userRole = await RoleModel.create.exec(client, roleData, ctx);

      const userDataForUpdate: UserModel.update.TArgs = {
        id: user.id,
        lastRoleId: userRole.id
      };

      user = await UserModel.update.exec(client, userDataForUpdate, ctx);

      const authToken = await generateAuthToken.exec(client, { user: user!, jwtSecret }, ctx);

      return { user, role: userRole, token: authToken };
    };
  }

  /**
 * Executes the social network login process.
 * 
 * @param client - The GraphQL client.
 * @param args - The arguments for the social network login.
 * @param ctx - The context object.
 * @returns A promise that resolves to an object containing the user information and a flag indicating if the user is new.
 * @throws {GraphQLError} If the user needs to sign up first to use social login, or if the user cannot register as admin or superadmin, or if the social network issue occurs and the email is not provided.
 * @throws {LoginError} If the user is not found, or if the user must connect the social network account first to be able to login with it, or if multiple IDs for the same provider are detected, or if the user has 2FA enabled, or if the user's account has been deleted.
 */
  export namespace socialNetworkLogin {
    export type TArgs = {
      provider: SocialAuthProvider;
      socialAuthUser: SocialAuthUser;
      role?: UserRole;
      jwtSecret: string;
    };
    export type TReturn = UserWithToken & { new: boolean };
    export const exec: TFunction.GraphqlClientBasedResolver.ReturnRequired<TArgs, TReturn> = async (
      client,
      args,
      ctx
    ) => {
      const { provider, socialAuthUser, role, jwtSecret } = args;

      const providerField = `${provider}Id` as keyof User;
      const searchArgs = {} as Record<keyof User, any>;

      if (socialAuthUser.email) {
        searchArgs.email = socialAuthUser.email;
      } else {
        searchArgs[providerField] = socialAuthUser.id;
      }

      let [user] = await UserModel.find.exec(client, searchArgs, ctx);

      let isNewUser = false;

      if (!user) {
        if (!role) {
          throw new GraphQLError('You need to sign up first to use social login');
        }

        if (role === UserRole.Admin || role == UserRole.SuperAdmin) {
          throw new GraphQLError('You cannot register as admin or superadmin');
        }

        if (!socialAuthUser.email) {
          throw new GraphQLError('Social network issue - "email" not provided.');
        }

        const userData: UserModel.create.TArgs = {
          email: socialAuthUser.email,
          emailConfirmed: true,
          firstName: socialAuthUser.firstName,
          lastName: socialAuthUser.lastName,
          [providerField]: socialAuthUser.id
        };

        // create new user
        user = await UserModel.create.exec(client, userData, ctx);

        const roleData: RoleModel.create.TArgs = {
          name: role,
          userId: user.id
        };

        // create role for the new user
        const userRole = await RoleModel.create.exec(client, roleData, ctx);

        const userDataForUpdate: UserModel.update.TArgs = {
          id: user.id,
          lastRoleId: userRole.id
        };

        user = (await UserModel.update.exec(client, userDataForUpdate, ctx))!;

        isNewUser = true;
      }

      if (!user) throw new Error('User not found!');

      if (_.isNil(user[providerField])) {
        const connectedProviders = _.reduce(
          SocialAuthProvider,
          (acc, provider, key) => {
            const providerField = `${provider}Id` as keyof User;
            if (!_.isNil(user![providerField])) {
              acc.push(`"${key}"`);
            }
            return acc;
          },
          [] as string[]
        );

        const extraMessage = _.isEmpty(connectedProviders)
          ? 'You have no connected providers yet.'
          : ` Already connected providers are ${connectedProviders.join(', ')}`;

        throw new LoginError(
          `You must connect "${_.capitalize(provider)}" account first to be able to login with it.${extraMessage}`
        );
      } else if (user[providerField] !== socialAuthUser.id) {
        throw new LoginError(`Multiple IDs for same provider detected. Please contact with support.`);
      }

      if (user.tfaSecret) {
        throw new LoginError(`You have 2FA enabled. Please, use email login.`);
      }

      if (user.deleted) {
        throw new LoginError('Your account has been deleted.');
      }

      const authToken = await generateAuthToken.exec(client, { user, jwtSecret }, ctx);
      return { token: authToken, user, new: isNewUser };
    };
  }
}

export default BasicAuth;
