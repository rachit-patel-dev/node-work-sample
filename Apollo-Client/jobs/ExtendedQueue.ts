/*external modules*/
import _ from 'lodash';
import Queue, { JobId, JobOptions } from 'bull';
/*DB*/
import { getClient, sql } from '../db';
import { JobStatus } from '../db/types/job';
/*models*/
import { JobModel } from '../db/models/JobModel';
/*GQL*/

/*other*/

export type ExtendedQueueOptions = Queue.QueueOptions & {
  syncJobStatus?: boolean;
};

/**
 * Represents an extended queue that inherits from the Queue class.
 * This class adds additional functionality to the base Queue class.
 *
 * @template T - The type of data that the queue will handle.
 */
export default class ExtendedQueue<T = any> extends Queue<T> {
  readonly syncJobStatus: boolean = false;
  readonly defaultJobOptions: JobOptions = {};

  constructor(queueName: string, opts?: ExtendedQueueOptions);
  constructor(queueName: string, url: string, opts?: ExtendedQueueOptions);
  constructor(param1: string, param2: any, param3?: ExtendedQueueOptions) {
    super(param1, param2, param3);
    if (typeof param2 !== 'string') {
      param3 = param2;
    }

    if (param3) {
      this.defaultJobOptions = param3.defaultJobOptions || {};
      if (!_.isUndefined(param3.syncJobStatus)) {
        this.syncJobStatus = param3.syncJobStatus;
      }
    }

    if (this.syncJobStatus) {
      this.on('waiting', async jobId =>
        this.changeJobStatus(jobId, JobStatus.Waiting)
      );
      this.on('active', async job =>
        this.changeJobStatus(job.id, JobStatus.Active)
      );
      this.on('completed', async job => {
        let nextJob;
        if (job.opts.repeat) {
          nextJob = await this.nextRepeatableJob(job.name, job.data, job.opts);
        }

        if (!nextJob) {
          return this.changeJobStatus(job.id, JobStatus.Completed);
        }

        return this.setNextJob(job.id, nextJob.id);
      });
      this.on('failed', async job =>
        this.changeJobStatus(job.id, JobStatus.Failed)
      );
    }
  }

  /**
 * Updates the status of a job in the database.
 * 
 * @param jobId - The ID of the job to update.
 * @param status - The new status of the job.
 * @returns A promise that resolves when the job status is updated.
 */
  private async changeJobStatus(jobId: JobId, status: JobStatus) {
    return getClient(client => {
      const jobData: JobModel.update.TArgs = {
        id: jobId as string,
        status: status
      };

      return JobModel.update.exec(client, jobData, { sql, events: [] });
    });
  }

  /**
 * Updates the status of a job in the database.
 * 
 * @param jobId - The ID of the job to update.
 * @param nextJobId - The ID of the next job to set.
 * @returns A promise that resolves when the job status is updated.
 */
  private async setNextJob(jobId: JobId, nextJobId: JobId) {
    return getClient(client => {
      const jobData: JobModel.update.TArgs = {
        id: jobId as string,
        status: JobStatus.Waiting,
        externalId: nextJobId as string
      };

      return JobModel.update.exec(client, jobData, { sql, events: [] });
    });
  }
}
