import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Starts the application by creating a NestFactory instance and listening on port 3000.
 * 
 * @returns {Promise<void>} A promise that resolves when the application has started.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
