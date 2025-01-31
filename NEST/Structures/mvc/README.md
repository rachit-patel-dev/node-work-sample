# MVC Structure in NestJS

NestJS follows a modular and organized structure based on the Model-View-Controller (MVC) pattern. Below is an explanation of the key components and their roles in a NestJS MVC application.

## Model

In the context of NestJS, the "Model" refers to the representation of data and business logic. Models are often represented by entities, which are TypeScript classes defining the shape of data stored in a database.

Example of a User Entity:

```typescript
// user.entity.ts

import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstName: string;

  @Column()
  lastName: string;
}
```

## Controller

Controllers handle the incoming HTTP requests, process them, and return the appropriate HTTP response. Controllers in NestJS are annotated with decorators such as `@Controller`, `@Get`, `@Post`, etc.

Example of a UserController:

```typescript
// user.controller.ts

import { Controller, Get, Post, Body } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './user.entity';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  findAll(): Promise<User[]> {
    return this.userService.findAll();
  }

  @Post()
  create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.userService.create(createUserDto);
  }
}
```

## Service

Services contain the business logic of the application and interact with the data layer (database) through repositories or entities. They are responsible for processing data and applying business rules.

Example of a UserService:

```typescript
// user.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './create-user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  create(createUserDto: CreateUserDto): Promise<User> {
    const user = this.userRepository.create(createUserDto);
    return this.userRepository.save(user);
  }
}
```

## DTO (Data Transfer Object)

DTOs are used to define the shape of data transferred between the client and the server. They help in validating and transforming the incoming data.

Example of a CreateUserDto:

```typescript
// create-user.dto.ts

export class CreateUserDto {
  firstName: string;
  lastName: string;
}
```

## Summary

- **Model**: Represents data and business logic, often in the form of entities.
- **Controller**: Handles HTTP requests, processes them, and returns the appropriate HTTP response.
- **Service**: Contains business logic, interacts with the data layer, and applies business rules.
- **DTO (Data Transfer Object)**: Defines the shape of data transferred between the client and the server.

NestJS encourages a modular and organized MVC structure, making it easier to develop, maintain, and scale applications. Each component (Model, Controller, Service) has a specific responsibility, contributing to a clean and maintainable codebase.