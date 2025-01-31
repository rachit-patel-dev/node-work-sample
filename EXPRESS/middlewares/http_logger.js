const morgan = require('morgan')

/**
 * This function returns a middleware function that logs HTTP requests using the morgan library.
 * 
 * @param {Object} logger - The logger object used to log the request messages.
 * @returns {Function} - The middleware function that logs the request messages.
 */
module.exports = (logger) => {
  return morgan('common', {
    stream: {
      write: (message) => {
        logger.info(message.slice(0, -1))
      }
    }
  })
}
