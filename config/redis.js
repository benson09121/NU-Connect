/**
 * config/redis.js
 *
 * Compatibility shim — re-exports Valkey clients under the old redis names
 * so existing JS files that `require('../../config/redis')` keep working.
 */
const { cacheClient, pubClient, subClient } = require('./valkey');

module.exports = {
  redisClient: cacheClient,
  redisSubscriber: subClient,
  redisPublisher: pubClient,
};
