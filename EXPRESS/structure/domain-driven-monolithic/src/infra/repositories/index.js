const User = require('./user')
const database = require('../database')

/**
 * Description: This function exports an object that contains a userRepository and sendGrid property. The userRepository property is initialized with the User function, passing in the userModel as a parameter. The sendGrid property is assigned the value of the sendGrid parameter.
 * 
 * @param {Object} options - An object containing the sendGrid, config, and logger parameters.
 * @param {Object} options.sendGrid - The sendGrid object.
 * @param {Object} options.config - The config object.
 * @param {Object} options.logger - The logger object.
 * 
 * @returns {Object} - An object containing the userRepository and sendGrid properties.
 */
module.exports = ({ sendGrid, config, logger }) => {
  const models = database({ config, logger }).models
  const userModel = models.Users
  return {
    userRepository: User({ model: userModel }),
    sendGrid: sendGrid
  }
}