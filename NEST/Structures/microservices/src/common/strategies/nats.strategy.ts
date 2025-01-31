import { ServerNats } from '@nestjs/microservices';

export interface NatsSubscriber {
  key: string;
  value: {
    pattern: string;
    queue: string;
  };
}

/**
 * Represents a strategy for binding events to a NATS client.
 * This class extends the ServerNats class from the '@nestjs/microservices' package.
 */
export class NatsStrategy extends ServerNats {
  /**
 * Binds event handlers to the provided client.
 * 
 * @param client - The client to bind the event handlers to.
 * @returns void
 */
  bindEvents(client: any) {
    const patterns = [...this.messageHandlers.keys()];
    const handlers = patterns.map(item => ({
      key: item,
      value: JSON.parse(item),
    })) as NatsSubscriber[];

    handlers.forEach(({ key, value }) =>
      client.subscribe(
        value.pattern,
        { queue: value.queue },
        this.getMessageHandler(key).bind(this),
      ),
    );
  }
}
