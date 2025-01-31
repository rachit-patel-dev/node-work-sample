### SQL TypeORM sample

### Installation


`npm install`

### Running

This example requires docker or a local MySQL installation.  If using a local MySQL database, see `app.module.ts` for credentials, and make sure there are matching credentials in the database and the source code.

#### Docker

There is a `docker-compose.yml` file for starting Docker.

`docker-compose up`

After running the sample, you can stop the Docker container with

`docker-compose down`

### Run the sample

Then, run Nest as usual:

`npm run start`

## Setup Instructions

### 1. **AppModule Configuration**

- Import necessary modules and configuration in the `AppModule`.

```typescript
// app.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql', // Database type
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'password',
      database: 'nestjs_db',
      entities: [__dirname + '/**/*.entity{.ts,.js}'], // Entities directory
      synchronize: true, // Auto-create database tables (dev only)
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

### 2. **Entity Definition**

- Create entities representing database tables.

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

### 3. **Migrations**

- Use TypeORM migrations for database schema changes.

```bash
npx typeorm migration:create -n CreateUserTable
```

```typescript
// migration-timestamp-create-user-table.ts

import {MigrationInterface, QueryRunner} from "typeorm";

export class CreateUserTable1632248857649 implements MigrationInterface {
    name = 'CreateUserTable1632248857649'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "user" (
                "id" int NOT NULL PRIMARY KEY AUTO_INCREMENT,
                "firstName" varchar(255) NOT NULL,
                "lastName" varchar(255) NOT NULL
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "user"`);
    }
}
```

### 4. **Seeding**

- Use seed data to populate the database.

```typescript
// user.seed.ts

import { Factory, Seeder } from 'typeorm-seeding';
import { Connection } from 'typeorm';
import { User } from '../entities/user.entity';

export default class CreateUsers implements Seeder {
  public async run(factory: Factory, connection: Connection): Promise<any> {
    await factory(User)().createMany(10);
  }
}
```

```bash
npx ts-node -r tsconfig-paths/register -r ts-node/register ./seeds/user.seed.ts
```

### 5. **Usage in Codebase**

- Inject the repository in services or controllers to interact with the database.

```typescript
// user.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  async findOne(id: number): Promise<User> {
    return this.userRepository.findOne(id);
  }

  async create(user: User): Promise<User> {
    return this.userRepository.save(user);
  }

  async update(id: number, updateUser: User): Promise<User> {
    await this.userRepository.update(id, updateUser);
    return this.userRepository.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.userRepository.delete(id);
  }
}
```

## Summary

- **Installation**: Install `@nestjs/typeorm` and `typeorm` packages.
- **Entity Definition**: Create entities representing database tables.
- **AppModule Configuration**: Configure TypeORM in the `AppModule`.
- **Migrations**: Use TypeORM migrations for database schema changes.
- **Seeding**: Use seed data to populate the database.
- **Usage in Codebase**: Inject the repository in services or controllers to interact with the database.

These steps provide a basic guide for using SQL TypeORM in a NestJS application, including setting up the database connection, defining entities, performing migrations, seeding data, and using repositories for database operations.
