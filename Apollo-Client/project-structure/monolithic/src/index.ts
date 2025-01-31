import { runMigrations } from './db/migrations';
import { setupServer } from './http';
import { logger } from './logger';
import { syncMatchData } from './db/match/syncMatchData';
import * as Sentry from '@sentry/node';
import { config } from './config';
import * as sns from './notifications/aws/sns';
import jobWorker from './jobs';
import { createLoaders } from './db/dataLoaders';

/**
 * Starts the application by running necessary setup tasks and starting the server.
 * 
 * This function performs the following tasks in order:
 * 1. Runs database migrations using the 'runMigrations' function.
 * 2. Creates data loaders using the 'createLoaders' function.
 * 3. Starts the job worker using the 'jobWorker.start' function.
 * 4. Runs static jobs using the 'jobWorker.runStaticJobs' function.
 * 5. Sets up the server using the 'setupServer' function.
 * 6. Syncs match data using the 'syncMatchData' function.
 * 7. Initializes Sentry for error tracking.
 * 8. Subscribes to the SNS topic for email notifications using the 'sns.subscribe' function, if configured.
 * 
 * If any error occurs during the startup process, the function logs the error and exits the process with a status code of 1.
 * 
 * @returns {Promise<void>} A promise that resolves when the application is ready.
 */
export async function startApp() {
  try {
    await runMigrations();
    logger.debug('---');

    await createLoaders();
    logger.debug('---');

    await jobWorker.start();
    logger.debug('---');

    await jobWorker.runStaticJobs();
    logger.debug('---');

    await setupServer();
    logger.debug('---');

    await syncMatchData();
    logger.debug('---');

    Sentry.init({
      dsn: config.sentry.dsn,
      release: config.sentry.release,
      environment: config.name
    });

    if (config.emails.snsTopicArn) {
      await sns.subscribe(config.emails.snsTopicArn);
      logger.debug('---');
    }
  } catch (startupError) {
    logger.fatal(startupError, 'Cannot startup app:');
    process.exit(1);
  }

  logger.info('App is ready');
}
