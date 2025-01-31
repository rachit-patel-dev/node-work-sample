# SendMailService

The `sendMailService` module exports a function that initializes an email sending service using the SendGrid API.

## Usage Example

```javascript
const sendMailService = require('./sendMailService');

// Configuration settings
const config = {
  sendGridSenderID: 'sender@example.com',
  sendGridOtpTemplate: 'templateId',
  sendGridApiKey: 'API_KEY',
  enableSendGrid: true
};

// Logger object
const logger = {
  info: console.log,
  error: console.error
};

// Create an instance of the mail service
const mailService = sendMailService({ config, logger });

// Email details
const msg = {
  to: 'recipient@example.com',
  subject: 'Test Email',
  text: 'This is a test email'
};

// Send email using the configured service
mailService.sendMail(msg);
```

In this example, the `sendMailService` module is utilized to create an instance of the email service. The service is configured with the provided settings and logger object. The `msg` object is then defined with the necessary email details, and the `sendMail` method is called on the `mailService` instance.

If `enableSendGrid` is set to `true` in the configuration, the email will be sent using the SendGrid API. Otherwise, the `msg` object will be logged to the console.

## Service Structure

The service consists of a single method:

### `sendMail(msg: object): void`
- Modifies the `msg` object by adding the 'from' and 'templateId' properties from the 'config' object.
- Sets the SendGrid API key using the 'sendGridApiKey' from the 'config' object.
- If 'enableSendGrid' is `true` in the 'config' object, sends the email using the SendGrid API and logs a success message.
- If 'enableSendGrid' is `false` in the 'config' object, logs the 'msg' object instead.
- Logs any errors that occur during the email sending process.

No outputs are returned from the `sendMail` method.