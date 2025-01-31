# GraphQL Implementation Overview

## Upper Directive Transformer

The `upperDirectiveTransformer` function transforms a GraphQL schema by adding functionality to uppercase the result of specific fields based on a custom directive. The directive is applied to fields in the schema, and the corresponding resolver is modified to convert the result to uppercase.

## Complexity Plugin

The `ComplexityPlugin` is an Apollo Server plugin implemented in NestJS that addresses query complexity. It utilizes the `graphql-query-complexity` library to estimate and limit the complexity of GraphQL queries. If the complexity exceeds a defined threshold, a `GraphQLError` is thrown.

## Logging Plugin

The `LoggingPlugin` is an Apollo Server plugin implemented in NestJS for logging request-related events. It logs when a request is started and when a response is about to be sent.

## Date Scalar

The `DateScalar` is a custom scalar in NestJS for handling date values in GraphQL. It implements the `CustomScalar` interface and defines how to parse, serialize, and parse literals for date values.

## Recipe Object Type

The `Recipe` object type represents a recipe in the GraphQL schema. It includes fields like `id`, `title` with an `@upper` directive, `description`, `creationDate`, and `ingredients`. The `@upper` directive transforms the result of the `title` field to uppercase.

## Conclusion

The provided GraphQL implementation in NestJS showcases various aspects such as directive transformation, query complexity control, custom scalar for date handling, and object type definition. NestJS, along with Apollo Server plugins and decorators, simplifies the development of GraphQL APIs by providing a structured and modular approach.

# NestJS Apollo Module and Recipes Module

## AppModule

### ApolloModule Configuration

- **Imports:**
  - The `ApolloModule` is imported from `@nestjs/graphql` to enable GraphQL functionality.
  - The `RecipesModule` is imported to include the GraphQL resolver for recipes.

- **ApolloModule Configuration:**
  - `GraphQLModule.forRoot<ApolloDriverConfig>` is used to configure the Apollo Server.
  - `autoSchemaFile` specifies the file where the auto-generated schema will be stored (`schema.gql` in this case).
  - `transformSchema` applies the `upperDirectiveTransformer` to the schema, transforming fields annotated with the `@upper` directive.
  - `installSubscriptionHandlers` enables WebSocket subscriptions.
  - `buildSchemaOptions` includes a custom directive, `upper`, defined for `FIELD_DEFINITION` locations.

## RecipesResolver

### Resolver for Recipe Type

- **Query (`recipe`):**
  - Retrieves a single recipe by its ID from the `RecipesService`.
  - Throws a `NotFoundException` if the recipe is not found.

- **Query (`recipes`):**
  - Retrieves multiple recipes based on provided arguments from the `RecipesService`.

- **Mutation (`addRecipe`):**
  - Adds a new recipe using data from `newRecipeData`.
  - Calls the `create` method from `RecipesService` and publishes the added recipe using GraphQL subscriptions.

- **Mutation (`removeRecipe`):**
  - Removes a recipe by its ID using the `remove` method from `RecipesService`.

- **Subscription (`recipeAdded`):**
  - Subscribes to the event triggered when a new recipe is added.
  - Returns the added recipe asynchronously using the `pubSub.asyncIterator`.

## RecipesService

- **Service Methods:**
  - The `RecipesService` provides methods for interacting with recipes, such as `findOneById`, `findAll`, `create`, and `remove`.

## PubSub

- **GraphQL Subscriptions:**
  - Uses `graphql-subscriptions` PubSub for handling GraphQL subscriptions.
  - Initialized as a singleton and used to publish and subscribe to events.

## Conclusion

The NestJS `AppModule` showcases the integration of the Apollo GraphQL module, including the configuration of the Apollo Server and the transformation of the schema using a custom directive. The `RecipesResolver` demonstrates the implementation of GraphQL queries, mutations, and subscriptions, while the `RecipesService` provides the underlying business logic for handling recipes. The `PubSub` instance facilitates real-time communication through GraphQL subscriptions.



# GraphQL Schema Explanation

The provided GraphQL schema defines a simple recipe management system with queries, mutations, and subscriptions. Below is an explanation of the schema in Markdown format:

## Directives

### `@upper` Directive

- **Usage:** Applied to `FIELD_DEFINITION` locations.
- **Purpose:** Custom directive used to transform the result of a field to uppercase. Applied to the `title` field in the `Recipe` type.

## Scalar Types

### `Date` Scalar

- **Description:** Represents a custom scalar type for handling date values.
- **Parsing:** Converts a numeric value received from the client into a `Date` object.
- **Serialization:** Converts a `Date` object into a numeric value sent to the client.
- **Literal Parsing:** Parses literals (e.g., from GraphQL queries) to create `Date` objects.

## Object Types

### `Recipe` Type

- **Fields:**
  - `id`: Unique identifier for a recipe (type: `ID!`).
  - `description`: Description of the recipe (type: `String`).
  - `creationDate`: Date when the recipe was created (type: `Date!`).
  - `ingredients`: List of ingredients for the recipe (type: `[String!]!`).
  - `title`: Title of the recipe (type: `String!`).
- **Directives:**
  - `@upper`: Applied to the `title` field using the custom `@upper` directive.

## Queries

### `recipe` Query

- **Arguments:**
  - `id`: ID of the recipe to retrieve.
- **Returns:** A single recipe (`Recipe` type).
- **Error Handling:** Throws a `NotFoundException` if the recipe with the specified ID is not found.

### `recipes` Query

- **Arguments:**
  - `skip`: Number of items to skip in the list.
  - `take`: Number of items to retrieve (default: 25).
- **Returns:** A list of recipes (`[Recipe!]!`).

## Mutations

### `addRecipe` Mutation

- **Arguments:**
  - `newRecipeData`: Input data for creating a new recipe (`NewRecipeInput` type).
- **Returns:** The newly created recipe (`Recipe` type).
- **Side Effect:** Publishes a `recipeAdded` event using subscriptions.

### `removeRecipe` Mutation

- **Arguments:**
  - `id`: ID of the recipe to remove.
- **Returns:** `true` if the removal is successful.

## Input Types

### `NewRecipeInput` Input Type

- **Fields:**
  - `title`: Title of the new recipe (type: `String!`).
  - `description`: Description of the new recipe (type: `String`).
  - `ingredients`: List of ingredients for the new recipe (type: `[String!]!`).

## Subscriptions

### `recipeAdded` Subscription

- **Returns:** The newly added recipe (`Recipe` type).
- **Trigger:** Published whenever a new recipe is added using the `addRecipe` mutation.

This GraphQL schema defines a recipe management system with the ability to query, mutate, and subscribe to recipe-related events. The `@upper` directive is used to transform the `title` field to uppercase.