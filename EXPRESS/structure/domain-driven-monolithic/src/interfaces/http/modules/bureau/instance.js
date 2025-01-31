
const container = require('src/container') // we have to get the DI
const { get, post, put, remove } = require('src/app/bureau')
const serializer = container.resolve('serializer');
const { uploader } = require('../../../../infra/storage/storage')

module.exports = () => {
  const { repository: {
    bureauRepository, userRepository, sourceFileRepository, sourceFieldRepository
  }, config, logger, sendGrid } = container.cradle

  const getUseCase = get({ bureauRepository, sourceFileRepository, config, logger })
  const postUseCase = post({ bureauRepository, userRepository, sourceFileRepository, sourceFieldRepository, config, logger, sendGrid, serializer })
  const putUseCase = put({ bureauRepository, sourceFileRepository, sourceFieldRepository, serializer, config, logger })
  const deleteUseCase = remove({ bureauRepository, serializer, config, logger })

  return {
    getUseCase,
    postUseCase,
    putUseCase,
    deleteUseCase,
    uploader,
    config,
  }
}
