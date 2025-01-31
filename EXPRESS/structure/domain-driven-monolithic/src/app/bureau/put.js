/**
 * this file will hold all the get use-case for bureau domain
 */
const { BureauUpdateSerializer } = require('src/domain/bureau')
const { csvToArray } = require('../../infra/utils/csv_to_json_generator')
const { saveFileToBlobStorage } = require('../../infra/azureStorage/azureBlobConfig')
const database = require('../../infra/database')
const Sequelize = require("sequelize");
/**
 * Update a bureau.
 *
 * @param {Object} params - The parameters for the update operation.
 * @param {number} params.ID - The ID of the bureau to update.
 * @param {Object} params.body - The updated data for the bureau.
 * @param {Object} params.SampleFile - The sample file to be updated.
 * @returns {Promise<Object>} - A promise that resolves to an object containing the updated data and a success message, or rejects with an error message.
 *
 * @throws {Error} - If the sample file is not a CSV file.
 * @throws {Error} - If there is an error during the update operation.
 */
module.exports = ({ bureauRepository, serializer, config, sourceFileRepository, sourceFieldRepository, logger }) => {
  const databaseObj = database({ config, logger })
  const users = databaseObj.models.Users

  /**
 * Update function updates the bureau record with the given ID.
 * 
 * @param {Object} params - The parameters for the update function.
 * @param {number} params.ID - The ID of the bureau record to update.
 * @param {Object} params.body - The body of the bureau record to update.
 * @param {Object} params.SampleFile - The sample file to update.
 * @returns {Promise} A promise that resolves to an object containing the updated data and a success message, or rejects with an error message.
 * @throws {Error} Throws an error if the SampleFile is not a CSV file.
 */
  const update = ({ ID, body, SampleFile }) => {
    return new Promise(async (resolve, reject) => {
      const t = await databaseObj.sequelize.transaction();
      try {
        let jsonBody = { ...body }
        const bureau = await serializer.serialize(jsonBody, BureauUpdateSerializer)
        try {
          await bureauRepository.update(bureau,
            {
              where: { ID },
              include: [{ model: users }],
            }, { transaction: t }
          );
          if (bureau.LegalName) {
            const bureauObj = await bureauRepository.findOne({
              where: {
                ID: ID,
              },
              include: [{
                model: users, attributes: ['ID', 'LegalName']
              }],
              attributes: [
                'ID', 'UsersID'
              ],
            }, { transaction: t })
            bureauObj.User.LegalName = bureau.LegalName
            await bureauObj.User.save();
          }
          let data = { ...bureau }
          if (SampleFile) {
            if (SampleFile.originalname.split('.').slice(-1) == 'csv') {
              const sourceFileData = {
                BureausID: ID,
                FileName: config.enableAzure ? `${SampleFile.originalname.split('.')[0]}-${new Date().getTime()}.${SampleFile.originalname.split('.').slice(-1)}` : SampleFile.filename,
                UploadedBy: "BUREAU"
              }
              if (config.enableAzure) {
                const FileUrl = await saveFileToBlobStorage({
                  originalname: sourceFileData.FileName,
                  buffer: SampleFile.buffer,
                  size: SampleFile.size
                })
                if (FileUrl) {
                  sourceFileData.FileName = FileUrl
                }
              }
              data = { ...data, SampleFile: !config.enableAzure ? SampleFile.filename : sourceFileData.FileName }
              let sourceFilQueryset = await sourceFileRepository.getAll({
                where: {
                  UploadedBy: "BUREAU",
                  IsActive: 1,
                  BureausID: ID
                },
                attributes: ['ID', 'FileName', 'BureausID', 'IsActive', 'CreatedAt', 'UpdatedAt']
              }).map(obj => obj.ID);

              // disable all source files
              await databaseObj.models.SourceFiles.update({ IsActive: 0 }, {
                where: {
                  BureausID: ID,
                  IsActive: 1
                }
              }, { transaction: t });

              // disabled all source fields
              await databaseObj.models.SourceFields.update({ IsActive: 0 }, {
                where: {
                  FilesID: { [Sequelize.Op.in]: sourceFilQueryset },
                }
              }, { transaction: t })

              let SampleFileData = config.enableAzure ? await csvToArray(SampleFile.buffer, config.enableAzure) : await csvToArray(sourceFileData.FileName)
              SampleFileData = SampleFileData.map((name, index) => {
                return {
                  SourceFieldName: name,
                  ReferenceNumber: index + 1
                };
              });
              const sourceFile = await sourceFileRepository.create(sourceFileData, { transaction: t })
              await sourceFieldRepository.bulkCreate(SampleFileData, sourceFile.ID, { transaction: t })
            }
            else {
              await t.rollback();
              throw Error(config.messages.error.editBureau)
            }
          }
          const message = config.messages.success.editBureau;
          await t.commit(); // commit the transaction
          resolve({ data, message })
        } catch (err) {
          logger.error(err.message)
          const data = {}
          const error = config.messages.error.editBureau
          await t.rollback();
          reject({ data, error })
        }
      } catch (err) {
        logger.error(err.message)
        const data = {}
        const error = config.messages.error.editBureau
        await t.rollback();
        reject({ data, error })
      }
    })
  }

  return {
    update
  }
}
