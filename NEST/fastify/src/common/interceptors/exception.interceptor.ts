import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * ExceptionInterceptor class is a NestJS interceptor that handles exceptions thrown during the execution of a request.
 * It implements the NestInterceptor interface.
 *
 * @remarks
 * This interceptor catches any errors thrown by the request handler and wraps them in an HttpException with a specified message and status code.
 * It is used to provide a consistent error response format across the application.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class ExceptionInterceptor implements NestInterceptor {
 *   intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
 *     return next
 *       .handle()
 *       .pipe(
 *         catchError(err =>
 *           throwError(
 *             () =>
 *               new HttpException(
 *                 'Exception interceptor message',
 *                 HttpStatus.BAD_GATEWAY,
 *               ),
 *           ),
 *         ),
 *       );
 *   }
 * }
 * ```
 *
 * @see {@link NestInterceptor}
 * @see {@link HttpException}
 * @see {@link HttpStatus}
 */
@Injectable()
export class ExceptionInterceptor implements NestInterceptor {
  /**
 * Intercepts the execution of a request and handles any exceptions that occur.
 * 
 * @param context - The execution context of the request.
 * @param next - The next call handler in the chain.
 * @returns An observable that emits the result of the request or throws an HttpException if an exception occurs.
 */
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next
      .handle()
      .pipe(
        catchError(err =>
          throwError(
            () =>
              new HttpException(
                'Exception interceptor message',
                HttpStatus.BAD_GATEWAY,
              ),
          ),
        ),
      );
  }
}
