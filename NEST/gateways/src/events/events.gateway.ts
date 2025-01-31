import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsResponse,
} from '@nestjs/websockets';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Server } from 'socket.io';

/**
 * WebSocket gateway for handling events.
 *
 * This class provides methods for subscribing to events and sending responses over WebSocket.
 * It is decorated with the `@WebSocketGateway` decorator from the `@nestjs/websockets` package.
 * The gateway is configured to allow cross-origin requests from any origin.
 *
 * Example usage:
 * ```typescript
 * const gateway = new EventsGateway();
 * gateway.findAll({}).subscribe(response => {
 *   console.log(response);
 * });
 * ```
 */
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway {
  @WebSocketServer()
  server: Server;

  /**
 * Retrieves all events.
 *
 * @param data - The data to be used for retrieving events.
 * @returns An observable of WsResponse<number> containing the events.
 */
  @SubscribeMessage('events')
  findAll(@MessageBody() data: any): Observable<WsResponse<number>> {
    return from([1, 2, 3]).pipe(map(item => ({ event: 'events', data: item })));
  }

  /**
 * Retrieves the identity.
 *
 * @param data - The data to be used for retrieving the identity.
 * @returns A promise that resolves to the identity.
 */
  @SubscribeMessage('identity')
  async identity(@MessageBody() data: number): Promise<number> {
    return data;
  }
}
