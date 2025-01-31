### Mongo TypeORM sample

### Installation

`npm install`

### Running

This example requires docker or a local mongodb installation.  If using a local mongodb, see `app.module.ts` for connection options, and make sure there are matching options for the mongodb installation and the source code.

#### Docker

There is a `docker-compose.yml` file for starting Docker.

`docker-compose up`

After running the sample, you can stop the Docker container with

`docker-compose down`

### Run the sample

Then, run Nest as usual:

`npm run start`



# MongoDB with NestJS Explanation

The provided code showcases the integration of MongoDB with NestJS using the TypeORM library. It involves defining a MongoDB entity (`Photo`), creating a service (`PhotoService`) to interact with the MongoDB database, and configuring the NestJS application to use MongoDB through the `TypeOrmModule`.

## MongoDB Entity (`Photo`)

The `Photo` entity represents a document in the MongoDB database. It uses the `@Entity` decorator from TypeORM, and fields are annotated with decorators like `@ObjectIdColumn` and `@Column` to define the structure of the document. The `@ObjectIdColumn` is used for the unique identifier, and `@Column` decorators are applied to other fields.

## Photo Service (`PhotoService`)

The `PhotoService` is an injectable service that interacts with the MongoDB database. It uses the `InjectRepository` decorator from `@nestjs/typeorm` to inject the `MongoRepository<Photo>` into the service. The `findAll` method retrieves all photos from the MongoDB collection using the `find` method provided by the repository.

## AppModule

The `AppModule` is the root module of the NestJS application. It is configured to use the `TypeOrmModule` for MongoDB integration.

- **TypeORM Configuration**: The `TypeOrmModule.forRoot` method is used to configure the MongoDB connection. It specifies the type of database (`mongodb`), host, database name, entities (including the `Photo` entity), and synchronization setting. Synchronization (`synchronize: true`) automatically creates database tables and indexes based on entity metadata.

- **Module Import**: The `PhotoModule` is imported, indicating that the application uses features provided by the `PhotoModule`.

## Conclusion

In summary, the provided code demonstrates the integration of MongoDB with NestJS using TypeORM. The `Photo` entity defines the MongoDB document structure, the `PhotoService` interacts with the MongoDB database, and the `AppModule` is configured to use MongoDB through `TypeOrmModule`. This setup allows NestJS applications to leverage MongoDB as a data store for persistence.