const jwt = require('jsonwebtoken')
const {
  compose,
  trim,
  replace,
  partialRight
} = require('ramda')

module.exports = ({ config, logger }) => ({
  /**
 * Generates a new token for the user.
 *
 * @param {Object} options - The options for generating the token.
 * @param {Object} payload - The payload to be signed.
 * @returns {string} The generated token.
 */
  signin: (options) => (payload) => {
    const opt = Object.assign({}, options, { expiresIn: config.expirationTime })
    logger.info(`User ${payload.email} generated a new token`)
    return jwt.sign(payload, config.authSecret, opt)
  },
  /**
 * Verifies the authenticity of a token.
 *
 * @param {Object} options - The options for verifying the token.
 * @param {string} token - The token to be verified.
 * @returns {Object} The decoded token if it is valid.
 * @throws {Error} If the token is invalid or expired.
 */
  verify: (options) => (token) => {
    const cleanedToken = token.replace(/JWT|jwt/g, '').replace(' ', '')
    return jwt.verify(cleanedToken, config.authSecret)
  },
  /**
 * Function: decode
 * 
 * Description:
 * This function decodes a JWT token using the provided options.
 * 
 * Parameters:
 * - options: An object containing options for decoding the token.
 * 
 * Returns:
 * A decoded token.
 */
  decode: (options) => (token) => {
    const opt = Object.assign({}, { expiresIn: config.expirationTime })
    const decodeToken = compose(
      partialRight(jwt.decode, [opt]),
      trim,
      replace(/JWT|jwt/g, '')
    )

    return decodeToken(token)
  }
})
