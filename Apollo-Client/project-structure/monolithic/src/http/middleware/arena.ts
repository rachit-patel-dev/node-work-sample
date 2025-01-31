import _ from 'lodash';
import { config } from '../../config';
import jobWorker from '../../jobs';

/**
 * This code snippet checks if the `runArena` property in the `config.redis` object is truthy. If it is, it requires the 'bull-arena' module and passes an object as its argument. The object contains a `queues` property which is an array of objects. Each object in the array represents a queue and contains properties such as `name`, `host`, `password`, `hostId`, `prefix`, and `port`. These properties are retrieved from the `jobWorker` object and its nested properties. The `bull-arena` module is used to manage and monitor the queues defined in the `jobWorker` object.
 */
if (config.redis.runArena) {
  require('bull-arena')({
    queues: _.map(jobWorker.queues, queue => {
      return {
        name: queue.name,
        host: jobWorker.config.redis.host,
        password: jobWorker.config.secrets.redisPassword,
        hostId: jobWorker.config.name,
        prefix: jobWorker.prefix,
        port: jobWorker.config.redis.port
      };
    })
  });
}
