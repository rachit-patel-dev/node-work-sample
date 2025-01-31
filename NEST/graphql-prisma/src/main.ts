import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Starts the application by creating a NestFactory instance and listening on port 3000.
 * It also sets up a global validation pipe and logs the application URL and GraphQL Playground URL.
 * 
 * @returns {Promise<void>} A promise that resolves when the application is started.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());

  await app.listen(3000);
  console.log(`Application is running on: ${await app.getUrl()}`);
  console.log(`GraphQL Playground: ${await app.getUrl()}/graphql`);
}
bootstrap();
