// WebSocket compatibility adapter for legacy modules that still import
// ../../web/controllers/sseController. This file does NOT implement SSE.

function getWs() {
  const candidates = [
    '../../services/websocketService.ts',
    '../../services/websocketService',
    '../../dist/services/websocketService.js',
  ];

  for (const mod of candidates) {
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      return require(mod);
    } catch {
      // keep trying fallbacks
    }
  }

  return null;
}

function safeEmit(event, payload) {
  try {
    const ws = getWs();
    const io = ws && ws.getIO && ws.getIO();
    if (io) {
      io.emit(event, payload);
    }
  } catch (err) {
    // Keep legacy callers non-fatal if websocket is not ready yet.
    console.warn('[realtime-compat] emit failed:', err?.message || err);
  }
}

function publishToChannel(channel, data) {
  const payload = {
    ...(data && typeof data === 'object' ? data : { data }),
    channel,
    timestamp: Date.now(),
  };

  // Targeted user channels used by legacy code
  if (typeof channel === 'string' && channel.startsWith('user_organizations_')) {
    const email = channel.replace('user_organizations_', '');
    try {
      const ws = getWs();
      if (!ws) return true;
      ws.broadcastToUser(email, channel, payload);
      return true;
    } catch {}
  }

  // Org-detail channel compatibility
  if (typeof channel === 'string' && channel.startsWith('org-detail:')) {
    const raw = channel.replace('org-detail:', '');
    const orgId = Number(raw);
    if (Number.isInteger(orgId) && orgId > 0) {
      try {
        const ws = getWs();
        if (!ws) return true;
        ws.broadcastToOrgDetail(orgId, channel, payload);
        return true;
      } catch {}
    }
  }

  // Page-level best-effort route for known channels
  if (channel === 'events' || channel === 'transactions' || channel === 'accounts') {
    try {
      const ws = getWs();
      if (!ws) return true;
      ws.broadcastToPage(channel, channel, payload);
      return true;
    } catch {}
  }

  // Fallback: global event emission with channel name as event key.
  safeEmit(channel, payload);
  return true;
}

function subscribeToChannel(_sessionId, _channel) {
  // No-op in websocket mode; clients subscribe through socket events.
  return true;
}

function unsubscribeFromChannel(_sessionId, _channel) {
  return true;
}

function getOrgHubChannel(orgId, orgVersionId) {
  return `orghub_${orgId}_${orgVersionId}`;
}

function publishOrgHub({ orgId, orgVersionId, entity, operation, data }) {
  const hubChannel = getOrgHubChannel(orgId, orgVersionId);
  const eventPayload = {
    channel: hubChannel,
    operation,
    entity,
    data: Array.isArray(data) ? data : [data],
    timestamp: Date.now(),
  };

  publishToChannel(hubChannel, eventPayload);

  const entityChannel = `${entity}_${orgId}_${orgVersionId}`;
  publishToChannel(entityChannel, {
    operation,
    data: Array.isArray(data) ? data : [data],
    timestamp: Date.now(),
  });

  return true;
}

function handleSSEConnection(_req, res) {
  // Explicitly signal deprecation if any old SSE endpoint still calls this.
  res.status(410).json({
    ok: false,
    code: 'SSE_REMOVED',
    message: 'SSE has been removed. Use WebSocket subscriptions instead.',
  });
}

module.exports = {
  handleSSEConnection,
  subscribeToChannel,
  unsubscribeFromChannel,
  publishToChannel,
  publishOrgHub,
  getOrgHubChannel,
};
