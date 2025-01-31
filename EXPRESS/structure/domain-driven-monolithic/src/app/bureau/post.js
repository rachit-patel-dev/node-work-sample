const { BureauCreateSerializer, BureauStatusChangeSerializer } = require('src/domain/bureau')
const jwt = require('jsonwebtoken')
const database = require('../../infra/database')
const { csvToArray } = require('../../infra/utils/csv_to_json_generator')
const { generateRandomString } = require('src/infra/utils/random_string_generator')()
const { saveFileToBlobStorage } = require('../../infra/azureStorage/azureBlobConfig')
/**
 * Performs a status change for a bureau.
 *
 * @param {Object} options - The options for the status change.
 * @param {Object} options.body - The body of the status change request.
 * @param {string} options.id - The ID of the bureau to be updated.
 * @returns {Promise<Object>} A promise that resolves to an object with the updated data and a success message, or rejects with an error message.
 *
 * @throws {Error} If there is an error during the status change process.
 */
module.exports = ({ bureauRepository, userRepository, sourceFileRepository, sourceFieldRepository, config, logger, sendGrid, serializer }) => {
  const databaseObj = database({ config, logger })

  const users = databaseObj.models.Users

  /**
 * Performs a status change for a bureau.
 *
 * @param {Object} options - The options for the status change.
 * @param {Object} options.body - The body of the status change request.
 * @param {string} options.id - The ID of the bureau to be updated.
 * @returns {Promise<Object>} A promise that resolves to an object with the updated data and a success message, or rejects with an error message.
 *
 * @throws {Error} If there is an error during the status change process.
 */
  const statusChange = ({ body, id }) => {
    return new Promise(async (resolve, reject) => {
      try {
        const statusChangeData = await serializer.serialize(body, BureauStatusChangeSerializer)
        const ID = id
        try {
          await bureauRepository.update(statusChangeData, {
            where: { ID }
          })
          resolve({ data: {}, message: config.messages.success.bureauStatusChange })
        } catch (err) {
          logger.error(err.message)
          reject({ data: {}, error: config.messages.error.bureauStatusChange })
        }
      } catch (err) {
        logger.error(err.message)
        const data = {}
        const error = err.message
        reject({ data, error })
      }
    })
  }

  return {
    statusChange,
  }
}