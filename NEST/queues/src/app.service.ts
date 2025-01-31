import { Injectable } from '@nestjs/common';

/**
 * The AppService class is a service that provides a method to get a greeting message.
 * It is decorated with the @Injectable() decorator to indicate that it can be injected as a dependency.
 *
 * @publicApi
 */
@Injectable()
export class AppService {
  /**
 * Returns a greeting message.
 *
 * @returns The greeting message "Hello World!".
 */
  getHello(): string {
    return 'Hello World!';
  }
}
