import { Injectable } from '@nestjs/common';
import { ConfigService } from './config/config.service';

/**
 * The AppService class is responsible for providing the hello message.
 * It depends on the ConfigService class to retrieve the hello message from the environment configuration.
 *
 * @constructor
 * @param {ConfigService} configService - An instance of the ConfigService class.
 */
@Injectable()
export class AppService {
  private helloMessage: string;

  constructor(configService: ConfigService) {
    this.helloMessage = configService.get('HELLO_MESSAGE');
  }

  /**
 * Returns the hello message.
 *
 * @returns {string} The hello message.
 */
  getHello(): string {
    return this.helloMessage;
  }
}
