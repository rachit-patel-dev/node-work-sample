/*external modules*/
import { Job } from 'bull';
/*other*/
import * as senders from './senders';
import jobWorker from '../jobs';

/**
 * Sends a notification using the specified sender.
 *
 * @param senderName - The name of the sender to use.
 * @param options - The options for the sender.
 * @returns A Promise that resolves to the job representing the notification.
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
