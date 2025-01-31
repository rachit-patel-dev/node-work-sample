# Tests-api-node

> RESTful api with Domain Driven Design

## Development Environment Setup

1.  Make sure you have `nvm`, node `v18.13.0` or `LTS` version of node installed
2.  install nvm for node version manager.
3.  install node version using nvm install nvm install v18.13.0.
4.  nvm alias default 18.13.0 and then nvm use.
5.  Install `yarn` - `npm install -g yarn`.
6.  Use a smart `.npmrc`. By default, `npm` doesn’t save installed dependencies to package.json (and you should always track your dependencies!).
7.  Use yarn install or npm install command to install all dependencies.

### NOTE:

If you encounter installation issues with `bcrypt` you need to install [node-gyp](https://github.com/nodejs/node-gyp) first.
If you update your node version to latest and you encountered compatibility issues:

1. Ensure that there is no `pm2` runnign `pm2 list` (if there is kill the process)
2. You have to rebuild your bcrypt running this command `npm rebuild bcrypt --update-binary`

## Quick Start

### Application Setup (Development)

```sh
$ npm install -g standard   # JavaScript Standard Style
$ npm install -g babel-eslint  # required by StandardJs
$ npm install -g snazzy   # Format JavaScript Standard Style as beautiful output
$ npm install -g sequelize-cli  # CLI for Sequelize
```

1. Install the dependencies with [Yarn](https://yarnpkg.com/en/docs/install/)(yarn install or npm install)
2. Create the development and test [Databases]

### Database Setup (Development)

    1. Install [Sql-server](https://www.microsoft.com/en-in/sql-server/sql-server-downloads).
    2. Create an empty database named - `test_development` and `test` for test enviroment.
    3. Rename the .env and populate it with the correct credentials and settings of your sql-server databases

**Note** 3. Run following commands only for development.

- `yarn reset-db:dev`
- `yarn createSuperUser` to create a superuser(Admin)
4. Run the application in development mode with `yarn start:dev`
5. Access `http://localhost:<PORT>/api/<VERSION>` and you're ready to go!
   > http://localhost:4000/api/v1
6. To run test-cases `yarn test`

## Static files.

- We are storing static files in public directory.
- Make media/ directory in public directory.

## Overview

- uses Node.js > v9
- written using ES6
- uses Yarn for package dependency management
- uses [JavaScript Standard Style](http://standardjs.com/)
- uses `sequelize` and `sequelize-cli` as ORM and data migration tool
  > can change easily to diffrent ORM and migration tool.
- Filename convention - `camelCase` should never be used. This leaves `snake_case` and `kebab-case`, I prefer `snake_case` for file.

## CLI Tools

- `yarn start - start the test for production
- `yarn start:dev - start the test for locally/development
- `yarn reset-db:dev` - reset db in the test for locally/development with migrations and seeders.
- `yarn reset-db:test - reset db in the test for test
- `yarn test - run Unit tests
- `yarn migrate` - apply db changes using migration script
- `yarn add <package-name>` - add a new package to package.json
- `yarn remove <package-name>` - remove package from package.json
- `npx sequelize model:create --name newmodel` --attributes "id:integer, title:string - create a new model

## Using Sequelize

Sequelize is used to define mappings between models and database tables. It will automatically add the attributes `created_at` and `updated_at` to the tables created. However for consistency for our naming we change this to `createdAt` and `updatedAt`. This will cause issue when using model so we have to add this on config:

```js
module.exports = function (sequelize, DataTypes) {
  const User = sequelize.define('users', {
    ...
  }, {
    timestamps: false, // Add this
  })
}
```

Basic commands

```sh
$ sequelize  db:migrate             Run pending migrations.
$ sequelize  db:migrate:old_schema  Update legacy migration table
$ sequelize  db:migrate:undo        Revert the last migration run.
$ sequelize  db:migrate:undo:all    Revert all migrations ran.
$ sequelize  db:seed                Run seeders.
$ sequelize  db:seed:all            Run allseeders.
$ sequelize  db:seed:undo           Deletes data from the database.
$ sequelize  db:seed:undo:all       Deletes data from the database.
$ sequelize model:create --name modelname --attributes "text:text, url:string"  # create model
$ sequelize seed:create     # create seeder
```

> If you did not install your sequelize-cli globally you can run this commands by `npx`

#### Setting up associations — migration and model files

**IMPORTANT**: as of `6/23/17` the model file created with the `sequelize db:model` command still initializes a model with an empty `classMethods` object with an `associate` property in the options passed to `sequelize.define` method. **You cannot define associations this way anymore as of Sequelize v4.0.0-1.** This tripped me up for a hot second because the generated model file did not reflect this change, and the fact that support for the old way had been removed is seemingly buried in the changelogs. Don’t make the same mistake I did and be super confused for too long about why associations aren’t working.

```js

```

### Sequelize CLI Documentation

For reference, see: [https://github.com/sequelize/cli](https://github.com/sequelize/cli)

### Version
1.0.0
