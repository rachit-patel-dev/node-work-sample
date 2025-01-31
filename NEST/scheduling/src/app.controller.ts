import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

/**
 * The AppController class is responsible for handling HTTP requests and responses related to the application.
 * It is decorated with the @Controller() decorator from the '@nestjs/common' module.
 * The class has a constructor that injects an instance of the AppService class, which is responsible for the application's business logic.
 * The class has a single method, getHello(), which is decorated with the @Get() decorator from the '@nestjs/common' module.
 * This method returns a string by calling the getHello() method of the injected AppService instance.
 */
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
 * Retrieves a greeting message from the AppService.
 * 
 * @returns The greeting message as a string.
 */
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
