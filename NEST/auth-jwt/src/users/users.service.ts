import { Injectable } from '@nestjs/common';

// This should be a real class/interface representing a user entity
export type User = any;

/**
 * The UsersService class is responsible for managing user data and providing user-related functionality.
 * It provides methods for finding a user by their username.
 * 
 * @remarks
 * This class is used in conjunction with the NestJS framework and is decorated with the @Injectable() decorator.
 * 
 * @example
 * // Create an instance of the UsersService class
 * const userService = new UsersService();
 * 
 * // Find a user by their username
 * const user = await userService.findOne('john');
 * 
 * @publicApi
 */
@Injectable()
export class UsersService {
  private readonly users = [
    {
      userId: 1,
      username: 'john',
      password: 'changeme',
    },
    {
      userId: 2,
      username: 'maria',
      password: 'guess',
    },
  ];

  /**
 * Finds a user by their username.
 * 
 * @param username - The username of the user to find.
 * @returns A Promise that resolves to the found user, or undefined if no user is found.
 */
  async findOne(username: string): Promise<User | undefined> {
    return this.users.find(user => user.username === username);
  }
}
