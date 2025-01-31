
const database = require('../infra/database')

/**
 * Description: This function initializes the database connection and starts the server.
 * 
 * Parameters:
 * - server: The server object used to start the server.
 * - config: The configuration object containing database and server configurations.
 * - logger: The logger object used for logging messages.
 * 
 * Returns:
 * - An object with a 'start' method that starts the server.
 * 
 * @param {Object} options - The options object containing server, config, and logger.
 * @returns {Object} - An object with a 'start' method.
 */
module.exports = ({ server, config, logger }) => {
  const databaseObj = database({ config, logger })
  databaseObj.sequelize
    .authenticate()
    .then(() => {
      logger.info(`Database connected successfully ${config.db.database}`);
    })
    .catch((error) => {
      logger.error('Unable to connect to the database:', error);
    });

  return {
    start: () =>
      Promise
        .resolve()
        .then(server.start)
  }
}
