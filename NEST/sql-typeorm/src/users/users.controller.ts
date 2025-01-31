import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  ParseIntPipe,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './user.entity';
import { UsersService } from './users.service';

/**
 * Controller for managing users.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
 * Creates a new user.
 * 
 * @param createUserDto - The data for creating a new user.
 * @returns A promise that resolves to the created user.
 */
  @Post()
  create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.usersService.create(createUserDto);
  }

  /**
 * Retrieves all users.
 * 
 * @returns A promise that resolves to an array of users.
 */
  @Get()
  findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }

  /**
 * Retrieves a user by their ID.
 * 
 * @param id - The ID of the user to retrieve.
 * @returns A promise that resolves to the retrieved user.
 */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<User> {
    return this.usersService.findOne(id);
  }

  /**
 * Removes a user by their ID.
 * 
 * @param id - The ID of the user to remove.
 * @returns A promise that resolves to void.
 */
  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.usersService.remove(id);
  }
}
