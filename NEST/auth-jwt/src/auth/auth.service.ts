import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

/**
 * The AuthService class is responsible for handling user authentication and generating access tokens.
 * It uses the UsersService class to retrieve user information and the JwtService class to sign access tokens.
 *
 * @class
 * @public
 * @constructor
 * @param {UsersService} usersService - An instance of the UsersService class.
 * @param {JwtService} jwtService - An instance of the JwtService class.
 */
@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  /**
 * Sign in a user with the provided username and password.
 * 
 * @param username - The username of the user.
 * @param pass - The password of the user.
 * @returns An object containing the access token.
 * @throws UnauthorizedException if the provided username or password is incorrect.
 */
  async signIn(username: string, pass: string) {
    const user = await this.usersService.findOne(username);
    if (user?.password !== pass) {
      throw new UnauthorizedException();
    }
    const payload = { username: user.username, sub: user.userId };
    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}
