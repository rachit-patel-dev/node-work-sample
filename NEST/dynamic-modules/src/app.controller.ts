import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

/**
 * AppController is a controller class that handles HTTP requests and responses for the application.
 * It is responsible for handling GET requests and returning the hello message from the AppService.
 */
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
 * Retrieves the hello message from the AppService.
 * 
 * @returns The hello message as a string.
 */
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
