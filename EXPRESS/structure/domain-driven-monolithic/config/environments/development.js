const { messages } = require('../messages')

module.exports = {
  version: process.env.APP_VERSION,
  port: process.env.PORT || 5000,
  timezone: process.env.TIMEZONE,
  logging: {
    maxsize: 100 * 1024, // 100mb
    maxFiles: 2,
    colorize: false
  },
  authSecret: process.env.SECRET,
  expirationTime: process.env.TOKEN_EXPIRATION_TIME,
  authSession: {
    session: false
  },
  sendGridApiKey: process.env.SENDGRID_API_KEY,
  sendGridSenderID: process.env.SENDER_ID,
  sendGridOtpTemplate: process.env.SENDGRID_SEND_OTP,
  enableSendGrid: JSON.parse(process.env.ENABLE_SENDGRID),
  clientHost: process.env.CLIENT_HOST,
  passwordResetExpirationTime: parseInt(process.env.PASSWORD_RESET_EXPIRATION_TIME),
  passwordChangeUseCase: process.env.PASSWORD_CHANGE_USE_CASE,
  serverHost: process.env.SERVER_HOST,
  mediaRoot: process.env.MEDIA_ROOT,
  csvPath: process.env.CSV_PATH,
  pageSize: parseInt(process.env.PAGE_SIZE),
  messages: messages,
  enableAzure: JSON.parse(process.env.ENABLE_AZURE_BLOB),
  emailRegex: /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/,
  passwordRegex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,20}$/,
  phoneNumberRegex: /^(\+?\d{1,4}[-\.\s]?\(?\d{1,4}\)?[-\.\s]?\d{1,4}[-\.\s]?\d{1,4}[-\.\s]?\d{1,4}|\(\d{3}\)[-]?\d{3}[-]?\d{4})$/,
  employerFileName: process.env.EMPLOYER_FILE_NAME
}
