import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './user.entity';

/**
 * The UsersService class is responsible for handling user-related operations.
 * It provides methods for creating, retrieving, and deleting users.
 * 
 * @class
 * @public
 * @module UsersService
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /**
 * Creates a new user.
 * 
 * @param createUserDto - The data for creating a new user.
 * @returns A promise that resolves to the created user.
 */
  create(createUserDto: CreateUserDto): Promise<User> {
    const user = new User();
    user.firstName = createUserDto.firstName;
    user.lastName = createUserDto.lastName;

    return this.usersRepository.save(user);
  }

  /**
 * Retrieves all users from the database.
 * 
 * @returns A promise that resolves to an array of User objects.
 */
  async findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  /**
 * Retrieves a user by their ID.
 * 
 * @param id - The ID of the user to retrieve.
 * @returns A promise that resolves to the user with the specified ID.
 */
  findOne(id: number): Promise<User> {
    return this.usersRepository.findOneBy({ id: id });
  }

  /**
 * Removes a user from the database.
 * 
 * @param id - The ID of the user to remove.
 * @returns A promise that resolves to void.
 */
  async remove(id: string): Promise<void> {
    await this.usersRepository.delete(id);
  }
}
