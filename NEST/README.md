# NESTJS Sample Code-Base Modules

## authjwt
Provides authentication functionality using JSON Web Tokens (JWT), allowing secure user authentication and authorization within the NestJS application.[Link to README](./auth-jwt/README.md)

## cache
Offers caching mechanisms to improve performance by storing frequently accessed data in memory or other storage solutions, reducing the need to retrieve the data from the original source repeatedly.[Link to README](./cache/README.md)

## cronjob
Enables the scheduling and execution of recurring tasks based on a predefined schedule or interval, allowing for automated processes such as data backups, notifications, or cleanup tasks.[Link to README](./cronjob/README.md)

## db_connection
Handles the connection and interaction with various types of databases, including relational databases (e.g., MySQL, PostgreSQL) or NoSQL databases (e.g., MongoDB), providing seamless integration within the NestJS application.[Link to README](./db_connection/README.md)

## dynamic-modules
Facilitates the dynamic loading and management of modules at runtime, allowing for flexible and modular application architecture, where modules can be added or removed dynamically based on specific conditions or configurations.[Link to README](./dynamic-modules/README.md)

## event-emitter
Implements an event-driven architecture using the EventEmitter pattern, enabling components within the NestJS application to communicate and react to events, promoting loose coupling and scalability.[Link to README](./event-emitter/README.md)

## fastify
Integrates the Fastify framework into the NestJS application, offering enhanced performance and low overhead for handling HTTP requests and responses, particularly suitable for high-throughput and low-latency applications.[Link to README](./fastify/README.md)

## file-upload
Provides functionality for handling file uploads within the NestJS application, allowing users to upload files, validate them, and store them in a secure and efficient manner, supporting various file storage providers and configurations.[Link to README](./file-upload/README.md)

## gateways
Implements gateway components for handling communication with external systems, services, or APIs, encapsulating communication protocols, data transformations, and error handling within the NestJS application.[Link to README](./gateways/README.md)

## graphql-prisma
Integrates GraphQL with Prisma ORM for building GraphQL APIs and interacting with databases using a type-safe and auto-generated schema, simplifying data fetching and manipulation within the NestJS application.[Link to README](./graphql-prisma/README.md)

## grpc
Facilitates communication between microservices or between the NestJS application and external systems using gRPC, a high-performance RPC framework, enabling efficient and language-agnostic inter-service communication.[Link to README](./grpc/README.md)

## mongo-typeorm
Integrates MongoDB with TypeORM, providing an Object-Relational Mapping (ORM) solution for interacting with MongoDB databases using TypeScript classes and decorators, streamlining data access and manipulation.[Link to README](./mongo-typeorm/README.md)

## mongoose
Provides integration with Mongoose, an Object Data Modeling (ODM) library for MongoDB and Node.js, simplifying the interaction with MongoDB databases by defining schemas, models, and queries in a structured manner.[Link to README](./mongoose/README.md)

## queues
Implements message queuing functionality for asynchronous communication and task processing within the NestJS application, facilitating decoupling, scalability, and fault tolerance in distributed systems.[Link to README](./queues/README.md)

## scheduling
Enables the scheduling and execution of tasks at specific times or intervals within the NestJS application, allowing for automation of recurring processes, such as sending reminders, generating reports, or triggering notifications.[Link to README](./scheduling/README.md)

## serializer
Provides serialization and deserialization capabilities for converting data between different formats, such as JSON, XML, or binary, ensuring interoperability and data exchange between components within the NestJS application or with external systems.[Link to README](./serializer/README.md)

## server-static
Serves static files, such as HTML, CSS, JavaScript, or images, directly from the file system or a designated directory, enabling the delivery of static content to clients without the need for dynamic processing within the NestJS application.[Link to README](./serve-static/README.md)

## sql-typeorm
Integrates relational databases, such as MySQL, PostgreSQL, or SQLite, with TypeORM, allowing for seamless interaction with SQL databases using TypeScript entities, queries, and transactions within the NestJS application.[Link to README](./sql-typeorm/README.md)

## structures
Defines different architectural patterns and structures for organizing and designing NestJS applications, including microservices, monolithic architectures, Model-View-Controller (MVC) patterns, and variations optimized for performance or specific use cases.[Link to README](./Structures/)

### microservices
Describes an architectural pattern where the application is decomposed into small, independent services that communicate through lightweight protocols, promoting scalability, resilience, and maintainability.[Link to README](./Structures/microservices/README.md)

### monolithic
Refers to a traditional architectural pattern where the entire application is built and deployed as a single, cohesive unit, typically consisting of multiple layers or components tightly integrated within the same codebase.[Link to README](./Structures/monolithic/README.md)

### mvc
Adopts the Model-View-Controller pattern for structuring the application, separating concerns into distinct layers for data manipulation (Model), user interface (View), and business logic (Controller), promoting modularity and maintainability.[Link to README](./Structures/mvc/README.md)

### mvc-fastify
Combines the MVC pattern with the Fastify framework, leveraging the performance benefits of Fastify while adhering to the principles of the MVC architecture for building robust and efficient web applications.[Link to README](./Structures/mvc-fastify/README.md)

## swagger
Integrates Swagger UI for automatically generating interactive API documentation based on the OpenAPI Specification (formerly known as Swagger), providing developers and users with a comprehensive overview of the NestJS API endpoints, parameters, and responses.[Link to README](./swagger/README.md)
