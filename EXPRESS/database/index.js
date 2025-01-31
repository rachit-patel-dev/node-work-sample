const sequelize = require('src/infra/sequelize')
/**
 * Description: This function initializes and returns a sequelize instance based on the provided configuration.
 * 
 * Parameters:
 * - config: The configuration object containing the necessary database information.
 * 
 * Returns:
 * - If the database configuration is not provided, it logs an error message and returns false.
 * - Otherwise, it returns the sequelize instance.
 */
module.exports = ({ config }) => {
  if (!config.db) {
    /* eslint-disable no-console */
    logger.error('Database config file log not found, disabling database.')
    /* eslint-enable no-console */
    return false
  }

  return sequelize({ config, basePath: __dirname })
}


