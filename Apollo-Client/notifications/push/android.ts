import { getAccessToken } from '../../auth/oauth/googleCloud';
import { config } from '../../config';
import { makeRequest } from '../../http/client';
import * as bodyParser from '../../http/middleware/bodyParser';
import { Mime } from '../../utils/mime';
import { PushNotificationProvider, PushNotificationError } from './';

const API_URL = `https://fcm.googleapis.com/v1/projects/${config.googleCloud.projectId}/messages:send`;

export const fcmProvider: PushNotificationProvider = async data => {
  const { notification, deviceToken, opts } = data;

  const authToken = await getAccessToken();

  // https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages/send#request-body
  const body = {
    validate_only: false,
    // https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages#resource:-message
    message: {
      name: 'notifications',
      token: deviceToken,
      notification: {
        title: notification.title,
        body: notification.body,
        image: 'fileUrl' in opts ? opts.fileUrl : undefined
      },
      // https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages#AndroidConfig
      android: {
        // https://firebase.google.com/docs/cloud-messaging/concept-options#setting-the-priority-of-a-message
        priority: 'HIGH',
        // https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages#AndroidNotification
        notification: {
          sound: 'default',
          channel_id: 'general'
        }
      },
      data: opts
    }
  };

  const res = await makeRequest(API_URL, {
    method: 'POST',
    headers: {
      'content-type': Mime.JSON,
      accept: Mime.JSON,
      authorization: `${authToken.tokenType} ${authToken.accessToken}`
    },
    body: JSON.stringify(body)
  });

  if ((res.statusCode || 500) >= 300) {
    const resError = await bodyParser.json<{ error: { status: string } }>(res);
    throw new PushNotificationError(resError.error.status);
  }
};
