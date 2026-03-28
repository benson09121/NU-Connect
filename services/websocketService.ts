/**
 * services/websocketService.ts
 *
 * Socket.IO server with:
 *  - Valkey (Redis) adapter for horizontal scaling across multiple Node.js instances
 *  - JWT authentication on every connection handshake
 *  - Permission-based room subscription (page-access gateway)
 *  - Private user room for direct messages / notifications
 *  - Valkey pub/sub bridge for off-socket triggers (background jobs, external services)
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │  React Client                                                │
 * │   socket.connect({ auth: { token } })                       │
 * │   socket.emit('page:subscribe', { page, orgId? })           │
 * │   socket.on('page:subscribed', handler)                     │
 * │   socket.on('page:denied', handler)                         │
 * │   socket.on('<custom-event>', handler)                      │
 * └───────────────────────┬──────────────────────────────────────┘
 *                         │ WebSocket / polling
 * ┌───────────────────────▼──────────────────────────────────────┐
 * │  Socket.IO Server (this file)                                │
 * │   ① Auth middleware → verify JWT                            │
 * │   ② page:subscribe  → check permissions → join/deny room    │
 * │   ③ Rooms: user:{id}, page:{name}, org:{id}:page:{name}     │
 * └───────────────────┬──────────────────────────────────────────┘
 *                     │ pub/sub
 * ┌───────────────────▼──────────────────────────────────────────┐
 * │  Valkey                                                      │
 * │   • Socket.IO state sync (via redis-adapter)                 │
 * │   • Off-socket broadcast channels                           │
 * │     channel:page:{name}  →  triggers io.to(room).emit()    │
 * │     channel:user:{id}    →  triggers user room emit()       │
 * └──────────────────────────────────────────────────────────────┘
 *
 * =============================================================================
 * PAGE PERMISSION MAP
 * =============================================================================
 * Define which permission (if any) is required to subscribe to each page room.
 *
 *  null            → any authenticated user may subscribe
 *  string          → exact permission name required (global OR org-scoped)
 *  string[]        → ALL of these permissions required
 *  { any: [] }     → ANY one of these permissions is enough
 *
 * scope:
 *  'global'       → no orgId needed
 *  'organization' → orgId must be supplied; permission checked in that org context
 */

import 'dotenv/config';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import jwksClient, { JwksClient, SigningKey } from 'jwks-rsa';
import { IncomingMessage, ServerResponse } from 'http';
import { Server as HttpServer } from 'http';
import { pubClient, subClient } from '../config/valkey';
import { can, canAny } from './permissionService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SocketUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface PageSubscribePayload {
  page: string;
  orgId?: number;
  org_id?: number;   // frontend uses snake_case — accept both
}

interface PageUnsubscribePayload {
  page?: string;
  orgId?: number;
  org_id?: number;
}

interface AckResponse {
  ok: boolean;
  room?: string;
  error?: string;
}

interface BridgePayload {
  event: string;
  data: unknown;
}

type PagePermissionScope = 'global' | 'organization';

interface PagePermissionConfig {
  permission: string | string[] | { any: string[] } | null;
  scope: PagePermissionScope;
}

type PagePermissionEntry = null | PagePermissionConfig;

interface PagePermissionMap {
  [page: string]: PagePermissionEntry;
}

// Augment Socket.IO's Socket data type
interface SocketData {
  user: SocketUser;
}

interface AuthenticatedSocket extends Socket {
  data: SocketData;
}

// ---------------------------------------------------------------------------
// JWKS client — reused across connections (caches signing keys automatically)
// ---------------------------------------------------------------------------

const _jwksClient: JwksClient = jwksClient({
  jwksUri: 'https://login.microsoftonline.com/common/discovery/keys',
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600_000, // 10 min
});

/**
 * Verify an Azure AD access token and return the decoded payload.
 */
async function verifyAzureToken(token: string): Promise<jwt.JwtPayload> {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded?.header?.kid) throw new Error('AUTH_INVALID_TOKEN');

  const key: SigningKey = await _jwksClient.getSigningKey(decoded.header.kid);
  const publicKey = key.getPublicKey();

  return jwt.verify(token, publicKey, {
    audience: process.env.AZURE_CLIENT_ID,
    issuer: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`,
  }) as jwt.JwtPayload;
}

// ---------------------------------------------------------------------------
// Page → Permission configuration
// ---------------------------------------------------------------------------
// Extend this map to add permission requirements for your routes.
// The "page" key should match what the client sends in page:subscribe payload.
// ---------------------------------------------------------------------------

const PAGE_PERMISSIONS: PagePermissionMap = {
  // Public to all logged-in users
  dashboard:     null,
  profile:       null,
  notifications: null,

  // Organization-agnostic pages
  events:        null, // any logged-in user can view events
  organizations: null,
  venues:        null, // any logged-in user can view venues
  'event-requirements': null, // manage event requirements page
  terms:         null, // academic terms management (SDAO)

  // Org-scoped pages (orgId required)
  'org:members':  { permission: 'view_org_members',    scope: 'organization' },
  'org:events':   { permission: 'manage_org_events',   scope: 'organization' },
  'org:finances': { permission: 'view_finances',       scope: 'organization' },
  'org:settings': { permission: 'manage_org_settings', scope: 'organization' },

  // SDAO / admin pages
  analytics:   { permission: 'view_analytics',     scope: 'global' },
  approvals:   { permission: null,                 scope: 'global' }, // any approver – refine as needed
  logs:        { permission: 'view_logs',          scope: 'global' },
  accounts:    { permission: 'MANAGE_ACCOUNT',     scope: 'global' },
  colleges:    { permission: 'manage_colleges',    scope: 'global' },
  programs:    { permission: 'manage_programs',    scope: 'global' },
  permissions: { permission: 'manage_permissions', scope: 'global' },

  // Org-detail page (per-org room, open to any authenticated user who can view the org)
  'org-detail': { permission: null, scope: 'organization' },

  // Manage Roles & Permissions page (org-scoped)
  'manage-roles': { permission: 'MANAGE_ORG_ROLES', scope: 'organization' },
};

// ---------------------------------------------------------------------------
// Room name helpers
// ---------------------------------------------------------------------------

export const rooms = {
  user:      (userId: string): string                       => `user:${userId}`,
  page:      (page: string): string                         => `page:${page}`,
  orgPage:   (orgId: number | string, page: string): string => `org:${orgId}:page:${page}`,
  orgDetail: (orgId: number | string): string               => `org-detail:${orgId}`,
};

// ---------------------------------------------------------------------------
// Module-level io reference (set in initWebSocket)
// ---------------------------------------------------------------------------

let io: Server | null = null;

// ---------------------------------------------------------------------------
// Initialise Socket.IO
// ---------------------------------------------------------------------------

/**
 * Attach Socket.IO to an existing HTTP server and wire up Valkey adapter,
 * auth middleware, and event handlers.
 */
export function initWebSocket(
  httpServer: HttpServer<typeof IncomingMessage, typeof ServerResponse>
): Server {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Use polling as fallback so it works behind proxies that don't support WS
    transports: ['websocket', 'polling'],
    // Connection state recovery – lets clients re-sync missed events after reconnect
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 min
      skipMiddlewares: true,
    },
  });

  // ── Valkey adapter (horizontal scaling) ────────────────────────────────────
  io.adapter(createAdapter(pubClient, subClient));
  console.log('[WebSocket] Valkey adapter attached');

  // ── Global auth middleware ─────────────────────────────────────────────────
  io.use(authenticateSocket);

  // ── Connection handler ─────────────────────────────────────────────────────
  io.on('connection', (socket: Socket) =>
    handleConnection(socket as AuthenticatedSocket)
  );

  // ── Valkey off-socket pub/sub bridge ──────────────────────────────────────
  _initValkeyBridge();

  console.log('[WebSocket] Socket.IO server initialised');
  return io;
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

/**
 * Verify JWT from socket.handshake.auth.token or Authorization header.
 * Attaches decoded user info to socket.data.user.
 */
async function authenticateSocket(
  socket: Socket,
  next: (err?: Error) => void
): Promise<void> {
  try {
    const authToken = (socket.handshake.auth as Record<string, string>)?.token;
    const headerToken = socket.handshake.headers?.authorization?.split(' ')[1];
    const token: string | undefined = authToken || headerToken;

    if (!token) return next(new Error('AUTH_NO_TOKEN'));

    // ── Verify Azure AD token via JWKS ─────────────────────────────────────
    const verified = await verifyAzureToken(token);

    const email = verified.preferred_username as string | undefined;
    if (!email) return next(new Error('AUTH_INVALID_TOKEN'));

    // Attach to socket — use email as userId (matches Prisma tbl_user.user_id)
    (socket as AuthenticatedSocket).data.user = {
      userId:    email,
      email,
      firstName: (verified.name as string)?.split(',')[1]?.trim() ?? '',
      lastName:  (verified.name as string)?.split(',')[0]?.trim() ?? '',
    };

    // ── WEB_ACCESS gate ────────────────────────────────────────────────────
    // Checks Valkey cache first → falls back to Prisma if miss.
    const hasWebAccess = await can(email, 'WEB_ACCESS');
    if (!hasWebAccess) {
      console.warn(`[WebSocket] WEB_ACCESS denied for: ${email}`);
      return next(new Error('WEB_ACCESS_DENIED'));
    }

    next();
  } catch (err) {
    console.warn('[WebSocket] Auth failed:', (err as Error).message);
    next(new Error('AUTH_INVALID_TOKEN'));
  }
}

// ---------------------------------------------------------------------------
// Connection handler
// ---------------------------------------------------------------------------

function handleConnection(socket: AuthenticatedSocket): void {
  const { userId, email } = socket.data.user;
  console.log(`[WebSocket] Connected: ${email} (${socket.id})`);

  // Auto-join private user room
  socket.join(rooms.user(userId));

  // ── page:subscribe ─────────────────────────────────────────────────────────
  socket.on(
    'page:subscribe',
    (payload: PageSubscribePayload, ack: (res: AckResponse) => void) =>
      handlePageSubscribe(socket, payload, ack)
  );

  // ── page:unsubscribe ───────────────────────────────────────────────────────
  socket.on('page:unsubscribe', (payload: PageUnsubscribePayload) => {
    const page = payload?.page;
    if (!page || typeof page !== 'string') {
      console.warn(`[WebSocket] ${email} sent page:unsubscribe without a valid page`, payload);
      return;
    }

    const resolvedOrgId = payload?.orgId ?? payload?.org_id;
    let room: string;
    if (page === 'org-detail' && resolvedOrgId) {
      room = rooms.orgDetail(resolvedOrgId);
    } else if (resolvedOrgId) {
      room = rooms.orgPage(resolvedOrgId, page);
    } else {
      room = rooms.page(page);
    }
    socket.leave(room);
    console.log(`[WebSocket] ${email} left room: ${room}`);
  });

  // ── ping / keep-alive ──────────────────────────────────────────────────────
  socket.on('ping', (ack: (res: object) => void) => {
    if (typeof ack === 'function') ack({ pong: true, ts: Date.now() });
  });

  // ── disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', (reason: string) => {
    console.log(`[WebSocket] Disconnected: ${email} reason: ${reason}`);
  });
}

// ---------------------------------------------------------------------------
// page:subscribe handler
// ---------------------------------------------------------------------------

/**
 * Validate permission and add socket to the appropriate room.
 *
 * Client payload: { page: string, orgId?: number }
 * Acknowledgement (optional callback): { ok: bool, room?: string, error?: string }
 */
async function handlePageSubscribe(
  socket: AuthenticatedSocket,
  payload: PageSubscribePayload,
  ack: (res: AckResponse) => void
): Promise<void> {
  const { userId, email } = socket.data.user;
  const respond = typeof ack === 'function' ? ack : (_res: AckResponse) => {};

  try {
    const { page, orgId, org_id } = payload ?? {};
    const resolvedOrgId = orgId ?? org_id;

    if (!page || typeof page !== 'string') {
      respond({ ok: false, error: 'PAGE_REQUIRED' });
      return;
    }

    const config = PAGE_PERMISSIONS[page];

    // Unknown page → deny
    if (config === undefined) {
      socket.emit('page:denied', { page, reason: 'Unknown page' });
      respond({ ok: false, error: 'PAGE_UNKNOWN' });
      return;
    }

    // ── Permission check ───────────────────────────────────────────────────
    const allowed = await checkPageAccess(userId, config, resolvedOrgId);

    if (!allowed) {
      socket.emit('page:denied', { page, orgId: resolvedOrgId, reason: 'Forbidden' });
      respond({ ok: false, error: 'FORBIDDEN' });
      return;
    }

    // ── Join room ─────────────────────────────────────────────────────────────────
    let room: string;
    if (page === 'org-detail' && resolvedOrgId) {
      room = rooms.orgDetail(resolvedOrgId);
    } else if (config?.scope === 'organization' && resolvedOrgId) {
      room = rooms.orgPage(resolvedOrgId, page);
    } else {
      room = rooms.page(page);
    }

    socket.join(room);
    console.log(`[WebSocket] ${email} subscribed to room: ${room}`);

    socket.emit('page:subscribed', { page, orgId: resolvedOrgId ?? null, room });
    respond({ ok: true, room });
  } catch (err) {
    console.error('[WebSocket] page:subscribe error:', err);
    socket.emit('page:error', { page: payload?.page, reason: 'Internal error' });
    respond({ ok: false, error: 'INTERNAL_ERROR' });
  }
}

// ---------------------------------------------------------------------------
// Permission check for page access
// ---------------------------------------------------------------------------

async function checkPageAccess(
  userId: string,
  config: PagePermissionEntry,
  orgId?: number
): Promise<boolean> {
  // No permission required → allow all authenticated users
  if (config === null) return true;

  const { permission, scope } = config;

  // No permission defined (but config exists) → allow
  if (!permission) return true;

  const contextOrgId: number | null = scope === 'organization' ? (orgId ?? null) : null;

  if (Array.isArray(permission)) {
    // ALL permissions required
    const checks = await Promise.all(
      permission.map((p) => can(userId, p, contextOrgId))
    );
    return checks.every(Boolean);
  }

  if (typeof permission === 'object' && 'any' in permission) {
    // ANY permission is enough
    return canAny(userId, permission.any, contextOrgId);
  }

  // Single permission string
  return can(userId, permission, contextOrgId);
}

// ---------------------------------------------------------------------------
// Broadcasting helpers (use from controllers, jobs, etc.)
// ---------------------------------------------------------------------------

/**
 * Broadcast an event to everyone subscribed to a page room.
 * Works across all Node instances (via Valkey adapter).
 */
export function broadcastToPage(
  page: string,
  event: string,
  data: unknown,
  orgId: number | null = null
): void {
  if (!io) throw new Error('[WebSocket] Socket.IO not initialised');
  const room = orgId ? rooms.orgPage(orgId, page) : rooms.page(page);
  io.to(room).emit(event, data);
}

/**
 * Send an event directly to a specific user (all their active sockets).
 */
export function broadcastToUser(userId: string, event: string, data: unknown): void {
  if (!io) throw new Error('[WebSocket] Socket.IO not initialised');
  io.to(rooms.user(userId)).emit(event, data);
}

/**
 * Broadcast to all connected and authenticated users.
 * Use sparingly (e.g. system-wide announcements).
 */
export function broadcastGlobal(event: string, data: unknown): void {
  if (!io) throw new Error('[WebSocket] Socket.IO not initialised');
  io.emit(event, data);
}

/**
 * Broadcast to all users subscribed to the org-detail room for a specific org.
 */
export function broadcastToOrgDetail(orgId: number, event: string, data: unknown): void {
  if (!io) throw new Error('[WebSocket] Socket.IO not initialised');
  io.to(rooms.orgDetail(orgId)).emit(event, data);
}

/**
 * Access raw io instance if needed.
 */
export function getIO(): Server | null {
  return io;
}

// ---------------------------------------------------------------------------
// Valkey channel bridge
// ---------------------------------------------------------------------------
// This allows background jobs, queues, or external services to trigger
// real-time events without having a direct reference to the io instance.
//
// To trigger from a background job:
//   import { pubClient } from '../config/valkey.js';
//   pubClient.publish('channel:page:events', JSON.stringify({ event: 'events:updated', data: {...} }));
//   pubClient.publish('channel:user:someone@email.com', JSON.stringify({ event: 'notification', data: {...} }));
// ---------------------------------------------------------------------------

function _initValkeyBridge(): void {
  // We need a fresh connection for our bridge to avoid interfering with the adapter
  const bridgeSub = subClient.duplicate();

  bridgeSub.psubscribe('channel:page:*', 'channel:user:*', (err: Error | null) => {
    if (err) console.error('[WebSocket] Valkey bridge subscribe error:', err);
    else console.log('[WebSocket] Valkey bridge listening on channel:page:* and channel:user:*');
  });

  bridgeSub.on('pmessage', (_pattern: string, channel: string, message: string) => {
    try {
      const payload = JSON.parse(message) as BridgePayload;
      const { event, data } = payload;

      if (!event) return;

      if (channel.startsWith('channel:page:')) {
        // channel:page:{page}  or  channel:page:org:{orgId}:{page}
        const suffix = channel.replace('channel:page:', '');
        if (suffix.startsWith('org:')) {
          // org-scoped: channel:page:org:1:events → orgId=1 page=events
          const parts = suffix.split(':'); // ['org', '1', 'events']
          const orgId = parts[1];
          const page  = parts.slice(2).join(':');
          io?.to(rooms.orgPage(orgId, page)).emit(event, data);
        } else {
          io?.to(rooms.page(suffix)).emit(event, data);
        }
      } else if (channel.startsWith('channel:user:')) {
        const userId = channel.replace('channel:user:', '');
        io?.to(rooms.user(userId)).emit(event, data);
      }
    } catch (err) {
      console.error('[WebSocket] Bridge message parse error:', err);
    }
  });
}