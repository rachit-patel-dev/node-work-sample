import Mocha from 'mocha';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import { setup, teardown } from './setup';

/**
 * Run tests from './test' directory
 */
export async function runTests(pattern?: RegExp): Promise<void> {
  const mocha = new Mocha({
    timeout: 10_000
  });

  try {
    logger.info('Setup tests');
    await Promise.all([setup(), collectTestFiles(file => mocha.addFile(file), __dirname, pattern)]);
    const failures = await new Promise<number>(resolve => mocha.run(resolve));
    if (failures) throw new Error('Tests are failed');
  } catch (error) {
    logger.fatal(error, 'tests did crashed');
    throw error;
  } finally {
    logger.info('Teardown tests');
    await teardown();
  }
}

/**
 * Recursively traverse specified directory and collect all *.test.ts files
 */
function collectTestFiles(cb: (filename: string) => void, dir: string, pattern?: RegExp) {
  logger.debug('Collect tests: %s', dir);

  return new Promise((resolve, reject) => {
    const promises: Promise<any>[] = [];

    fs.readdir(dir, { withFileTypes: true }, (err, files) => {
      if (err) return reject(err);

      for (const file of files) {
        const filename = path.join(dir, file.name);
        if (file.isDirectory()) {
          promises.push(collectTestFiles(cb, filename, pattern));
        } else if (filename.endsWith('.test.ts')) {
          if (pattern && !pattern.test(filename)) continue;
          cb(filename);
        }
      }

      Promise.all(promises).then(resolve);
    });
  });
}
