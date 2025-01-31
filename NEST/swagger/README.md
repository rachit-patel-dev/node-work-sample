# Swagger Implementation in NestJS

## Installation

Install the necessary packages:

```bash
npm install @nestjs/swagger swagger-ui-express
```

## Setup Instructions

### 1. **AppModule Configuration**

Import the `SwaggerModule` and `DocumentBuilder` from `@nestjs/swagger`. Configure the Swagger options using `DocumentBuilder` and create a Swagger document. Then, use `SwaggerModule.createDocument` to generate the Swagger JSON document.

```typescript
// app.module.ts

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

@Module({
  imports: [
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('NestJS Swagger Example')
        .setDescription('API documentation using Swagger')
        .setVersion('1.0')
        .build(),
    ),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

### 2. **Swagger Initialization**

In the `main.ts` file, use `SwaggerModule.setup` to configure the Swagger UI. This will expose the Swagger documentation at the specified route.

```typescript
// main.ts

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  SwaggerModule.setup('api', app, document); // Expose Swagger UI at /api

  await app.listen(3000);
}
bootstrap();
```

### 3. **Controller Decorators**

Decorate your controllers and endpoints with Swagger decorators to provide additional information for the Swagger documentation.

```typescript
// app.controller.ts

import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('App') // Tag for the Swagger UI
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: 'Get Hello World' })
  @ApiResponse({ status: 200, description: 'Return Hello World' })
  getHello(): string {
    return 'Hello World!';
  }
}
```

## Summary

- **Installation**: Install `@nestjs/swagger` and `swagger-ui-express`.
- **AppModule Configuration**: Import `SwaggerModule` and `DocumentBuilder`. Configure Swagger options using `DocumentBuilder` and create a Swagger document.
- **Swagger Initialization**: In the `main.ts` file, use `SwaggerModule.setup` to configure the Swagger UI.
- **Controller Decorators**: Decorate controllers and endpoints with Swagger decorators for additional documentation.

By following these steps, you can quickly integrate Swagger into your NestJS application, providing API documentation with minimal code. The Swagger UI will be available at the specified route, and additional information can be added using Swagger decorators in your controllers.