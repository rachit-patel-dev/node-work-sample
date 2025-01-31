import querystring from 'querystring';
import * as fs from 'fs';
import * as path from 'path';
import { Level } from 'pino';
import { deepMerge } from '../utils/object';
import { getAndValidateSecrets, AppSecrets } from './secrets';
import { config as defaultConfig } from './default';
import { config as developmentConfig } from './development';
import { config as testConfig } from './test';

export interface AppConfig {
  name: string;

  sentry: {
    dsn?: string;
    release?: string;
  };

  logger: {
    pretty: boolean;
    level: Level;
  };

  postgres: {
    disableDrop: boolean;
    schema: string;
    user: string;
    host: string;
    database: string;
    port: number;
    // pool config
    max: number;
    min: number;
    idleTimeoutMillis: number;
    connectionTimeoutMillis: number;
  };

  http: {
    port: number;
    host: string;
    client: string;
    cors: boolean;
  };

  googleCloud: {
    projectId: string;
    clientEmail: string;
    bucket: string;
    uploadsPrefix: string;
    uploadsMaxSize: number;
  };

  images: {
    domain: string;
  };

  redis: {
    port: number;
    host: string;
    runArena: boolean;
  };

  socialAuth: {
    googleAppId: string;
    facebookAppId: string;
    linkedinAppId: string;
  };

  emails: {
    debug: boolean | string;
    fromName: string;
    fromEmail: string;
    alertEmails: string[];
    accessKeyId: string;
    replyToDomain: string;
    /** No topic – no replies :) */
    snsTopicArn?: string;
  };

  stripe: {
    livemode: boolean;
    connectClientId: string;

    priceId: string;
    productId: string;
  };

  matching: {
    disable: boolean;
    proTypesDoc: string;
    proSpecialtiesDoc: string;
  };

  secretsPath: string;

  pushNotifications: {
    appleServer: string;
    appleKeyId: string;
    appleTeamId: string;
  };

  quickBooks: {
    environment: string;
  };
}

export type IConfig = AppConfig & {
  secrets: AppSecrets;
  utils: {
    clientUrl(path: string, queryParams?: { [key: string]: any }): string;
    apiUrl(path: string, queryParams?: { [key: string]: any }): string;
  };
};

/**
 * Builds the configuration object based on the current environment.
 * 
 * @returns {IConfig} The built configuration object.
 * @throws {Error} If the specified config does not exist.
 */
function buildConfig(): IConfig {
  const configName = (process.env.PROJECT_ENV || process.env.NODE_ENV || 'development').toLowerCase();

  // @TODO: Find a way to type this
  let currentConfig;
  switch (configName) {
    case 'development':
      currentConfig = deepMerge({}, developmentConfig);
      const localConfigPath = path.join(__dirname, 'local.json');
      if (fs.existsSync(localConfigPath)) {
        const localConfig = require(localConfigPath);
        deepMerge(currentConfig, localConfig);
      }
      break;
    case 'test':
      currentConfig = testConfig;
      break;
    case 'xyz-com':
      break;
    default:
      throw new Error(`Config '${configName}' does not exists`);
  }

  const mergedConfig: AppConfig = deepMerge(defaultConfig, currentConfig);

  return Object.assign(mergedConfig, {
    secrets: getAndValidateSecrets(mergedConfig.secretsPath),
    utils: {
      clientUrl: urlBuilder(mergedConfig.http.client),
      apiUrl: urlBuilder(mergedConfig.http.host)
    }
  });
}

/**
 * Builds a URL by appending a path and optional query parameters to a base URL.
 * 
 * @param base - The base URL to build upon.
 * @returns A function that takes a path and optional query parameters and returns the complete URL.
 */
function urlBuilder(base: string) {
  return (path: string, queryParams?: { [key: string]: any }) => {
    if (path[0] === '/') path = path.slice(1);
    const query = queryParams ? '?' + querystring.stringify(queryParams) : '';
    return `${base}/${path}${query}`;
  };
}

export const config = buildConfig();
