/*external modules*/
import apn from 'apn';
/*other*/
import { PushNotificationProvider } from './';
import { config } from '../../config';
import { logger as appLogger } from '../../logger';


const logger = appLogger.child({ component: 'APNS client' });
const apnProvider = new apn.Provider({
  token: {
    key: config.secrets.pushNotificationsAppleSecret,
    keyId: config.pushNotifications.appleKeyId,
    teamId: config.pushNotifications.appleTeamId
  },
  production: ['stagging-com', 'xyz-com'].includes(config.name)
});

/**
 * Sends a push notification to an iOS device using the APNS (Apple Push Notification Service) provider.
 * 
 * @param data - The data required to send the push notification.
 * @param data.deviceToken - The device token of the iOS device.
 * @param data.notification - The content of the push notification.
 * @param data.opts - The options for the push notification.
 * @returns A promise that resolves when the push notification is sent successfully.
 * @throws An error if the push notification fails to send.
 */
export const apnsProvider: PushNotificationProvider = async data => {
  const notification = new apn.Notification(data.opts);

  notification.aps = {
    alert: data.notification,
    sound: 'default'
  };
  notification.topic = BUNDLE_ID;

  const result = await apnProvider.send(notification, data.deviceToken);
  if (result.failed.length) {
    result.failed.forEach(failRequest => {
      logger.error(failRequest, 'Failed send Apple push notification');
    });
  }
};
