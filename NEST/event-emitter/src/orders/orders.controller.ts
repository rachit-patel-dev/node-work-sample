import { Body, Controller, Post } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

/**
 * Controller responsible for handling orders.
 */
@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  /**
 * Creates a new order.
 * 
 * @param createOrderDto - The data for creating the order.
 * @returns The created order.
 */
  @Post()
  create(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.create(createOrderDto);
  }
}
