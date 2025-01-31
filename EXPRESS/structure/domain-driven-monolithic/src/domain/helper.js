
const { complement, compose, isNil, pickBy } = require('ramda')

const notNull = compose(complement(isNil))

const cleanData = (entity) => pickBy(notNull, entity)

module.exports = {
  cleanData
}
