const fs = require('fs')
const path = require('path')
const Sequelize = require('sequelize')

/**
 * This function initializes and configures a Sequelize database connection and returns a database object.
 * 
 * @param {Object} config - The configuration object containing the database connection details.
 * @param {string} config.db.database - The name of the database.
 * @param {string} config.db.username - The username for the database connection.
 * @param {string} config.db.password - The password for the database connection.
 * @param {string} config.db.host - The host address of the database server.
 * @param {number} config.db.port - The port number of the database server.
 * @param {string} config.db.dialect - The dialect of the database (e.g., 'mysql', 'postgres', 'sqlite', 'mssql').
 * @param {string} basePath - The base path for the models directory.
 * @returns {Object} - The database object containing the Sequelize instance, Sequelize class, and models.
 */
module.exports = ({ config, basePath}) => {
  const sequelize = new Sequelize(config.db.database, config.db.username, config.db.password, {
    host: config.db.host,
    port: config.db.port,
    dialect: config.db.dialect,
  });
  if (process.env.NODE_ENV === 'test') {
    sequelize.options.logging = false;
  }
  const db = {
    sequelize,
    Sequelize,
    models: {}
  }

  const dir = path.join(basePath, './models')
  fs.readdirSync(dir).forEach(file => {
    const modelDir = path.join(dir, file)
    const model = sequelize.import(modelDir)
    db.models[model.name] = model
  })
  // registered foreign key.
  db.models.Bureaus.belongsTo(db.models.Users, { foreignKey: 'UsersID' });
  db.models.Users.hasMany(db.models.Bureaus, { foreignKey: 'UsersID' });

  db.models.SourceFields.belongsTo(db.models.SourceFiles, { foreignKey: 'FilesID' });
  db.models.SourceFiles.hasMany(db.models.SourceFields, { foreignKey: 'FilesID' });
  db.models.EmployerPlans.belongsTo(db.models.Providers, { foreignKey: 'ProvidersID' });
  db.models.Providers.hasMany(db.models.EmployerPlans, { foreignKey: 'ProvidersID' }) // define one-to-many relationship
  db.models.Employers.belongsTo(db.models.EmployerPlans, { foreignKey: 'EmployerPlansID' });
  db.models.Employers.belongsTo(db.models.Bureaus, { foreignKey: 'BureausID', as: 'bureau' });
  db.models.BulkEmployerFiles.belongsTo(db.models.Bureaus, { foreignKey: 'BureausID' });
  db.models.Bureaus.hasMany(db.models.Employers, { foreignKey: 'BureausID' });

  // after create methods
  db.models.Employers.afterCreate(async (employer, options) => {
    const bureau = await db.models.Bureaus.findByPk(employer.BureausID, {
      attributes: [
        'ID'
      ],
    });
    await bureau.increment('EmployerCount', { by: 1 });
  });

  Object.keys(db.models).forEach(key => {
    if ('associate' in db.models[key]) {
      db.models[key].associate(db.models)
    }
  })
  return db
}
