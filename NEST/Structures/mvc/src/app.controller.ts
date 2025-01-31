import { Controller, Get, Render } from '@nestjs/common';

/**
 * AppController class is responsible for handling requests and rendering views.
 *
 * @remarks
 * This class is decorated with the `@Controller()` decorator from the `@nestjs/common` package.
 * It defines a route handler for the root path ("/") using the `@Get()` decorator.
 * The `@Render('index')` decorator specifies that the "index" view should be rendered.
 * The `root()` method returns an object with a message property set to "Hello world!".
 *
 * @see Controller
 * @see Get
 * @see Render
 */
@Controller()
export class AppController {
  /**
 * Retrieves the root endpoint of the application.
 * 
 * @returns An object containing the message "Hello world!".
 */
  @Get()
  @Render('index')
  root() {
    return { message: 'Hello world!' };
  }
}
