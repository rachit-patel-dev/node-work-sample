import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { jwtConstants } from './constants';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';

/**
 * The AuthGuard class is an implementation of the CanActivate interface from the @nestjs/common module.
 * It is responsible for authenticating incoming requests and ensuring that only authorized users can access protected routes.
 * 
 * @class
 * @implements CanActivate
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
  ) {}

  /**
 * Determines if the user is authorized to access the requested route.
 * 
 * @param {ExecutionContext} context - The execution context of the current request.
 * @returns {Promise<boolean>} - A promise that resolves to a boolean indicating if the user is authorized.
 * @throws {UnauthorizedException} - Throws an UnauthorizedException if the user is not authorized.
 */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      // 💡 See this condition
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException();
    }
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: jwtConstants.secret,
      });
      // 💡 We're assigning the payload to the request object here
      // so that we can access it in our route handlers
      request['user'] = payload;
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }

  /**
 * Extracts the token from the authorization header of the request.
 * 
 * @param {Request} request - The request object.
 * @returns {string | undefined} - The extracted token or undefined if not found.
 */
  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
