import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OrderCreatedEvent } from '../events/order-created.event';

/**
 * OrderCreatedListener class is responsible for handling and processing the 'order.created' event.
 * It is an Injectable class that listens to the event and logs the event object to the console.
 */
@Injectable()
export class OrderCreatedListener {
  /**
 * Handles and processes the "OrderCreatedEvent" event.
 * 
 * @param event The OrderCreatedEvent object containing the event data.
 */
  @OnEvent('order.created')
  handleOrderCreatedEvent(event: OrderCreatedEvent) {
    // handle and process "OrderCreatedEvent" event
    console.log(event);
  }
}
