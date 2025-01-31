### Mongoose sample

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



# Mongoose with NestJS Explanation

The provided code showcases the integration of Mongoose, a MongoDB ODM (Object Document Mapper), with NestJS. Mongoose simplifies interactions with MongoDB by providing a schema-based solution.

## Cat Schema (`cat.schema.ts`)

- **Schema Definition**: The `Cat` schema is defined using the `@Schema` decorator from Mongoose. The schema contains properties like `name`, `age`, and `breed`, each annotated with the `@Prop` decorator.

- **Document Type**: The `CatDocument` type is created using `HydratedDocument<Cat>` from Mongoose, representing a hydrated document for the `Cat` schema.

- **Schema Factory**: `SchemaFactory.createForClass(Cat)` creates the Mongoose schema based on the `Cat` class definition.

## Cats Module (`cats.module.ts`)

- **Module Definition**: The `CatsModule` is a NestJS module that encapsulates the functionality related to cats.

- **MongooseModule.forFeature**: The `MongooseModule.forFeature` method is used to import the `Cat` schema into the module. This allows the module to use the `Cat` schema within its components.

## Cats Service (`cats.service.ts`)

- **Injecting Model**: The `CatsService` class is injectable and utilizes the `@InjectModel` decorator to inject the Mongoose Model for the `Cat` schema.

- **CRUD Operations**: The service includes methods for creating (`create`), retrieving all (`findAll`), retrieving one by ID (`findOne`), and deleting by ID (`delete`) cats.

## Cats Controller (`cats.controller.ts`)

- **HTTP Endpoints**: The `CatsController` is a NestJS controller that defines HTTP endpoints for cat-related operations.

## AppModule (`app.module.ts`)

- **Module Definition**: The `AppModule` is the root module of the NestJS application.

- **MongooseModule.forRoot**: Configures the Mongoose connection using `MongooseModule.forRoot` by specifying the MongoDB connection URI (`'mongodb://localhost:27017/test'`).

- **Module Import**: The `CatsModule` is imported, indicating that the application uses features provided by the `CatsModule`.

## Conclusion

In summary, the provided code illustrates the integration of Mongoose with NestJS for MongoDB interaction. Mongoose simplifies MongoDB operations through a schema-based approach. The application is structured with modules, services, and controllers, providing a clean and organized architecture for working with MongoDB in a NestJS application.