import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';

/**
 * AuthController is responsible for handling authentication-related requests.
 */
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  /**
 * Sign in with the provided credentials.
 *
 * @param signInDto - The sign in data containing the username and password.
 * @returns A Promise that resolves to the result of the sign in operation.
 */
  signIn(@Body() signInDto: Record<string, any>) {
    return this.authService.signIn(signInDto.username, signInDto.password);
  }

  /**
 * Retrieves the user profile.
 *
 * @param req - The request object.
 * @returns The user profile.
 */
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }
}
