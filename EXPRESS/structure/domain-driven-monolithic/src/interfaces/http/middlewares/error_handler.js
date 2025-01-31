const Status = require('http-status')

/**
 * Description: This function handles errors and sends an internal server error response.
 * 
 * Parameters:
 * - err: The error object.
 * - req: The request object.
 * - res: The response object.
 * - next: The next middleware function.
 * - logger: The logger object used for logging errors.
 * - config: The configuration object.
 * 
 * Returns: None
 * 
 * Example Usage:
 * 
 * <unknown>(err, req, res, next, logger, config);
 */
module.exports = (err, req, res, next, logger, config) => { // eslint-disable-line no-unused-vars
  logger.error(err.message)

  const response = Object.assign({
    type: 'InternalServerError'
  }, config.env === 'development' && {
    message: err.message,
    stack: err.stack
  })

  res.status(Status.INTERNAL_SERVER_ERROR).json(response)
}
