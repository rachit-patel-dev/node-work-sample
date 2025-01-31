import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

/**
 * RedisIoAdapter is a custom adapter for Socket.IO that allows connecting to a Redis server.
 * It extends the IoAdapter class provided by the @nestjs/platform-socket.io package.
 *
 * Example usage:
 * ```
 * import { IoAdapter } from '@nestjs/platform-socket.io';
 * import { ServerOptions } from 'socket.io';
 * import { createAdapter } from '@socket.io/redis-adapter';
 * import { createClient } from 'redis';
 *
 * export class RedisIoAdapter extends IoAdapter {
 *   private adapterConstructor: ReturnType<typeof createAdapter>;
 *
 *   async connectToRedis(): Promise<void> {
 *     const pubClient = createClient({ url: `redis://localhost:6379` });
 *     const subClient = pubClient.duplicate();
 *
 *     await Promise.all([pubClient.connect(), subClient.connect()]);
 *
 *     this.adapterConstructor = createAdapter(pubClient, subClient);
 *   }
 *
 *   createIOServer(port: number, options?: ServerOptions): any {
 *     const server = super.createIOServer(port, options);
 *     server.adapter(this.adapterConstructor);
 *     return server;
 *   }
 * }
 * ```
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  /**
 * Connects to Redis and initializes the adapter constructor.
 * 
 * @returns {Promise<void>} A promise that resolves when the connection to Redis is established.
 */
  async connectToRedis(): Promise<void> {
    const pubClient = createClient({ url: `redis://localhost:6379` });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  /**
 * Creates an IO server with the specified port and options.
 * 
 * @param {number} port - The port number to listen on.
 * @param {ServerOptions} [options] - The options for the server.
 * @returns {any} The created IO server.
 */
  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
