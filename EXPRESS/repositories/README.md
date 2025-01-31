# Repository Module

The first module exports a set of functions that act as a generic repository for interacting with a database model. The second module sets up a specific repository for a model named "Bureau."

## Generic Repository Module

### `module.exports = ({ model }) => { ... }`

This module exports a set of functions that form a generic repository for interacting with a database model. The functions include:

- `getAll(...args)`: Fetches all records from the associated model using `model.findAll(...)`. Returns an array of entities.
- `countAll(...args)`: Counts all records in the associated model using `model.count(...)`. Returns the count.
- `findOne(...args)`: Finds a single record based on specified conditions using `model.findOne(...)`. Returns the data values of the found entity.
- `findById(...args)`: Finds a record by its primary key using `model.findByPk(...)`. Returns the data values of the found entity.
- `create(...args)`: Creates a new record in the associated model using `model.create(...)`. Returns the data values of the created entity.
- `update(...args)`: Updates records in the associated model using `model.update(...)`. Returns the data values of the updated entity.
- `destroy(...args)`: Destroys records in the associated model using `model.destroy(...)`.

The module returns an object containing these functions, making it a reusable and generic repository.

## Bureau Repository Module

### `const Bureau = require('./bureau')`

This module imports the previously defined generic repository module and sets up a specific repository for a model named "Bureau." The exported function takes three parameters: `sendGrid`, `config`, and `logger`. It returns an object with a `bureauRepository` property.

- `const bureauModel = models.Bureaus`: Retrieves the model for "Bureaus" from the `models` object.

- `return { bureauRepository: Bureau({ model: bureauModel }) }`: Returns an object with a `bureauRepository` property that is created by calling the generic repository module, passing the "Bureaus" model.

This setup allows for easy creation and management of repositories for specific models within the application.

This modular approach enhances maintainability and reusability, separating the generic repository logic from the specifics of each model.