import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
// import mongoose from 'mongoose';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

/**
 * Starts the NestJS application and listens for incoming requests on the specified port.
 * 
 * @returns {Promise<void>} A promise that resolves when the application is successfully started.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
    bodyParser: false,
    logger: ['error'],
  });

  // const allowedOrigins = [
  //   'http://localhost:3000',
  //   'https://versionlens-x-padel-mates.s3.eu-north-1.amazonaws.com',
  //   'https://uploads.padelmates.co/index.php',
  //   'https://uploads.padelmates.co/images/',
  //   'https://52.18.69.204:443', // Add the IP address here
  // ];

  app.enableCors({
    origin: '*',

    // allowedHeaders: '*',
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });

  // app.use((req: Request, res: Response, next: NextFunction) => {
  //   res.headers('Access-Control-Allow-Origin', '*');
  //   next();
  // });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
    }),
  );

  // * Swagger setup

  const config = new DocumentBuilder()
    .setTitle('Backend API')
    .setDescription('Backend API description')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    // swaggerOptions: {
    //   docExpansion: 'none',
    // },
  });

  const PORT = process.env.PORT || 3000;
  // mongoose.set('debug', true);

  await app.listen(PORT, () =>
    console.log(`server is up and running at ${PORT}`),
  );
}
bootstrap();
