const { createContainer, asClass, asValue, asFunction } = require('awilix')

const app = require('./app')
const server = require('./interfaces/http/server')
const router = require('./interfaces/http/router')
const auth = require('./interfaces/http/auth')
const config = require('../config')
const logger = require('./infra/logging/logger')
const jwt = require('./infra/jwt')
const sendGrid = require('./infra/sendgrid/sendgrid_mail')
const Serializer = require('./infra/serializer/serializer')
const response = require('./infra/support/response')
const date = require('./infra/support/date')
const repository = require('./infra/repositories')
const container = createContainer()

container
  .register({
    app: asFunction(app).singleton(),
    server: asFunction(server).singleton(),
    router: asFunction(router).singleton(),
    logger: asFunction(logger).singleton(),
    auth: asFunction(auth).singleton(),
    jwt: asFunction(jwt).singleton(),
    sendGrid: asFunction(sendGrid).singleton(),
    response: asFunction(response).singleton(),
    date: asFunction(date).singleton(),
    config: asValue(config),
    repository: asFunction(repository).singleton(),
    serializer: asClass(Serializer).singleton(),
  })

module.exports = container
