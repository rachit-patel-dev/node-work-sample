### Prisma GraphQL schema first sample

This sample project uses sqlite as the relational database. To use a different database, check the [Prisma docs](https://www.prisma.io/docs/getting-started).

### Installation

1. Install dependencies: `npm install`
2. Generate TypeScript type definitions for the GraphQL schema: `npm run generate:typings`
3. Create sqlite database and create tables: `npx prisma db push`
4. Start server: `npm run start:dev`

### Graphql Playground

When the application is running, you can go to [http://localhost:3000/graphql](http://localhost:3000/graphql) to access the GraphQL Playground.  See [here](https://docs.nestjs.com/graphql/quick-start#playground) for more.


# GraphQL with Prisma in NestJS

## Overview

This document provides an explanation of a NestJS application that uses GraphQL for API functionality and Prisma for database interaction.

## Prisma Schema

The Prisma schema file (`schema.prisma`) defines the data model and database connection.

- **Datasource**: Specifies the database provider and connection URL (in this case, SQLite).
- **Generator**: Configures the Prisma Client for JavaScript.

```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

generator client {
  provider = "prisma-client-js"
}

model Post {
  id          String  @id @default(uuid())
  title       String
  text        String
  isPublished Boolean @default(false)
}
```

## NestJS Service

The `PostsService` in NestJS handles CRUD operations for posts using the Prisma Client.

- `findOne(id: string): Promise<Post | null>`: Retrieves a post by ID.
- `findAll(): Promise<Post[]>`: Retrieves all posts.
- `create(input: NewPost): Promise<Post>`: Creates a new post.
- `update(params: UpdatePost): Promise<Post>`: Updates a post by ID.
- `delete(id: string): Promise<Post>`: Deletes a post by ID.

```typescript
@Injectable()
export class PostsService {
  // ... constructor and methods ...
}
```

## GraphQL Schema

The GraphQL schema (`graphql.schema.ts`) defines the types, queries, mutations, and subscriptions.

- **Types**: `Post`, `NewPost`, and `UpdatePost` represent the data structure.
- **Query**: Defines operations to retrieve posts.
- **Mutation**: Specifies operations to create, update, and delete posts.
- **Subscription**: Enables real-time updates when a new post is created.

```typescript
type Post {
  id: ID!
  title: String!
  text: String!
  isPublished: Boolean!
}

input NewPost {
  title: String!
  text: String!
}

input UpdatePost {
  id: ID!
  title: String
  text: String
  isPublished: Boolean
}

type Query {
  posts: [Post!]!
  post(id: ID!): Post
}

type Mutation {
  createPost(input: NewPost!): Post!
  updatePost(input: UpdatePost!): Post
  deletePost(id: ID!): Post
}

type Subscription {
  postCreated: Post
}
```

## Prisma Client Service

The `PrismaService` class extends the Prisma Client and initializes the database connection during module initialization. It also enables shutdown hooks to close the database connection when the NestJS application exits.

```typescript
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  // ... onModuleInit and enableShutdownHooks methods ...
}
```

## GraphQL DTOs

DTOs (Data Transfer Objects) for GraphQL are generated automatically. These classes represent the input and output structures of GraphQL operations.

- `NewPost`, `UpdatePost`, and `Post` classes mirror the GraphQL types.

## Conclusion

This NestJS application integrates GraphQL for API functionality and Prisma for database access, providing a scalable and efficient solution for handling posts. The combination of GraphQL and Prisma simplifies data operations and enhances the development experience.