import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

/**
 * AppController class is responsible for handling HTTP requests and returning responses.
 * It is decorated with the @Controller() decorator from the '@nestjs/common' module.
 * This class has a constructor that injects an instance of the AppService class, which is responsible for handling business logic.
 * The @Get() decorator is used to define a route handler for the HTTP GET method.
 * The getHello() method is the route handler for the root route ("/") and it calls the getHello() method of the injected AppService instance to retrieve the response.
 * The response is then returned to the client.
 */
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello() {
    return this.appService.getHello();
  }
}
