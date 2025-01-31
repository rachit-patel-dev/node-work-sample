import { Get, Controller, Render } from '@nestjs/common';

/**
 * Controller responsible for handling requests related to the application.
 */
@Controller()
export class AppController {
  /**
 * Retrieves the root endpoint of the application.
 * Renders the 'index.hbs' template and returns the rendered HTML.
 * 
 * @returns {Object} The rendered HTML with the message 'Hello world!'.
 */
  @Get()
  @Render('index.hbs')
  root() {
    return { message: 'Hello world!' };
  }
}
