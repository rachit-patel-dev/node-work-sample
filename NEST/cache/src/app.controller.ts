import { CacheInterceptor } from '@nestjs/cache-manager';
import { Controller, Get, UseInterceptors } from '@nestjs/common';

/**
 * The AppController class is a controller that handles HTTP requests for the application.
 * It is decorated with the @Controller() decorator from the '@nestjs/common' module.
 * The class also uses the @UseInterceptors() decorator to apply the CacheInterceptor to all routes.
 * 
 * @remarks
 * This controller has a single route, decorated with the @Get() decorator, which handles GET requests to the root URL.
 * The route handler method, 'findAll()', returns an array of objects representing the found entities.
 * 
 * @example
 * // Example usage of the AppController class:
 * const appController = new AppController();
 * appController.findAll(); // Returns [{ id: 1, name: 'Nest' }]
 */
@Controller()
@UseInterceptors(CacheInterceptor)
export class AppController {
  @Get()
  findAll() {
    return [{ id: 1, name: 'Nest' }];
  }
}
