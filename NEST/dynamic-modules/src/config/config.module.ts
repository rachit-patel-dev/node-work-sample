import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from './config.service';
import { CONFIG_OPTIONS } from './constants';

export interface ConfigModuleOptions {
  folder: string;
}

/**
 * The ConfigModule class is responsible for registering the configuration module in the NestJS application.
 * It provides a static method 'register' that accepts a 'ConfigModuleOptions' object and returns a 'DynamicModule'.
 * The 'register' method is used to configure the module with the specified options and provide the 'ConfigService' as a provider.
 * The 'ConfigService' is responsible for reading and retrieving configuration values from the environment files.
 * The module can be imported in other modules to access the 'ConfigService' and retrieve configuration values.
 * The 'ConfigService' is also exported by the module for easy access in other modules.
 */
@Module({})
export class ConfigModule {
  /**
 * Registers the ConfigModule with the provided options.
 * 
 * @param options - The options for the ConfigModule.
 * @returns A dynamic module object.
 */
  static register(options: ConfigModuleOptions): DynamicModule {
    return {
      module: ConfigModule,
      providers: [
        {
          provide: CONFIG_OPTIONS,
          useValue: options,
        },
        ConfigService,
      ],
      exports: [ConfigService],
    };
  }
}
