const path = require('path')

/**
 * Creates routes for a controller based on the provided controller URI.
 *
 * @param {string} controllerUri - The URI of the controller.
 * @returns {Object} - The result of invoking the Controller function.
 */
module.exports = function createControllerRoutes (controllerUri) {
  const controllerPath = path.resolve('src/interfaces/http/modules', controllerUri)
  const Controller = require(controllerPath)

  return Controller()
}
