import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';

/**
 * AudioProcessor class is responsible for processing audio jobs using the Bull queue.
 *
 * @remarks
 * This class is decorated with the `@Processor` decorator from the `@nestjs/bull` package.
 * It handles audio jobs with the `transcode` process.
 *
 * @example
 * ```typescript
 * @Processor('audio')
 * export class AudioProcessor {
 *   private readonly logger = new Logger(AudioProcessor.name);
 *
 *   @Process('transcode')
 *   handleTranscode(job: Job) {
 *     this.logger.debug('Start transcoding...');
 *     this.logger.debug(job.data);
 *     this.logger.debug('Transcoding completed');
 *   }
 * }
 * ```
 *
 * @publicApi
 */
@Processor('audio')
export class AudioProcessor {
  private readonly logger = new Logger(AudioProcessor.name);

  /**
 * Handles the transcoding of audio files.
 * 
 * @param job - The job object containing the data to be transcoded.
 * @returns void
 */
  @Process('transcode')
  handleTranscode(job: Job) {
    this.logger.debug('Start transcoding...');
    this.logger.debug(job.data);
    this.logger.debug('Transcoding completed');
  }
}
