const swaggerJSDoc = require('swagger-jsdoc')
const swaggerUi = require("swagger-ui-express");
const Status = require('http-status')
const { Router } = require('express')

/**
 * Returns a router for the test API.
 *
 * @returns {Router} The router for the test API.
 */
module.exports = () => {
  const router = Router()

  const swaggerDefinition = {
    info: {
      title: 'test API',
      version: '1.0.0',
      description: 'Available REST Endpoints of test RESTful API'
    },
    // host: `${process.env.API_SWAGGER}:${process.env.PORT}/api/${process.env.APP_VERSION}`,
    host: `http://localhost:3000/api/v1`,

    basePath: '/',
    securityDefinitions: {
      JWT: {
        description: '',
        type: 'apiKey',
        name: 'Authorization',
        in: 'header'
      }
    }
  }

  const options = {
    swaggerDefinition: swaggerDefinition,
    apis: ['src/interfaces/http/modules/**/*.js']
  }

  // initialize swagger-jsdoc
  const swaggerSpec = swaggerJSDoc(options)
  /**
   * @swagger
   * responses:
   *   Unauthorized:
   *     description: Unauthorized
   *   BadRequest:
   *     description: BadRequest / Invalid Input
   */

  /**
   * @swagger
   * /:
   *   get:
   *     tags:
   *       - Status
   *     description: Returns API status
   *     produces:
   *       - application/json
   *     responses:
   *       200:
   *         description: API Status
   */
  router.get('/', (req, res) => {
    res.status(Status.OK).json({ status: 'API working' })
  })

  router.get('/swagger.json', (req, res) => {
    res.status(Status.OK).json(swaggerSpec)
  })
  const specs = swaggerJSDoc(options);
  router.use("/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(specs))

  return router
}
