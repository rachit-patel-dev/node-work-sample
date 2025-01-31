import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Order } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderCreatedEvent } from './events/order-created.event';

/**
 * The OrdersService class is responsible for managing orders.
 * It provides methods for creating and retrieving orders.
 * 
 * @remarks
 * This class uses the EventEmitter2 module for emitting events when an order is created.
 * 
 * @example
 * ```typescript
 * const ordersService = new OrdersService(eventEmitter);
 * const createOrderDto = {
 *   name: 'New Order',
 *   description: 'Description of the new order',
 * };
 * const order = ordersService.create(createOrderDto);
 * console.log(order); // { id: 3, name: 'New Order', description: 'Description of the new order' }
 * ```
 */
@Injectable()
export class OrdersService {
  public orders: Order[] = [
    {
      id: 1,
      name: 'Order #1',
      description: 'Description order #1',
    },
    {
      id: 2,
      name: 'Order #2',
      description: 'Description order #2',
    },
  ];

  constructor(private eventEmitter: EventEmitter2) {}

  /**
 * Creates a new order.
 * 
 * @param createOrderDto - The data for creating the order.
 * @returns The newly created order.
 */
  create(createOrderDto: CreateOrderDto) {
    const order = {
      id: this.orders.length + 1,
      ...createOrderDto,
    };
    this.orders.push(order);

    const orderCreatedEvent = new OrderCreatedEvent();
    orderCreatedEvent.name = order.name;
    orderCreatedEvent.description = order.description;
    this.eventEmitter.emit('order.created', orderCreatedEvent);

    return order;
  }
}
