import { Inject, Injectable } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { CONFIG_OPTIONS } from './constants';
import { ConfigOptions, EnvConfig } from './interfaces';

/**
 * ConfigService class is responsible for loading and retrieving environment configuration variables.
 *
 * @remarks
 * This class uses the `dotenv` library to parse the environment variables from a specified `.env` file.
 * The file path is determined based on the `folder` property provided in the `ConfigOptions` object.
 *
 * @example
 * ```typescript
 * const configService = new ConfigService({ folder: 'config' });
 * const value = configService.get('API_KEY');
 * console.log(value); // Output: '123456789'
 * ```
 */
@Injectable()
export class ConfigService {
  private readonly envConfig: EnvConfig;

  constructor(@Inject(CONFIG_OPTIONS) options: ConfigOptions) {
    const filePath = `${process.env.NODE_ENV || 'development'}.env`;
    const envFile = path.resolve(__dirname, '../../', options.folder, filePath);
    this.envConfig = dotenv.parse(fs.readFileSync(envFile));
  }

  get(key: string): string {
    return this.envConfig[key];
  }
}
