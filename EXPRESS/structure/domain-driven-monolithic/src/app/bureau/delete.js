const database = require('../../infra/database')

/**
 * Removes a bureau from the database.
 * 
 * @param {Object} bureauRepository - The repository for bureau data.
 * @param {Object} config - The configuration object.
 * @param {Object} logger - The logger object.
 * @param {string} ID - The ID of the bureau to be removed.
 * @returns {Promise} A promise that resolves to an object with data and message properties on success, or rejects with an object containing data and error properties on failure.
 */
module.exports = ({ bureauRepository, config, logger }) => {

  const databaseObj = database({ config, logger })
  const users = databaseObj.models.Users
  const remove = ({ ID }) => {
    return new Promise(async (resolve, reject) => {
      const t = await databaseObj.sequelize.transaction();
      try {
        const bureauObj = await bureauRepository.findOne({
          where: {
            ID: ID,
          },
          include: [{
            model: users, attributes: ['ID', 'LegalName', 'IsActive']
          }],
          attributes: [
            'ID', 'UsersID', 'IsActive'
          ],
        }, { transaction: t })
        bureauObj.User.IsActive = 0
        bureauObj.IsActive = 0
        await bureauRepository.update({
          IsActive: 0
        }, {
          where: { ID }
        }, { transaction: t })
        await bureauObj.User.save({ transaction: t });
        resolve({ data: {}, message: config.messages.success.bureauDelete })
      } catch (err) {
        await t.rollback();
        logger.error(err.message)
        const error = config.messages.error.bureauDelete
        reject({ data: {}, error })
      }
    })
  }

  return {
    remove
  }
}
