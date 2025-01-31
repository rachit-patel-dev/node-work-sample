# Database
> Main entry point of what backing service we gonna use.Sure, here is a markdown representation of the provided code snippet:

# Sequelize Bureau Model

## Inputs
- `sequelize`: An instance of Sequelize.
- `DataTypes`: An object that contains the data types supported by Sequelize.

## Flow
1. The code exports a function that takes `sequelize` and `DataTypes` as parameters.
2. Inside the function, the `Bureau` model is defined using `sequelize.define` method.
3. The model has various properties:
   - `ID`: Integer with auto-increment and primary key.
   - `UsersID`: Integer with foreign key constraint.
   - `FederalID`: String with a length constraint.
   - `PrimaryContact`: String.
   - `PrimaryContactPhoneNumber`: String with a length constraint.
   - Other properties with their respective data types and constraints.
4. The model also includes options:
   - `freezeTableName`: Prevents Sequelize from pluralizing the table name.
   - `timestamps`: Adds `createdAt` and `updatedAt` fields to the table.
  
## Outputs
The `Bureau` model object.

## Usage Example
```javascript
const Sequelize = require('sequelize');
const DataTypes = Sequelize.DataTypes;

const sequelize = new Sequelize('database', 'username', 'password', {
  host: 'localhost',
  dialect: 'mysql'
});

const BureauModel = require('./bureauModel')(sequelize, DataTypes);
const Bureau = BureauModel(sequelize, DataTypes);

// Use the Bureau model to perform database operations
// ...
