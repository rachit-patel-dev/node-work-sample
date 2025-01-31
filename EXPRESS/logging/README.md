## Logger Creation Module

This module exports a function for creating a logger using the Winston library. The function takes a configuration object as input and returns a Winston logger object.

### Input
- **config (Object):** The configuration object containing the logging configuration and environment.

### Flow
1. **Check Directory Existence:**
   - Check if the logs directory exists.
   - If not, create it using `fs.mkdirSync`.

2. **Create Winston Logger:**
   - Create a new Winston logger using `winston.createLogger`.

3. **Configure Logger:**
   - Configure the logger with two transports:
     - **Console Transport:**
       - Logs messages to the console.
     - **File Transport:**
       - Logs messages to a file in the logs directory.
       - The filename is based on the environment specified in the configuration object.

### Output
- The Winston logger object.

### Usage Example
```javascript
const logger = require('./logger')({
  config: {
    logging: { level: 'info' },
    env: 'development'
  }
})

logger.info('This is an info message')
logger.error('This is an error message')
```