const fs = require('fs')
const winston = require('winston')

if (!fs.existsSync(`logs`)) {
  fs.mkdirSync(`logs`)
}

/**
 * Creates a logger using the winston library.
 * 
 * @param {Object} config - The configuration object.
 * @param {Object} config.logging - The logging configuration object.
 * @param {string} config.env - The environment for the logger.
 * @returns {Object} - The winston logger object.
 */
module.exports = ({ config }) => {
  // eslint-disable-next-line new-cap
  return new winston.createLogger({
    transports: [
      new winston.transports.Console(),
      new winston.transports.File(Object.assign(
        config.logging, {
          filename: `logs/${config.env}.log`
        }))
    ]
  })
}
