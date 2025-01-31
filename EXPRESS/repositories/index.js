const Bureau = require('./bureau')
/**
 * 
 * Description:
 * This function exports an object that contains a property named 'bureauRepository'.
 * The 'bureauRepository' property is assigned the result of calling the 'Bureau' function with the 'bureauModel' as an argument.
 * 
 * Parameters:
 * - sendGrid: The sendGrid object.
 * - config: The config object.
 * - logger: The logger object.
 * 
 * Returns:
 * An object with a 'bureauRepository' property.
 */
module.exports = ({ sendGrid, config, logger }) => {
  const bureauModel = models.Bureaus
  
  return {
    bureauRepository: Bureau({ model: bureauModel }),
  }
}