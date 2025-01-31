## JWT Utility Functions

This code snippet exports an object with three methods for working with JSON Web Tokens (JWTs). These methods are utilized for generating, verifying, and decoding JWTs.

### Methods

#### `signin(options)(payload)`

Generates a new JWT by signing the provided payload using the specified options. Returns the generated token as a string.

#### `verify(options)(token)`

Verifies the authenticity of a JWT by removing unwanted characters and using the specified options. Returns the decoded token as an object if it is valid.

#### `decode(options)(token)`

Decodes a JWT by removing unwanted characters and using the specified options. Returns the decoded token as an object.

### Usage Example

```javascript
const jwtUtils = require('./jwtUtils')

const config = {
  authSecret: 'mySecretKey',
  expirationTime: '1h'
}

const logger = {
  info: (message) => {
    console.log(message)
  }
}

const jwt = jwtUtils({ config, logger })

const options = { algorithm: 'HS256' }
const payload = { email: 'example@example.com' }

const token = jwt.signin(options)(payload)
console.log(token)
// Output: Generated token

const verifiedToken = jwt.verify(options)(token)
console.log(verifiedToken)
// Output: Decoded token if valid

const decodedToken = jwt.decode(options)(token)
console.log(decodedToken)
// Output: Decoded token
```