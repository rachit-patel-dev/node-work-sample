import { Controller, Get, Inject } from '@nestjs/common';
import { ClientProxy, MessagePattern } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { MATH_SERVICE } from './math.constants';

/**
 * MathController is a controller class that handles math operations.
 *
 * @remarks
 * This class is responsible for handling requests related to math operations.
 *
 * @example
 * const mathController = new MathController();
 *
 * @publicApi
 */
@Controller()
export class MathController {
  constructor(@Inject(MATH_SERVICE) private readonly client: ClientProxy) {}

  /**
 * Executes the 'sum' command by sending data to the client.
 * 
 * @returns An Observable that emits a number representing the sum of the data.
 */
  @Get()
  execute(): Observable<number> {
    const pattern = { cmd: 'sum' };
    const data = [1, 2, 3, 4, 5];
    return this.client.send<number>(pattern, data);
  }

  /**
 * Calculates the sum of an array of numbers.
 * 
 * @param data - An array of numbers to be summed.
 * @returns The sum of the numbers in the array.
 */
  @MessagePattern({ cmd: 'sum' })
  sum(data: number[]): number {
    return (data || []).reduce((a, b) => a + b);
  }
}
