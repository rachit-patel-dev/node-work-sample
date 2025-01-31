import { Injectable, NestMiddleware } from '@nestjs/common';

/**
 * LoggerMiddleware is a middleware class that logs incoming requests.
 *
 * @class
 * @implements {NestMiddleware}
 * @module LoggerMiddleware
 */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  /**
 * Middleware method that logs the incoming request and calls the next middleware in the chain.
 * 
 * @param req - The incoming request object.
 * @param res - The response object.
 * @param next - The callback function to call the next middleware.
 * @returns void
 */
  use(req: any, res: any, next: () => void) {
    console.log(`Request...`);
    next();
  }
}
