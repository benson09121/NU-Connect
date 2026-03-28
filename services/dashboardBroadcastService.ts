/**
 * services/dashboardBroadcastService.ts
 *
 * Ties together the dashboard model queries and the WebSocket broadcast layer.
 *
 * Call `broadcastDashboardUpdate(orgId)` from any controller or job after a
 * mutation that could affect dashboard stats:
 *
 *   - New / updated membership application
 *   - New / updated event proposal (tbl_event_application)
 *   - Upcoming event created or status changed
 *   - Organization status changed
 *
 * What it does:
 *   1. Resolves all user IDs that are affected by the org (scoped lookup)
 *   2. Deletes each user's cached dashboard stats from Valkey
 *   3. Emits `dashboard:stats:updated` to each user's private Socket.IO room
 *      — the frontend reacts by invalidating its TanStack Query cache and
 *        refetching GET /api/web/dashboard/stats
 *
 * Import example (in an event controller after saving a proposal):
 *
 *   import { broadcastDashboardUpdate } from '../../services/dashboardBroadcastService';
 *   await broadcastDashboardUpdate(organizationId);
 *
 * Publishing via Valkey pub/sub (for background jobs without a direct socket ref):
 *
 *   import { pubClient } from '../config/valkey';
 *   // trigger broadcastDashboardUpdate from whichever process holds the socket
 *   pubClient.publish(
 *     'channel:dashboard:org',
 *     JSON.stringify({ orgId: organizationId })
 *   );
 *   // The _initDashboardBridge() listener in this file handles the rest.
 */

import { getAffectedEmails, invalidateDashboardCacheForEmail } from '../web/models/dashboardModel';
import { broadcastToUser } from './websocketService';
import { subClient } from '../config/valkey';

// ---------------------------------------------------------------------------
// Core broadcast function
// ---------------------------------------------------------------------------

/**
 * Find all users scoped to `orgId`, invalidate their caches, and emit
 * `dashboard:stats:updated` to each of their private Socket.IO rooms.
 *
 * Safe to call from any controller or background job that has access to the
 * running WebSocket server (i.e., after `initWebSocket` has been called).
 */
export async function broadcastDashboardUpdate(orgId: number): Promise<void> {
  try {
    const emails = await getAffectedEmails(orgId);

    await Promise.all(
      emails.map(async (email) => {
        // 1. Bust this user's cached stats so the next fetch is fresh
        await invalidateDashboardCacheForEmail(email);

        // 2. Tell the client to refetch
        broadcastToUser(email, 'dashboard:stats:updated', {});
      })
    );

    if (emails.length > 0) {
      console.log(
        `[Dashboard] Broadcasted stats:updated for org ${orgId} → ${emails.length} user(s)`
      );
    }
  } catch (err) {
    // Non-fatal — a failed broadcast should not bubble up and break mutations
    console.error('[Dashboard] broadcastDashboardUpdate error:', err);
  }
}

// ---------------------------------------------------------------------------
// Valkey pub/sub bridge
// ---------------------------------------------------------------------------
// Background jobs (e.g. certificateQueue, eventReminderJob) that run in a
// separate Node process or worker do not hold a reference to the Socket.IO
// `io` instance. They can publish to the `channel:dashboard:org` Valkey
// channel instead, and this bridge will pick it up and call
// broadcastDashboardUpdate on the process that owns the socket.
//
// Usage from a background job:
//   pubClient.publish('channel:dashboard:org', JSON.stringify({ orgId: 42 }));
// ---------------------------------------------------------------------------

let _bridgeInitialised = false;

/**
 * Start listening on `channel:dashboard:org` for cross-process triggers.
 * Called once during server startup (after initWebSocket).
 */
export function initDashboardBridge(): void {
  if (_bridgeInitialised) return;
  _bridgeInitialised = true;

  const bridgeSub = subClient.duplicate();

  bridgeSub.subscribe('channel:dashboard:org', (err: Error | null) => {
    if (err) {
      console.error('[Dashboard] Bridge subscribe error:', err);
    } else {
      console.log('[Dashboard] Bridge listening on channel:dashboard:org');
    }
  });

  bridgeSub.on('message', (_channel: string, message: string) => {
    try {
      const { orgId } = JSON.parse(message) as { orgId: number };
      if (typeof orgId === 'number') {
        broadcastDashboardUpdate(orgId).catch((e) =>
          console.error('[Dashboard] Bridge broadcastDashboardUpdate error:', e)
        );
      }
    } catch (err) {
      console.error('[Dashboard] Bridge message parse error:', err);
    }
  });
}
