const express = require('express')

/**
 * Description: This function creates and configures an Express app, sets up middleware, and returns an object with the app and a start method.
 * 
 * Parameters:
 * - config: An object containing configuration settings for the app.
 * - router: The router object to be used for handling routes.
 * - logger: The logger object for logging messages.
 * - auth: The authentication object for handling authentication.
 * - sendGrid: The sendGrid object for sending emails.
 * 
 * Returns:
 * - An object with the app and a start method.
 *   - app: The Express app.
 *   - start: A method that starts the app by listening on the specified port and logging the port number.
 * 
 * Example Usage:
 * const appConfig = {
 *   config: { port: 3000, mediaRoot: '/public' },
 *   router: myRouter,
 *   logger: myLogger,
 *   auth: myAuth,
 *   sendGrid: mySendGrid
 * };
 * const appInstance = unknown(appConfig);
 * appInstance.start();
 */
module.exports = ({ config, router, logger, auth, sendGrid }) => {
  const app = express()

  app.disable('x-powered-by')
  app.use(router)

  app.use(express.static(config.mediaRoot))

  return {
    app,
    start: () => new Promise((resolve) => {
      const http = app.listen(config.port, () => {
        const { port } = http.address()
        logger.info(`API - Port ${port}`)
      })
    })
  }
}
