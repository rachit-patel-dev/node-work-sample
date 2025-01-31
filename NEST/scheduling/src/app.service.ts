import { Injectable } from '@nestjs/common';

/**
 * The AppService class is responsible for providing the 'Hello World!' message.
 * It is decorated with the @Injectable() decorator to indicate that it can be injected as a dependency.
 */
@Injectable()
export class AppService {
  /**
 * Returns a greeting message.
 * 
 * @returns {string} The greeting message.
 */
  getHello(): string {
    return 'Hello World!';
  }
}
