import { Catch, RpcExceptionFilter } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';

/**
 * ExceptionFilter class is responsible for catching and handling RpcException errors.
 * It implements the RpcExceptionFilter interface.
 *
 * @remarks
 * This class is used in conjunction with the @Catch decorator to specify which types of exceptions it can handle.
 * When an exception of the specified type is thrown, the catch() method is called to handle the exception.
 *
 * @example
 * ```typescript
 * @Catch(RpcException)
 * export class ExceptionFilter implements RpcExceptionFilter {
 *   catch(exception: RpcException): Observable<any> {
 *     return throwError(() => exception.getError());
 *   }
 * }
 * ```
 *
 * @see RpcExceptionFilter
 * @see Catch
 * @see RpcException
 * @see Observable
 * @see throwError
 */
@Catch(RpcException)
export class ExceptionFilter implements RpcExceptionFilter {
  /**
 * Handles the caught exception and returns an Observable.
 * 
 * @param exception - The RpcException that was caught.
 * @returns An Observable that emits the error obtained from the RpcException.
 */
  catch(exception: RpcException): Observable<any> {
    return throwError(() => exception.getError());
  }
}
