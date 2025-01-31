import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * LoggingInterceptor is a NestJS interceptor that logs the execution time of a request.
 *
 * @remarks
 * This interceptor is used to log the time taken to process a request before and after it is handled by the application.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class LoggingInterceptor implements NestInterceptor {
 *   intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
 *     console.log('Before...');
 *
 *     const now = Date.now();
 *     return next
 *       .handle()
 *       .pipe(tap(() => console.log(`After... ${Date.now() - now}ms`)));
 *   }
 * }
 * ```
 *
 * @public
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  /**
 * Intercepts the execution of a request and logs the time taken for the request to complete.
 * 
 * @param context - The execution context of the request.
 * @param next - The next call handler in the chain.
 * @returns An observable that represents the result of the intercepted request.
 */
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    console.log('Before...');

    const now = Date.now();
    return next
      .handle()
      .pipe(tap(() => console.log(`After... ${Date.now() - now}ms`)));
  }
}
