/**
 * config/valkey.ts
 *
 * Valkey (Redis-compatible) client setup.
 * We need TWO separate ioredis connections for Socket.IO pub/sub:
 *  - `pubClient`  → publishes messages to Valkey channels
 *  - `subClient`  → holds the SUBSCRIBE state (cannot run other commands on it)
 *
 * A third `cacheClient` is used for GET/SET (permission caching, session data, etc.)
 *
 * ENV variables required:
 *   VALKEY_HOST      (default: 127.0.0.1)
 *   VALKEY_PORT      (default: 6379)
 *   VALKEY_PASSWORD  (optional)
 *   VALKEY_DB        (default: 0)
 */

import Redis, { RedisOptions } from 'ioredis';
import 'dotenv/config';

const VALKEY_CONFIG: RedisOptions = {
  host: process.env.VALKEY_HOST || '127.0.0.1',
  port: parseInt(process.env.VALKEY_PORT || '6379', 10),
  password: process.env.VALKEY_PASSWORD || undefined,
  db: parseInt(process.env.VALKEY_DB || '0', 10),
  retryStrategy: (times: number) => {
    if (times > 20) {
      console.error('[Valkey] Max reconnection attempts reached');
      return null;
    }
    return Math.min(times * 200, 2000);
  },
  lazyConnect: false,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
};

// ---------------------------------------------------------------------------
// Publisher – used to PUBLISH events to Valkey channels
// ---------------------------------------------------------------------------
export const pubClient = new Redis({ ...VALKEY_CONFIG, connectionName: 'socketio-pub' });

pubClient.on('connect', () => console.log('[Valkey] pubClient connected'));
pubClient.on('error', (err: Error) => console.error('[Valkey] pubClient error:', err.message));

// ---------------------------------------------------------------------------
// Subscriber – used by Socket.IO redis-adapter (stays in SUBSCRIBE mode)
// ---------------------------------------------------------------------------
export const subClient = pubClient.duplicate();
subClient.options.connectionName = 'socketio-sub';

subClient.on('connect', () => console.log('[Valkey] subClient connected'));
subClient.on('error', (err: Error) => console.error('[Valkey] subClient error:', err.message));

// ---------------------------------------------------------------------------
// Cache client – general purpose GET/SET for permissions, sessions, etc.
// ---------------------------------------------------------------------------
export const cacheClient = pubClient.duplicate();
cacheClient.options.connectionName = 'cache';

cacheClient.on('connect', () => console.log('[Valkey] cacheClient connected'));
cacheClient.on('error', (err: Error) => console.error('[Valkey] cacheClient error:', err.message));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set a JSON value with optional TTL (seconds).
 */
export async function setCache(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const serialized = JSON.stringify(value);
  if (ttlSeconds) {
    await cacheClient.set(key, serialized, 'EX', ttlSeconds);
  } else {
    await cacheClient.set(key, serialized);
  }
}

/**
 * Get a parsed JSON value from cache. Returns null on miss.
 */
export async function getCache<T = unknown>(key: string): Promise<T | null> {
  const raw = await cacheClient.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

/**
 * Delete one or more cache keys.
 */
export async function deleteCache(...keys: string[]): Promise<void> {
  if (keys.length) await cacheClient.del(...keys);
}

/**
 * Invalidate all permission cache entries for a user.
 * Call this whenever the user's role / org membership changes.
 */
export async function invalidateUserPermissions(userId: string): Promise<void> {
  await deleteCache(`permissions:${userId}`);
  const orgKeys = await cacheClient.keys(`permissions:${userId}:org:*`);
  if (orgKeys.length) await cacheClient.del(...orgKeys);
  console.log(`[Valkey] Permission cache invalidated for user: ${userId}`);
}
