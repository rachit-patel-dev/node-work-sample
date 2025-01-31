import { Pool, PoolClient } from 'pg';
import _ from 'lodash';
import { config } from '../config';
import { logger } from '../logger';
import { sql } from './sqlTag';

export type ExtendedPoolClient = PoolClient & { inTransaction: boolean };

type GetClientCallback<TReturn> = (client: ExtendedPoolClient, schema: string) => Promise<TReturn>;

const schema = config.postgres.schema;
const pool = new Pool({
  ...config.postgres,
  password: config.secrets.postgresPassword
});

pool.on('error', error => logger.error(error, 'postgres:'));

/**
 * Connects to the PostgreSQL pool and returns an extended pool client.
 * The extended pool client includes an additional property 'inTransaction' which indicates whether the client is currently in a transaction.
 * 
 * @returns {Promise<ExtendedPoolClient>} A promise that resolves to the extended pool client.
 */
const poolConnect = async (): Promise<ExtendedPoolClient> => {
  const client = await pool.connect();
  return Object.assign(client, { inTransaction: false });
};

/**
 * Safe way to get db client from the pool and return it back after usage
 */
async function getClient<TReturn = undefined>(cb: GetClientCallback<TReturn>): Promise<TReturn> {
  const client = await poolConnect();

  let result: TReturn;
  try {
    result = await cb(client, config.postgres.schema);
  } catch (error) {
    logger.error(error, 'postgres getClient error');
    throw error;
  } finally {
    client.release();
  }

  return result;
}

/**
 * Same as getClient but executes everything inside of transation which will be
 * autocommited if there are no errors or rolled back if error occured
 */
function getClientTransaction<TReturn = undefined>(cb: GetClientCallback<TReturn>): Promise<TReturn> {
  return getClient(client => wrapTransaction(client, cb));
}

async function wrapTransaction<TReturn = undefined>(
  client: ExtendedPoolClient,
  cb: GetClientCallback<TReturn>
): Promise<TReturn> {
  let result: TReturn;
  try {
    await client.query('BEGIN');
    client.inTransaction = true;

    result = await cb(client, schema);

    await client.query('COMMIT');
    client.inTransaction = false;
  } catch (error) {
    await client.query('ROLLBACK');
    client.inTransaction = false;

    // We just rethrow error and handle it in the 'getClient'
    throw error;
  }

  return result;
}

function ClientBasedResolverTransaction<T extends { (client: PoolClient, ...rest: any[]): Promise<any> }>(func: T): T {
  return (async (client: PoolClient, ...others: any[]) => {
    try {
      await client.query('BEGIN');
      const result = await func(client, ...others);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }) as T;
}

function canBeLoadFromDataLoaders(
  ctx: TFunction.GraphqlClientBasedResolver.Context,
  client: ExtendedPoolClient,
  currentTable: string
): boolean {
  if (!ctx.dataLoader) return false;
  if (!ctx.changedTablesInRequest) return false;

  return !(client.inTransaction && ctx.changedTablesInRequest.has(currentTable));
}

export {
  pool,
  poolConnect,
  schema,
  sql,
  canBeLoadFromDataLoaders,
  getClient,
  getClientTransaction,
  wrapTransaction,
  ClientBasedResolverTransaction
};

const PGErrorKeys = [
  'name',
  'message',
  'length',
  'severity',
  'code',
  'detail',
  'hint',
  'position',
  'internalPosition',
  'internalQuery',
  'where',
  'schema',
  'table',
  'column',
  'dataType',
  'constraint',
  'routine'
] as const;
export function isPGError(error: Record<string, unknown> | Error): error is Record<typeof PGErrorKeys[number], any> {
  return _.isEmpty(_.without(PGErrorKeys, ...Object.keys(error)));
}

export interface DB {
  pool: Pool;
  poolConnect: typeof poolConnect;

  canBeLoadFromDataLoaders: typeof canBeLoadFromDataLoaders;

  sql: typeof sql;
  getClient: typeof getClient;
  getClientTransaction: typeof getClientTransaction;
  wrapTransaction: typeof wrapTransaction;
  isPGError: typeof isPGError;
}
