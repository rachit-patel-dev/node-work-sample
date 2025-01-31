import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';

/**
 * The AppModule class is responsible for configuring the application module.
 * It imports the ConfigModule and registers it with the provided options.
 * It also specifies the controllers and providers for the application.
 */
@Module({
  imports: [ConfigModule.register({ folder: './config' })],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
