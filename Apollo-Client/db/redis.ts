import Redis from 'ioredis';
import { config } from '../config';

const connections: Redis.Redis[] = [];

export const connectionOptions = {
  ...config.redis,
  password: config.secrets.redisPassword
};

/**
 * Create new Redis connection
 */
export function connection(options: Redis.RedisOptions = {}) {
  const conn = new Redis({
    ...connectionOptions,
    keyPrefix: `${config.name}:`,
    ...options
  });
  connections.push(conn);
  return conn;
}

/**
 * Shared redis connection
 *
 * @TODO: Research is it better to use multiple connections vs single
 */
export const redis = connection();

/**
 * Gracefully close all redis connections
 */
export async function close(): Promise<void> {
  await Promise.all(connections.map(conn => conn.quit()));
}
