## Dynamic Configuration with ConfigService in NestJS

The `ConfigService` and its usage in the `AppModule` demonstrate a dynamic configuration approach in a NestJS application. This allows the application to adapt its configuration based on the environment (development, production, etc.) and external configuration files.

### ConfigService

The `ConfigService` is responsible for loading environment-specific configuration values from `.env` files. It utilizes the `dotenv` library to parse the contents of the environment files.

#### Initialization:

- The `ConfigService` is initialized with an injected `CONFIG_OPTIONS`, which contains the path to the folder where environment-specific `.env` files are stored.

- It dynamically constructs the path to the environment file based on the current environment (`process.env.NODE_ENV`), defaulting to `'development'` if no environment is specified.

- The `dotenv` library is used to parse the contents of the environment file, populating the `envConfig` property.

#### Accessing Configuration Values:

- The `get` method allows retrieval of specific configuration values by key.

### AppModule

The `AppModule` imports the `ConfigModule` to make the `ConfigService` available throughout the application.

#### ConfigModule

- The `ConfigModule` is a dynamic module configured with the `ConfigOptions` provided via `ConfigModule.register({ folder: './config' })`.

- This allows the application to specify the folder where environment-specific configuration files are located. In this case, it is set to `./config`.

#### Usage in AppModule

- By importing the `ConfigModule`, the `ConfigService` becomes available for use in other components, services, or controllers within the `AppModule`.

### How to Use

1. **Initialization:**
   - Import the `ConfigModule` into the module where dynamic configuration is needed.

   ```typescript
   import { ConfigModule } from './config/config.module';

   @Module({
     imports: [ConfigModule.register({ folder: './config' })],
     // other module configurations
   })
   export class YourModule {}
   ```

2. **Accessing Configuration:**
   - Inject the `ConfigService` into the constructor of a service, controller, or other components.

   ```typescript
   import { ConfigService } from './config/config.service';

   constructor(private readonly configService: ConfigService) {
     const value = this.configService.get('KEY_NAME');
   }
   ```

3. **Dynamic Configuration:**
   - The application dynamically loads configuration values based on the specified environment and configuration files.

This dynamic configuration approach provides flexibility in managing environment-specific settings without hardcoding values, enhancing maintainability and adaptability.