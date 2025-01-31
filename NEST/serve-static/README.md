# Serving Static Files with NestJS

NestJS provides the `ServeStaticModule` from the `@nestjs/serve-static` package to serve static files such as HTML, CSS, images, and other assets. This is particularly useful when building applications that include a front-end or need to serve static resources.

## Installation

Ensure you have the necessary packages installed:

```bash
npm install @nestjs/common @nestjs/serve-static
```

## AppModule Configuration

In the `AppModule`, import `ServeStaticModule` and configure it using the `forRoot` method. This allows you to define the rootPath for static file serving and specify any exclusions.

```typescript
// app.module.ts

import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'client'), // Path to the static files
      exclude: ['/api/(.*)'], // Exclude certain paths from static file serving
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
```

## Configuration Explanation

- **rootPath**: Specifies the root directory from which static files will be served. In the example, `join(__dirname, '..', 'client')` sets the rootPath to the 'client' directory located one level above the current directory.

- **exclude**: An array of regular expressions or strings defining paths to exclude from static file serving. In the example, `/api/(.*)` is excluded, indicating that any path starting with '/api/' should not be served as a static file.

## Serving Static Files

With this configuration, any file within the 'client' directory can now be accessed by the server. For example, if there is an HTML file at 'client/index.html', it can be accessed at `http://localhost:3000/index.html`.

```plaintext
http://localhost:3000/index.html
```

## Conclusion

Configuring static file serving in NestJS using `ServeStaticModule` is a simple and effective way to serve static assets. This is especially useful when building full-stack applications with a separate front-end and back-end, allowing you to easily serve HTML, CSS, and other assets from a specified directory.