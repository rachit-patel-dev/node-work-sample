/**
 * Description: This function provides various CRUD operations for a given model.
 * 
 * Parameters:
 * - model: The model object used for performing database operations.
 * 
 * Returns:
 * - An object containing the following functions:
 *   - getAll: Retrieves all entities from the model.
 *   - create: Creates a new entity in the model.
 *   - update: Updates an existing entity in the model.
 *   - destroy: Deletes an entity from the model.
 *   - findById: Retrieves an entity from the model by its ID.
 *   - findOne: Retrieves the first matching entity from the model based on given conditions.
 *   - countAll: Retrieves the count of entities in the model based on given conditions.
 */
module.exports = ({ model }) => {
  const getAll = (...args) =>
    model.findAll(...args).then((entity) => (entity)
    )
  const countAll = async (...args) => {
    const count = await model.count(...args);
    return count;
  }

  const findOne = (...args) =>
    model.findOne(...args)
      .then(({ dataValues }) => (dataValues))
      .catch((error) => { throw new Error(error) })

  const findById = (...args) =>
    model.findByPk(...args)
      .then(({ dataValues }) => (dataValues))
      .catch((error) => { throw new Error(error) })

  const create = (...args) =>
    model.create(...args).then(({ dataValues }) => (dataValues))

  const update = (...args) =>
    model.update(...args).then(({ dataValues }) => (dataValues))

  const destroy = (...args) =>
    model.destroy(...args)

  return {
    getAll,
    create,
    update,
    destroy,
    findById,
    findOne,
    countAll
  }
}
