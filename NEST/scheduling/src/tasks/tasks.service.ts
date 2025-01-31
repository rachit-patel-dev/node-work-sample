import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval, Timeout } from '@nestjs/schedule';

/**
 * Injectable service for handling tasks.
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  /**
 * Executes a task when the second is 45.
 * This method is called by the cron job.
 * 
 * @returns void
 */
  @Cron('45 * * * * *')
  handleCron() {
    this.logger.debug('Called when the second is 45');
  }

  /**
 * Called every 10 seconds.
 * This method is executed at a regular interval of 10 seconds.
 * 
 * @returns void
 */
  @Interval(10000)
  handleInterval() {
    this.logger.debug('Called every 10 seconds');
  }

  /**
 * Called once after 5 seconds.
 * This method is executed once, with a delay of 5 seconds.
 * 
 * @returns void
 */
  @Timeout(5000)
  handleTimeout() {
    this.logger.debug('Called once after 5 seconds');
  }
}
