import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

/**
 * The bootstrap function initializes and starts the application.
 * It creates a NestFactory instance with the AppModule as the root module.
 * Then, it configures the Swagger documentation options using the DocumentBuilder.
 * The SwaggerModule is used to create the Swagger document and set up the Swagger UI.
 * Finally, the application listens on port 3000 and logs the URL where it is running.
 *
 * @returns {Promise<void>} A promise that resolves when the application is running.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const options = new DocumentBuilder()
    .setTitle('Cats example')
    .setDescription('The cats API description')
    .setVersion('1.0')
    .addTag('cats')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api', app, document);

  await app.listen(3000);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
