import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * A guard that checks if a user has the required roles to access a resource.
 *
 * This guard implements the `CanActivate` interface from the `@nestjs/common` package.
 * It is used to protect routes and endpoints in a NestJS application.
 *
 * @remarks
 * The `RolesGuard` class takes a `Reflector` instance as a dependency in its constructor.
 * The `Reflector` is used to retrieve the roles metadata from the handler method.
 *
 * @example
 * ```typescript
 * import { Controller, Get, UseGuards } from '@nestjs/common';
 * import { RolesGuard } from './roles.guard';
 *
 * @Controller('users')
 * @UseGuards(RolesGuard)
 * export class UsersController {
 *   @Get()
 *   @Roles('admin')
 *   findAll() {
 *     // ...
 *   }
 * }
 * ```
 *
 * @publicApi
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  /**
 * Determines whether the user is authorized to access the resource.
 * 
 * @param {ExecutionContext} context - The execution context of the request.
 * @returns {boolean} - Returns true if the user is authorized, otherwise false.
 */
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get<string[]>('roles', context.getHandler());
    if (!roles) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const hasRole = () =>
      !!user.roles.find(role => !!roles.find(item => item === role));

    return user && user.roles && hasRole();
  }
}
