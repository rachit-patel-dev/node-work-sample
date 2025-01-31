import {
  Controller,
  Post,
  Req,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dtos';
import { ApiTags } from '@nestjs/swagger';

/**
 * AuthController is responsible for handling authentication related requests.
 *
 * @remarks
 * This controller provides endpoints for user login.
 *
 * @example
 * ```
 * // Sample usage
 * const controller = new AuthController(authService);
 * const result = await controller.loginHandler(req, dto);
 * console.log(result);
 * ```
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
 * Handles the login request.
 *
 * @param req - The request object.
 * @param dto - The login data transfer object.
 * @returns A Promise that resolves to the result of the login operation.
 * @throws HttpException if the authorization token is missing or invalid.
 */
  @Post('login')
  async loginHandler(@Req() req: Request, @Body() dto: LoginDto) {
    if (!req.headers.authorization) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Bad Request: Authorization token problem',
          path: `/auth/login`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (req.headers.authorization.split(' ')[0] !== 'PadelMates') {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Bad Request: Authorization token problem',
          path: `/auth/login`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.authService.login(
      dto,
      req.headers.authorization.replace('PadelMates ', ''),
    );
  }
}
