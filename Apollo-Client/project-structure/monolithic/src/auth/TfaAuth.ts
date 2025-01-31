/*external modules*/
import _ from 'lodash';
import async from 'async';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import qr from 'qr-image';
/*DB*/
import { redis } from '../db/redis';
import { User } from '../db/types/user';
/*models*/
import { UserModel } from '../db/models/UserModel';
/*GQL*/
import { GraphQLError } from '../gql';
import { UserWithToken } from '../gql/resolvers/UserWithToken';
import { TfaSetup } from '../gql/resolvers/TfaSetup';
/*other*/
import * as jwt from './jwt';
import { generateRecoveryCodes, generateSecret } from './totp';
import BasicAuth from './BasicAuth';
import { decrypt, encrypt } from '../utils/aes256';

namespace TfaAuth {
  const TOTP_SECRET_TTL = 3600; // 1hr

  export const FAILED_ATTEMPTS_LIMIT = 10;

  /**
 * Executes the TFA setup process for a user.
 * 
 * @param client - The GraphQL client.
 * @param args - The arguments for the TFA setup process.
 * @param ctx - The context object.
 * @returns The TFA setup object.
 * @throws {GraphQLError} If the user is not found, already has 2FA configured, needs to create a password first, or if the password is not valid.
 * @throws {GraphQLError} If there is an error decrypting the secret.
 */
  export namespace init {
    export type TArgs = {
      userId: User['id'];
      password: string;
    };
    export type TReturn = TfaSetup;
    export const exec: TFunction.GraphqlClientBasedResolver.ReturnRequired<
      TArgs,
      TReturn
    > = async (client, args, ctx) => {
      const { userId, password } = args;

      const user = await UserModel.findById.exec(client, { userId }, ctx);
      if (!user) throw GraphQLError.notFound('user');

      if (user.tfaSecret) {
        throw new GraphQLError('You already have 2FA configured');
      }

      if (!user.password) {
        throw new GraphQLError('You need to create password first to use 2FA');
      }

      const isValidPassword = await argon2.verify(user.password, password);
      if (!isValidPassword) throw new GraphQLError('Password is not valid');

      const tfaSecretKey = `tfa:secret:${user.id}`;

      let tfaSecret = await redis.get(tfaSecretKey);

      if (!tfaSecret) {
        tfaSecret = generateSecret();
        await redis.set(
          tfaSecretKey,
          encrypt(tfaSecret, password),
          'EX',
          TOTP_SECRET_TTL
        );
      } else {
        try {
          tfaSecret = decrypt(tfaSecret, password);
        } catch (decryptError) {
          throw new GraphQLError(
            'Invalid password. Cannot decrypt the secret.'
          );
        }
      }


      return {
        secret: tfaSecret
      };
    };
  }

  /**
 * Executes the setup process for two-factor authentication (2FA) for a user.
 * 
 * @param client - The GraphQL client.
 * @param args - The arguments for the setup process.
 * @param ctx - The context object.
 * @returns An array of recovery codes.
 * @throws {GraphQLError} If the user is not found, 2FA secret is not found, or the 2FA code is invalid.
 */
  export namespace setup {
    export type TArgs = {
      userId: User['id'];
      password: string;
      tfaCode: string;
    };
    export type TReturn = string[];
    export const exec: TFunction.GraphqlClientBasedResolver.ReturnRequired<
      TArgs,
      TReturn
    > = async (client, args, ctx) => {
      const { userId, password, tfaCode } = args;

      const user = await UserModel.findById.exec(client, { userId }, ctx);
      if (!user) throw GraphQLError.notFound('user');

      const tfaSecretKey = `tfa:secret:${user.id}`;
      const tfaSecretEncrypted = await redis.get(tfaSecretKey);

      if (!tfaSecretEncrypted) {
        throw new GraphQLError('2FA secret not found for current user');
      }

      const tfaSecret = decrypt(tfaSecretEncrypted, password);
      if (!authenticator.check(tfaCode, tfaSecret)) {
        throw new GraphQLError('Invalid 2FA code');
      }

      const recoveryCodes = await generateRecoveryCodes();

      const userData: UserModel.update.TArgs = {
        id: user.id,
        tfaSecret: tfaSecretEncrypted,
        tfaRecoveryCodes: recoveryCodes.hashed
      };

      await UserModel.update.exec(client, userData, ctx);

      await redis.del(tfaSecretKey);

      return recoveryCodes.raw;
    };
  }

  /**
 * Executes the 'remove' operation.
 * 
 * @param client - The GraphQL client.
 * @param args - The arguments for the operation.
 * @param ctx - The context for the operation.
 * @returns The removed user.
 * @throws {GraphQLError} If the user is not found, or if the provided 2FA code or recovery code is invalid.
 */
  export namespace remove {
    export type TArgs = {
      userId: User['id'];
      password: string;
    } & ({ tfaCode: string } | { recoveryCode: string });
    export type TReturn = User;
    export const exec: TFunction.GraphqlClientBasedResolver.ReturnRequired<
      TArgs,
      TReturn
    > = async (client, args, ctx) => {
      const { userId, password } = args;

      let user = await UserModel.findById.exec(client, { userId }, ctx);
      if (!user) throw GraphQLError.notFound('user');

      const tfaCode = 'tfaCode' in args && args.tfaCode;
      const recoveryCode = 'recoveryCode' in args && args.recoveryCode;

      if (!tfaCode && !recoveryCode) {
        throw new GraphQLError('You need to provide 2FA code or recovery code');
      }

      if (!user.tfaSecret) {
        throw new GraphQLError('You do not have 2FA enabled');
      }

      if (tfaCode) {
        let tfaSecret: string;
        try {
          tfaSecret = decrypt(user.tfaSecret, password);
        } catch (decryptError) {
          throw new GraphQLError('Invalid password. Cannot decrypt secret key');
        }

        if (!authenticator.check(tfaCode, tfaSecret)) {
          throw new GraphQLError('Invalid 2FA code');
        }
      } else if (recoveryCode) {
        const recoveryCodes = user.tfaRecoveryCodes!;
        const tfaRecoveryCode = await async.find(recoveryCodes, async code => {
          return argon2.verify(code, recoveryCode);
        });

        if (_.isNil(tfaRecoveryCode)) {
          throw new GraphQLError('Invalid recovery code');
        }
      }

      const userData: UserModel.update.TArgs = {
        id: user.id,
        tfaSecret: null,
        tfaRecoveryCodes: null
      };

      user = await UserModel.update.exec(client, userData, ctx);

      if (!user) throw GraphQLError.notFound('user');

      return user!;
    };
  }

  /**
 * Executes the resetPassword function.
 * 
 * @param {string} token - The token used for verification.
 * @param {string} jwtSecret - The secret key used for JWT verification.
 * @param {string} oldPassword - The old password of the user. Required if recoveryCode is not provided.
 * @param {string} tfaCode - The TFA code of the user. Required if recoveryCode is not provided.
 * @param {string} recoveryCode - The recovery code of the user. Required if oldPassword and tfaCode are not provided.
 * @returns {UserWithToken} - The user object with the updated token.
 * @throws {GraphQLError} - If the token is already used, the user does not have 2FA enabled, the old password is invalid, the recovery code is invalid, or if the user is not found.
 */
  export namespace resetPassword {
    export type TArgs = {
      token: string;
      jwtSecret: string;
    } & (
      | {
          oldPassword: string;
          tfaCode: string;
        }
      | { recoveryCode: string }
    );

    export type TReturn = UserWithToken;
    export const exec: TFunction.GraphqlClientBasedResolver.ReturnRequired<
      TArgs,
      TReturn
    > = async (client, args, ctx) => {
      const { token, jwtSecret } = args;
      const jwtPayload = jwt.verify<BasicAuth.ResetPasswordPayload>(
        token,
        jwtSecret,
        { sub: BasicAuth.RESET_PASSWORD_SUB }
      );

      const oldPassword = 'oldPassword' in args && args.oldPassword;
      const tfaCode = 'tfaCode' in args && args.tfaCode;
      const recoveryCode = 'recoveryCode' in args && args.recoveryCode;

      if (!recoveryCode) {
        if (!oldPassword || !tfaCode) {
          throw new GraphQLError(
            'You should provide both TFA Code and Old Password or only Recovery Code.'
          );
        }
      }

      let user = await UserModel.findById.exec(
        client,
        { userId: jwtPayload.user },
        ctx
      );

      if (!user) throw GraphQLError.notFound('user');

      if (user.jwtVersion !== jwtPayload.jwtVersion) {
        throw new GraphQLError('Token is already used');
      }

      if (!user.tfaSecret) {
        throw new GraphQLError('You do not have 2FA enabled');
      }

      let tfaSecret: string | null | undefined;
      let tfaRecoveryCodes: string[] | null | undefined;
      if (oldPassword) {
        try {
          tfaSecret = decrypt(user.tfaSecret, oldPassword);

          if (tfaCode) {
            if (!authenticator.check(tfaCode, tfaSecret!)) {
              throw new GraphQLError('Invalid 2FA code');
            }

            // generate new tfa secret
            tfaSecret = encrypt(tfaSecret, jwtPayload.password);
          }
        } catch (e) {
          if (e instanceof GraphQLError) throw e;
          throw new GraphQLError(
            'Old password is invalid. Cannot decrypt the secret.'
          );
        }
      }

      if (recoveryCode) {
        const recoveryCodes = user.tfaRecoveryCodes!;

        const tfaRecoveryCode = await async.find(recoveryCodes, async code => {
          return argon2.verify(code, recoveryCode);
        });

        if (_.isNil(tfaRecoveryCode)) {
          throw new GraphQLError('Invalid recovery code');
        } else if (tfaSecret && !tfaCode) {
          tfaRecoveryCodes = _.filter(
            recoveryCodes,
            code => code !== (tfaRecoveryCode as any)
          );

          // generate new tfa secret
          tfaSecret = encrypt(tfaSecret, jwtPayload.password);
        } else {
          // reset tfa
          tfaSecret = null;
          tfaRecoveryCodes = null;
        }
      }

      const hash = await argon2.hash(jwtPayload.password);

      const userDataForUpdate: UserModel.update.TArgs = {
        id: user.id,
        password: hash,
        jwtVersion: user.jwtVersion + 1,
        failedLoginAttempts: 0,
        locked: false,
        tfaSecret,
        tfaRecoveryCodes
      };

      user = await UserModel.update.exec(client, userDataForUpdate, ctx);

      if (!user) throw GraphQLError.notFound('user');

      const authData: BasicAuth.generateAuthToken.TArgs = {
        user,
        jwtSecret
      };

      const authToken = await BasicAuth.generateAuthToken.exec(
        client,
        authData,
        ctx
      );

      return { user, token: authToken };
    };
  }

  /**
 * Executes the login process for a user.
 * 
 * @param {string} token - The token used for authentication.
 * @param {string} jwtSecret - The secret key used for JWT encryption.
 * @param {string} tfaCode - The 2FA code provided by the user.
 * @param {string} recoveryCode - The recovery code provided by the user.
 * @returns {UserWithToken} - The user object with the generated token.
 * @throws {GraphQLError} - If the user is not found, the account is locked, 2FA is not enabled, or the provided codes are invalid.
 */
  export namespace login {
    export type TArgs = {
      token: string;
      jwtSecret: string;
    } & ({ tfaCode: string } | { recoveryCode: string });

    export type TReturn = UserWithToken;
    export const exec: TFunction.GraphqlClientBasedResolver.ReturnRequired<
      TArgs,
      TReturn
    > = async (client, args, ctx) => {
      const { token, jwtSecret } = args;

      const recoveryCode = 'recoveryCode' in args && args.recoveryCode;
      const tfaCode = 'tfaCode' in args && args.tfaCode;

      if (!tfaCode && !recoveryCode) {
        throw new GraphQLError('You must provide 2FA code or recovery code');
      }

      const jwtPayload = jwt.verify<{ email: string; password: string }>(
        token,
        jwtSecret,
        { sub: 'tfa' },
        jwt.JWTAlgo.HS256
      );

      const user = await UserModel.findByEmail.exec(
        client,
        { email: jwtPayload.email },
        ctx
      );

      if (!user) throw GraphQLError.notFound('user');

      if (user.locked) {
        throw new GraphQLError(
          'Your account is locked due exceeding limit of unsuccessful login attempts. Please reset your password.'
        );
      }

      if (!user.tfaSecret) {
        throw new GraphQLError('You do not have 2FA enabled');
      }

      let tfaSecret: string;
      try {
        tfaSecret = decrypt(
          user.tfaSecret,
          Buffer.from(jwtPayload.password, 'hex')
        );
      } catch (decryptError) {
        throw new GraphQLError('Invalid password. Cannot decrypt the secret.');
      }

      let errorMessage: string | undefined;
      if (tfaCode) {
        if (!authenticator.check(tfaCode, tfaSecret)) {
          errorMessage = 'Invalid 2FA code';
        }
      } else if (recoveryCode) {
        const recoveryCodes = user.tfaRecoveryCodes!;

        const tfaRecoveryCode = await async.find(recoveryCodes, async code => {
          return argon2.verify(code, recoveryCode);
        });

        if (_.isNil(tfaRecoveryCode)) {
          errorMessage = 'Invalid recovery code';
        } else {
          // FIXME: wrong return value type in @types/async
          user.tfaRecoveryCodes = _.filter(
            recoveryCodes,
            code => code !== (tfaRecoveryCode as any)
          );
        }
      }

      let failedLoginAttempts = user.failedLoginAttempts;
      let userLocked: boolean = user.locked;
      if (errorMessage) {
        failedLoginAttempts += 1;
        if (failedLoginAttempts > FAILED_ATTEMPTS_LIMIT) {
          userLocked = true;
          await BasicAuth.initPasswordReset.exec(client, { user }, ctx);
        }
      } else {
        failedLoginAttempts = 0;
      }

      if (
        user.locked !== userLocked ||
        user.failedLoginAttempts !== failedLoginAttempts ||
        recoveryCode
      ) {
        const userDataForUpdate: UserModel.update.TArgs = {
          id: user.id,
          failedLoginAttempts,
          locked: userLocked,
          tfaRecoveryCodes: user.tfaRecoveryCodes
        };

        await UserModel.update.exec(client, userDataForUpdate, ctx);
      }

      if (errorMessage) {
        throw new GraphQLError(errorMessage);
      }

      const authData: BasicAuth.generateAuthToken.TArgs = {
        user,
        jwtSecret
      };

      const authToken = await BasicAuth.generateAuthToken.exec(
        client,
        authData,
        ctx
      );

      return { token: authToken, user };
    };
  }
}

export default TfaAuth;
