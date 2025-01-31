const Status = require('http-status')
/**
 * Middleware to check if authentication is valid.
 *
 * @param {Object} config - The configuration object.
 * @param {Object} repository - The repository object.
 * @param {Object} userRepository - The user repository object.
 * @param {Object} jwt - The jwt object.
 * @param {Object} response - The response object.
 * @param {Function} Fail - The Fail function.
 * @returns {Object} - An object containing the middleware functions.
 */
module.exports = ({ config, repository: { userRepository }, jwt, response: { Fail } }) => {
  const tokenAuthenticate = (req, res, next) => {
    let decodedEmail
    try {
      const token = req.headers['authorization']
      const decode = jwt.decode()
      const verify = jwt.verify()
      const decodedTokenData = decode(token)
      if (!decodedTokenData) {
        res.status(Status.UNAUTHORIZED).json(
          Fail({}, 'Invalid token'))
      }
      verify(token)
      decodedEmail = decodedTokenData.Email
      const currentTime = Math.round(Date.now() / 1000);
      if (currentTime > decodedTokenData.exp) {
        const error = new Error('Token expired');
        throw error;
      }
      userRepository.findOne({
        attributes: [
          'ID', 'Email', 'LegalName', 'Type'
        ],
        where: {
          Email: decodedEmail,
          IsActive: 1
        }
      }).then(data => {
        req.user = decodedTokenData
        next()
      }).catch(error => {
        res.status(Status.UNAUTHORIZED).json(
          Fail({}, error))
      })
    } catch (err) {
      res.status(Status.UNAUTHORIZED).json(
        Fail({}, 'Invalid token'))
    }
  }

  const isBureauAuthenticate = (req, res, next) => {
    if (req.user.Type === 'BUREAU') {
      next()
    } else {
      res.status(Status.UNAUTHORIZED).json(
        Fail({}, 'You are not BUREAU user.'))
    }
  }

  const isAdminAuthenticate = (req, res, next) => {
    if (req.user.Type === 'ADMIN') {
      next()
    } else {
      res.status(Status.UNAUTHORIZED).json(
        Fail({}, 'You are not Admin user.'))
    }
  }
  return { tokenAuthenticate, isBureauAuthenticate, isAdminAuthenticate }
}