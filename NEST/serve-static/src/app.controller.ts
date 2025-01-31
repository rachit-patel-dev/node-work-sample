import { Controller, Get } from '@nestjs/common';

/**
 * AppController is a controller class that handles HTTP requests and responses.
 * It is responsible for handling the routes and logic related to the application.
 * This class is decorated with the '@Controller()' decorator from the '@nestjs/common' module.
 * It defines a single route, which is decorated with the '@Get()' decorator.
 * The 'getHello()' method is executed when a GET request is made to the defined route.
 * It returns a string response of 'Hello, world!'.
 */
@Controller()
export class AppController {
  /**
 * Retrieves a greeting message.
 *
 * @returns The greeting message "Hello, world!".
 */
  @Get()
  getHello() {
    return 'Hello, world!';
  }
}
