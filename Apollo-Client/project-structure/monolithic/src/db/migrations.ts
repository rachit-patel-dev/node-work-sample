/*external modules*/
import migrate from 'migrate';
import * as path from 'path';
/*DB*/
import { getClientTransaction, getClient, ExtendedPoolClient } from './index';
import { DbStore } from './migrationStore';
import templateGenerator from 'migrate/lib/template-generator';
/*GQL*/
/*other*/
import { logger } from '../logger';
import { config } from '../config';

/**
 * Helper to up and down migration with DB instance passed in
 */
export function run(cb: (db: ExtendedPoolClient, schema: string) => Promise<void>) {
  return async () => {
    try {
      await getClientTransaction(cb);
    } catch (error) {
      logger.fatal(error, 'Cannot run migration');
      throw error;
    }
  };
}

/**
 * Creates an enum string by converting the keys of an object into a comma-separated string.
 * 
 * @param obj - The object whose keys will be converted into an enum string.
 * @param omitKeys - Optional. An array of keys to be omitted from the enum string.
 * @returns The enum string created from the keys of the object.
 */
export function createEnum(obj: Record<string, unknown>, omitKeys?: string[]): string {
  return Object.keys(obj)
    .filter(key => !(omitKeys ?? []).includes(key))
    .map(name => `'${name}'`)
    .join(',');
}

/**
 * Runs the database migrations.
 *
 * @returns {Promise<void>} A promise that resolves when the migrations are complete.
 */
export function runMigrations() {
  return execMigrate(MigrateCommand.Up);
}

export enum MigrateCommand {
  Up = 'up',
  Down = 'down',
  Create = 'create',
  Drop = 'drop'
}

/**
 * Executes a migration command.
 * 
 * @param cmd - The migration command to execute (up, down, create, drop).
 * @param args - Optional arguments for the migration command.
 * @returns A promise that resolves when the migration command is complete.
 * @throws An error if the migration command fails.
 */
export function execMigrate(cmd: MigrateCommand, args: string[] = []): Promise<void> {
  if (cmd === MigrateCommand.Drop) {
    if (config.postgres.disableDrop) {
      throw new Error('DB drop is disabled in current environment. Set postgres.disableDrop to false to enable');
    }

    logger.warn('Dropping current DB. Do you want to continues? [y/n]');

    return new Promise<void>((resolve, reject) => {
      process.stdin.once('data', async (data: Buffer) => {
        (process.stdin as any).unref();

        if (data.toString('utf8').trim() !== 'y') {
          logger.info('Aborting schema drop');
          return resolve();
        }

        try {
          await getClient(async client => {
            await client.query(`DROP SCHEMA ${config.postgres.schema} CASCADE`);
          });

          logger.info(`Schema ${config.postgres.schema} was successfully dropped`);
          resolve();
        } catch (dropError) {
          reject(dropError);
        }
      });
    });
  }

  return new Promise<void>((resolve, reject) => {
    migrate.load(
      {
        stateStore: DbStore,
        migrationsDirectory: path.join(__dirname, 'migrations')
      },
      (error, set) => {
        if (error) {
          logger.fatal(error, 'Cannot execute migrate cmd:');
          reject(error);
        }

        set.on('migration', (migration, direction) => {
          logger.debug(`${direction}: ${migration.title}`);
        });

        logger.info(`Migrate exec '${cmd}'`);

        switch (cmd) {
          case MigrateCommand.Up:
          case MigrateCommand.Down:
            set[cmd](args[0], cmdError => {
              if (cmdError) {
                logger.fatal(cmdError, 'Migration did crashed:');
                reject(cmdError);
              } else {
                resolve();
              }
            });
            break;
          case MigrateCommand.Create:
            if (!args[0]) {
              logger.fatal('Please provide migration name');
              return reject(new Error('Please provide migration name'));
            }

            templateGenerator(
              {
                name: args[0],
                templateFile: path.join(__dirname, 'migrationTemplate.js'),
                migrationsDirectory: './src/db/migrations',
                extension: '.ts'
              },
              (genError, path) => {
                if (genError) {
                  logger.fatal(genError, 'cannot create migrattion: ');
                  reject(genError);
                } else {
                  logger.info(`create migration at ${path}`);
                  resolve();
                }
              }
            );
            break;
          default:
            logger.warn(`Command "${cmd}" is not implemented`);
            reject(new Error(`migrate command "${cmd}" not implemented`));
        }
      }
    );
  });
}
