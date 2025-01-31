import { InjectQueue } from '@nestjs/bull';
import { Controller, Post } from '@nestjs/common';
import { Queue } from 'bull';

/**
 * Controller for handling audio-related operations.
 *
 * @remarks
 * This controller is responsible for handling audio transcoding operations.
 *
 * @example
 * ```typescript
 * const audioController = new AudioController();
 * audioController.transcode();
 * ```
 */
@Controller('audio')
export class AudioController {
  constructor(@InjectQueue('audio') private readonly audioQueue: Queue) {}

  /**
 * Transcodes the audio file.
 * 
 * This method adds a transcode job to the audio queue, which will process the specified audio file and convert it to a different format.
 * 
 * @returns {Promise<void>} A promise that resolves when the transcode job is added to the queue.
 */
  @Post('transcode')
  async transcode() {
    await this.audioQueue.add('transcode', {
      file: 'audio.mp3',
    });
  }
}
