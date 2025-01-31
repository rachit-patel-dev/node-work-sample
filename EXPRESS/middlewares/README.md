## Express.js Error Handling Middleware

This middleware function is designed to handle errors in an Express.js application. It logs the error message, creates a response object with an error type, and sends a JSON response with a 500 status code.

### Inputs
- **err:** The error object that was thrown.
- **req:** The request object.
- **res:** The response object.
- **next:** The next middleware function.
- **logger:** The logger object used for logging.
- **config:** The configuration object.

### Flow
1. **Log Error Message:**
   - Log the error message using the provided logger object.

2. **Create Response Object:**
   - Create a response object with a default error type of 'InternalServerError'.

3. **Add Error Details (Development Environment Only):**
   - If the environment is set to 'development', add the error message and stack trace to the response object.

4. **Send JSON Response:**
   - Send the response object as a JSON response with a 500 status code.

### Outputs
- The function does not return any value.

### Usage Example
```javascript
const express = require('express')
const app = express()
const Status = require('http-status')

// Middleware function
const errorHandler = (err, req, res, next, logger, config) => {
  logger.error(err.message)

  const response = Object.assign({
    type: 'InternalServerError'
  }, config.env === 'development' && {
    message: err.message,
    stack: err.stack
  })

  res.status(Status.INTERNAL_SERVER_ERROR).json(response)
}

// Register middleware
app.use(errorHandler)

// Start the server
app.listen(3000, () => {
  console.log('Server is running on port 3000')
})
```