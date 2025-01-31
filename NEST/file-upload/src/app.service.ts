import { Injectable } from '@nestjs/common';

/**
 * The AppService class is a service that provides a method to retrieve a greeting message.
 * It is decorated with the @Injectable() decorator to indicate that it can be injected as a dependency.
 *
 * @publicApi
 */
@Injectable()
export class AppService {
  /**
 * Returns a JSON object with a greeting message.
 * 
 * @returns {Object} - A JSON object with the greeting message.
 */
  getHello() {
    return { hello: 'world' };
  }
}
