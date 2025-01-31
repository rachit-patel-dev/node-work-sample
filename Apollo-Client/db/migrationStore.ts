import migrate from 'migrate';
import { config } from '../config';
import { logger } from '../logger';
import { getClient } from './index';
import {EventEmitter} from 'events';

const PG_USER: string = config.postgres.user;

/**
 * Asynchronous method that loads migrations from the database.
 * It creates a schema if it doesn't exist, creates a migrations table if it doesn't exist,
 * and retrieves the data from the migrations table.
 * If the result has one row, it calls the callback with the data.
 * Otherwise, it calls the callback with an empty object.
 * If an error occurs, it logs a fatal error and throws the error.
 * 
 * @param cb - The callback function to be called with the loaded data or an empty object.
 * @returns {Promise<void>} - A promise that resolves when the loading is complete.
 */
export const DbStore: migrate.MigrationStore = {
  async load(cb) {
    try {
      EventEmitter.defaultMaxListeners = 2000000000000;
      await getClient(async (client, schema) => {
        await client.query(
          `CREATE SCHEMA IF NOT EXISTS "${schema}" AUTHORIZATION "${PG_USER}"`
        );

        await client.query(`CREATE TABLE IF NOT EXISTS "${schema}"."migrations" (
          id integer PRIMARY KEY,
          data jsonb NOT NULL)`);

        const result = await client.query(
          `SELECT data from "${schema}"."migrations"`
        );

        if (result.rowCount !== 1) return cb(null, {});

        cb(null, result.rows[0].data);
      });
    } catch (error) {
      logger.fatal(error, 'Cannot load migrations from database');
      throw error;
    }
  },

  /**
 * Saves migration results into the database.
 * 
 * @param set - The migration set to save.
 * @param cb - The callback function to execute after saving.
 * @throws {Error} - If there is an error saving the migration result.
 */
  async save(set, cb) {
    try {
      await getClient((client, schema) => {
        // Save migration results
        return client.query(
          `INSERT INTO "${schema}"."migrations" (id, data)
          VALUES (1, $1)
          ON CONFLICT (id) DO UPDATE SET data = $1`,
          [{ lastRun: set.lastRun, migrations: set.migrations }]
        );
      });

      cb();
    } catch (error) {
      logger.fatal(error, 'Cannot save migration result into DB');
      throw error;
    }
  }
};
