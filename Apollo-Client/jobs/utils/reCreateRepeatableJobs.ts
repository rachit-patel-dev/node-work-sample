/*external modules*/
import _ from 'lodash';
import * as Sentry from '@sentry/node';
/*other*/
import { logger } from '../../logger';
import jobWorker, { QueueNameList } from '..';

/**
 * Re-creates repeatable jobs for the specified queue.
 * 
 * @param {QueueNameList} queueName - The name of the queue.
 * @returns {Promise<void>} - A promise that resolves when the repeatable jobs have been re-created.
 * @throws {Error} - If an error occurs while re-creating the repeatable jobs.
 */
export async function reCreateRepeatableJobs(queueName: QueueNameList) {
  const readableQueueName = queueName
    .split('-')
    .map(k => _.capitalize(k))
    .join(' ');

  try {
    const queue = jobWorker.getQueue(queueName);

    const jobsToBeRemoved = await queue.getRepeatableJobs();
    if (jobsToBeRemoved.length) {
      await Promise.all(_.map(jobsToBeRemoved, job => queue.removeRepeatableByKey(job.key)));

      logger.info(`"${readableQueueName}" old jobs removed.\n`, _.map(jobsToBeRemoved, 'key').join('\n'));
    }

    await queue.add({});
    logger.info(`"${readableQueueName}" started.`);
  } catch (error) {
    logger.error(error);

    // Send error to Sentry
    Sentry.withScope(scope => {
      scope.setExtras({ queue: queueName });
      Sentry.captureException(error);
    });
  }
}
