import { CacheInterceptor } from '@nestjs/cache-manager';
import { ExecutionContext, Injectable } from '@nestjs/common';

/**
 * HttpCacheInterceptor is a custom interceptor that extends the CacheInterceptor class from the @nestjs/cache-manager package.
 * It is used to track and cache HTTP requests based on specific criteria.
 *
 * @publicApi
 * @module Interceptors
 */
@Injectable()
export class HttpCacheInterceptor extends CacheInterceptor {
  /**
 * Returns the URL of the HTTP request if it is a GET request and not in the list of excluded paths.
 * Otherwise, returns undefined.
 *
 * @param context - The execution context of the request.
 * @returns The URL of the HTTP request or undefined.
 */
  trackBy(context: ExecutionContext): string | undefined {
    const request = context.switchToHttp().getRequest();
    const { httpAdapter } = this.httpAdapterHost;

    const isGetRequest = httpAdapter.getRequestMethod(request) === 'GET';
    const excludePaths = [
      // Routes to be excluded
    ];
    if (
      !isGetRequest ||
      (isGetRequest &&
        excludePaths.includes(httpAdapter.getRequestUrl(request)))
    ) {
      return undefined;
    }
    return httpAdapter.getRequestUrl(request);
  }
}
