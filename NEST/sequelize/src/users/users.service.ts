import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './models/user.model';

/**
 * UsersService class handles the CRUD operations for the User model.
 *
 * @class
 * @public
 * @module UsersService
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User)
    private readonly userModel: typeof User,
  ) {}

  /**
 * Creates a new user.
 * 
 * @param createUserDto - The data for creating a new user.
 * @returns A promise that resolves to the created user.
 */
  create(createUserDto: CreateUserDto): Promise<User> {
    return this.userModel.create({
      firstName: createUserDto.firstName,
      lastName: createUserDto.lastName,
    });
  }

  /**
 * Retrieves all users.
 * 
 * @returns A promise that resolves to an array of users.
 */
  async findAll(): Promise<User[]> {
    return this.userModel.findAll();
  }

  /**
 * Retrieves a user by their ID.
 * 
 * @param id - The ID of the user to retrieve.
 * @returns A promise that resolves to the user with the specified ID.
 */
  findOne(id: string): Promise<User> {
    return this.userModel.findOne({
      where: {
        id,
      },
    });
  }

  /**
 * Removes a user by their ID.
 * 
 * @param id - The ID of the user to remove.
 * @returns A promise that resolves when the user is successfully removed.
 */
  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await user.destroy();
  }
}
