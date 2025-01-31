class Serializer {
  /**
   * Validates the object type
   *
   * @param {object} type - The type of object to be validated
   * @param {any} value - The value to be validated against the type
   * @returns {boolean} - True if the value is of the specified type, otherwise False
   */

  objectValidate(type, value) {
    return type.length
      ? true
      : Object.values(type).includes(value)
        ? true
        : false;
  }

  /**
   * Validates a single field value against the field's specified validation rules
   *
   * @param {object} field - The field object containing the validation rules
   * @param {any} value - The value to be validated
   * @returns {boolean} - True if the value is valid, otherwise throws an error
   */

  async validate(field, value) {
    if (value === null) {
      throw new Error(`Value for ${field.name} should not be null`);
    }
    if (
      field.type &&
      (typeof field.type == "object"
        ? !this.objectValidate(field.type, value)
        : typeof value !== field.type)
    ) {
      throw new Error(
        `${field.name} should be of type: ${typeof field.type == "object" ? Object.values(field.type) : field.type
        }`
      );
    }
    if (field.regex && typeof value === "string" && !value.match(field.regex)) {
      throw new Error(`${field.name} value does not match the regex pattern: ${field.regex}`);
    }
    if (
      field.hasOwnProperty("minLength") &&
      (typeof value === "string" ? value.length : value) < field.minLength
    ) {
      throw new Error(
        `Minimum length of ${field.name} should be greater than ${field.minLength}`
      );
    }
    if (
      field.hasOwnProperty("maxLength") &&
      (typeof value === "string" ? value.length : value) > field.maxLength
    ) {
      throw new Error(
        `Maximum length of ${field.name} should be less than ${field.maxLength}`
      );
    }

    return true;
  }

  /**
 * Serializes the input data object into a new object with only the specified fields
 *
 * @param {object} data - The input data object to be serialized
 * @param {Array<object>} fields - The fields to include in the serialized data
 * @returns {object} - The serialized data object
 */
  async serializeData(data, fields) {
    const serializedData = {};
    for (const field of fields) {
      if (!data.hasOwnProperty(field.name)) {
        if (field.required) {
          throw new Error(`Missing required field: ${field.name}`);
        }
        continue;
      }
      await this.validate(field, data[field.name]);
      serializedData[field.name] = data[field.name];
    }
    return serializedData;
  }
  /**
   * Serializes the input data object into a new object with only the specified fields
   *
   * @param {object} data - The input data object to be serialized
   * @param {Array<object>} fields - The fields to include in the serialized data
   * @returns {object} - The serialized data object
   */

  async serialize(data, fields) {
    if (Array.isArray(data)) {
      let serializedDataArray = []
      data.forEach((result) => {
        serializedDataArray.push(this.serializeData(result, fields))
      })
      return await Promise.all(serializedDataArray);
    } else {
      return this.serializeData(data, fields);
    }
  }
}

module.exports = Serializer;
