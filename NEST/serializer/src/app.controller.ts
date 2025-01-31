import {
  ClassSerializerInterceptor,
  Controller,
  Get,
  UseInterceptors,
} from '@nestjs/common';
import { RoleEntity } from './entities/role.entity';
import { UserEntity } from './entities/user.entity';

/**
 * The AppController class is responsible for handling HTTP requests and responses for the application.
 * It is decorated with the @Controller decorator from the '@nestjs/common' package.
 * The class also uses the @UseInterceptors decorator to apply the ClassSerializerInterceptor to all methods in the controller.
 */
@Controller()
@UseInterceptors(ClassSerializerInterceptor)
export class AppController {
  /**
 * Retrieves a single user entity.
 *
 * @returns {UserEntity} The user entity.
 */
  @Get()
  findOne(): UserEntity {
    return new UserEntity({
      id: 1,
      firstName: 'Kamil',
      lastName: 'Mysliwiec',
      password: 'password',
      role: new RoleEntity({ id: 1, name: 'admin' }),
    });
  }
}
