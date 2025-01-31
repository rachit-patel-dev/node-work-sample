# MVC with Fastify and NestJS

[NestJS](https://nestjs.com/) is a powerful and modular framework for building scalable server-side applications with TypeScript. When combined with [Fastify](https://www.fastify.io/), a highly efficient web framework, you get a performant and extensible solution. Here's a simplified explanation in markdown format with minimal code.

## Installation

```bash
npm install @nestjs/core @nestjs/platform-fastify fastify
```

## AppModule Configuration

1. **Import Modules:**

   ```typescript
   // app.module.ts
   
   import { Module } from '@nestjs/common';
   import { AppController } from './app.controller';
   import { AppService } from './app.service';
   import { FastifyAdapter, NestFastifyApplication, FastifyExpressOptions } from '@nestjs/platform-fastify';
   import { NestFactory } from '@nestjs/core';

   @Module({
     controllers: [AppController],
     providers: [AppService],
   })
   export class AppModule {}
   ```

2. **Create Application:**

   ```typescript
   // main.ts
   
   import { NestFactory } from '@nestjs/core';
   import { AppModule } from './app.module';
   import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

   async function bootstrap() {
     const app = await NestFactory.create<NestFastifyApplication>(
       AppModule,
       new FastifyAdapter(),
     );
     await app.listen(3000);
   }
   bootstrap();
   ```

## Controller

Controllers handle incoming requests, process them, and return responses.

```typescript
// app.controller.ts

import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHello(): string {
    return 'Hello World!';
  }
}
```

## Summary

- **Installation**: Install `@nestjs/core`, `@nestjs/platform-fastify`, and `fastify`.
- **AppModule Configuration**: Import required modules and create the application.
- **Controller**: Handle incoming requests and define endpoint logic.

Combining NestJS with Fastify allows you to benefit from the modularity and ease of use of NestJS along with the high performance of Fastify. The above examples provide a basic structure with minimal code to get you started.