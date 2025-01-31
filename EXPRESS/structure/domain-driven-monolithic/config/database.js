const path = require('path')
const dotEnvPath = path.resolve('.env')

/**
 * since mocha don't see enviroment variables we have to use dotenv
 */
require('dotenv').config({ path: dotEnvPath })

module.exports = {
  development: {
    'dialect': process.env.DIALAECT,
    'database': process.env.DB_NAME,
    'host': process.env.DB_HOST,
    'password': process.env.DB_PASSWORD,
    'username': process.env.DB_USER,
    'port': process.env.DB_PORT,
  },
  test: {
    'dialect': process.env.DIALAECT,
    'database': process.env.TEST_DB,
    'host': process.env.DB_HOST,
    'password': process.env.DB_PASSWORD,
    'username': process.env.DB_USER,
    'port': process.env.DB_PORT,
    logging: false // remove logs
  },
  staging: {
    'dialect': process.env.DIALAECT,
    'ssl': true,
    'dialectOptions': {
      'ssl': {
        'require': true
      }
    }
  },
  production: {
    'dialect': process.env.DIALAECT,
    'ssl': true,
    'dialectOptions': {
      'ssl': {
        'require': true
      }
    }
  }
}
