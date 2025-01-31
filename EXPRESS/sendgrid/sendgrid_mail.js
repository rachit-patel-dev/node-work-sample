const sgMail = require('@sendgrid/mail');
/**
 * Sends an email using SendGrid.
 *
 * @param {Object} msg - The message object containing email details.
 * @param {string} msg.to - The recipient's email address.
 * @param {string} msg.subject - The subject of the email.
 * @param {string} msg.text - The plain text content of the email.
 * @param {string} msg.html - The HTML content of the email.
 * @param {string} msg.from - The sender's email address.
 * @param {string} msg.templateId - The template ID for the email.
 * @returns {Promise} A promise that resolves when the email is sent successfully, or rejects with an error.
 */
module.exports = ({ config, logger }) => ({
    sendMail: (msg) => {
        msg.from = config.sendGridSenderID
        msg.templateId = config.sendGridOtpTemplate
        msg.from = config.sendGridSenderID
        sgMail.setApiKey(config.sendGridApiKey)
        if (config.enableSendGrid) {
            sgMail
                .send(msg)
                .then(() => {
                    logger.info(`Mail sent successfully for otp to ${msg.to}`)
                })
                .catch(error => {
                    logger.info(error)
                });
        } else {
            logger.info(msg)
        }

    }
})