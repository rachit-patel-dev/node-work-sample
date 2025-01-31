# Serializer Class

The `Serializer` class provides methods for validating and serializing data based on specified fields.

## Methods

### `objectValidate(type: object, value: any): boolean`
- Checks if the `value` is of the specified `type`.
- Returns `true` if the value is valid or if the object type is valid; otherwise, returns `false`.

### `validate(field: object, fieldValue: any): boolean`
- Validates a single field value against the specified validation rules.
- Throws an error if the value is `null`, not of the specified `type`, does not match the regex pattern (if specified), or does not meet the minimum or maximum length requirements (if specified).
- Returns `true` if the validation passes; otherwise, returns `false`.

### `serializeData(data: object, fields: Array): object`
- Serializes the input data object by iterating over the specified fields.
- Throws an error if a required field is missing and validates each field value using the `validate` method.
- Returns the serialized data object.

### `serialize(data: object | Array, fields: Array): object | Array`
- Serializes the input data object into a new object with only the specified fields.
- If the input data is an array, iterates over each element and calls the `serializeData` method.
- Returns the serialized data as an object or an array of objects.

## Usage Example

```javascript
const Serializer = require('Serializer');
const serializer = new Serializer();

// Example for objectValidate method
const type = ['string', 'number'];
const value = 'test';
const isValid = serializer.objectValidate(type, value);
// isValid = true

// Example for validate method
const field = {
  name: 'username',
  type: 'string',
  minLength: 5,
  maxLength: 10
};
const fieldValue = 'john';
const isFieldValid = serializer.validate(field, fieldValue);
// isFieldValid = true

// Example for serialize method
const data = {
  username: 'john',
  age: 25
};
const fields = [
  {
    name: 'username',
    type: 'string',
    minLength: 5,
    maxLength: 10,
    required: true
  },
  {
    name: 'age',
    type: 'number'
  }
];
const serializedData = serializer.serialize(data, fields);
// serializedData = { username: 'john', age: 25 }
```

This class provides a versatile set of methods for validating and serializing data, making it a valuable tool for handling diverse data structures.