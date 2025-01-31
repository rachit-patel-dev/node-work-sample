// Initialize
const chai = require('chai');
const request = require('supertest')
const dirtyChai = require('dirty-chai');
const chaiChange = require('chai-change');
const container = require('src/container')
const server = container.resolve('server')
const config = container.resolve('config')
const logger = container.resolve('logger')
const database = container.resolve('database')
const dbHandler = require('./support/dbHandler')
const mockUser = require('./support/mocking')
const { expect, assert } = require('chai');

logger.transports.forEach((t) => (t.silent = true))
chai.use(dirtyChai);
chai.use(chaiChange);
global.app = container
global.request = request(server.app)
global.config = config
global.dbReset = dbHandler(database).resetDb
global.mocking = mockUser(container, config)
global.expect = expect
global.assert = assert
global.BASE_URI = `/api/${config.version}`