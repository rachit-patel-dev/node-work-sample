import { Injectable } from '@nestjs/common';

/**
 * The AppService class is a service class that provides a method to get a greeting message.
 *
 * @remarks
 * This class is decorated with the `Injectable` decorator from the `@nestjs/common` package.
 *
 * @example
 * ```typescript
 * const appService = new AppService();
 * const greeting = appService.getHello();
 * console.log(greeting); // Output: 'Hello World!'
 * ```
 */
@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}
