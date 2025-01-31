/*external modules*/
import { Job } from 'bull';
/*other*/
import * as senders from './senders';
import jobWorker from '../jobs';

/**
 * Sends a notification using the specified sender.
 * 
 * @param senderName - The name of the sender to use for sending the notification.
 * @param options - The options for the notification.
 * @returns A Promise that resolves to a Job representing the notification task.
 */
export async function sendNotification<TSenderName extends keyof typeof senders>(
  senderName: TSenderName,
  options: TFunction.Arg0<typeof senders[TSenderName]>
): Promise<Job> {
  const job = await jobWorker.getQueue('send-notification').add({
    sender: senderName,
    options
  });

  return job;
}
