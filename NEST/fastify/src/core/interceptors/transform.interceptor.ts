import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  data: T;
}

/**
 * Interceptor that transforms the response data into a standardized format.
 *
 * @template T The type of the response data.
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T>>
{
  /**
 * Intercepts the execution context and the call handler.
 * 
 * @param context - The execution context.
 * @param next - The call handler.
 * @returns An observable of the response.
 */
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<Response<T>> {
    return next.handle().pipe(map(data => ({ data })));
  }
}
