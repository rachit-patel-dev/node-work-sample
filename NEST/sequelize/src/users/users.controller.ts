import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './models/user.model';
import { UsersService } from './users.service';

/**
 * Controller responsible for handling user-related requests.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
 * Create a new user.
 * 
 * @param createUserDto - The data for creating a new user.
 * @returns A promise that resolves to the created user.
 */
  @Post()
  create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.usersService.create(createUserDto);
  }

  /**
 * Retrieve all users.
 * 
 * @returns A promise that resolves to an array of users.
 */
  @Get()
  findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }

  /**
 * Retrieve a user by ID.
 * 
 * @param id - The ID of the user to retrieve.
 * @returns A promise that resolves to the retrieved user.
 */
  @Get(':id')
  findOne(@Param('id') id: string): Promise<User> {
    return this.usersService.findOne(id);
  }

  /**
 * Remove a user by ID.
 * 
 * @param id - The ID of the user to remove.
 * @returns A promise that resolves to void.
 */
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.usersService.remove(id);
  }
}
