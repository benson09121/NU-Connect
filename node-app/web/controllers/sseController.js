const { redisClient, redisSubscriber } = require('../../config/redis');
const sessionSubscriptions = new Map();


// Publish updates to any Redis channel
function publishToChannel(channel, data) {
    console.log(`🟢 [BACKEND-SSE-DEBUG] Publishing to channel: ${channel}, data:`, data);
    
    // Fix: Don't spread arrays, preserve them as arrays
    const payload = Array.isArray(data) 
        ? { data, timestamp: Date.now() }
        : { ...data, timestamp: Date.now() };
    
    console.log(`🔍 [BACKEND-SSE-DEBUG] About to publish to Redis channel: ${channel}, payload:`, payload);
    const result = redisClient.publish(channel, JSON.stringify(payload));
    console.log(`🔍 [BACKEND-SSE-DEBUG] Redis publish result:`, result);
    return result;
}

// Handle SSE connections
async function handleSSEConnection(req, res) {
    const sessionId = req.query.sessionId || generateSessionId();

    // Only accept one connection per sessionId
    if (sessionSubscriptions.has(sessionId)) {
        res.status(409).write('event: error\n');
        res.write(`data: ${JSON.stringify({ message: 'SSE connection already exists for this session.' })}\n\n`);
        res.end();
        return;
    }
    
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    // Create dedicated Redis subscriber for this session
    const subscriber = redisClient.duplicate();
    // Only connect if not already connecting/connected
    if (subscriber.status === 'end') {
        await subscriber.connect();
    }
    
    // Store session
    sessionSubscriptions.set(sessionId, {
        res,
        subscriber,
        channels: new Set()
    });
    
    // Send session ID
    res.write(`event: session\n`);
    res.write(`data: ${JSON.stringify({ sessionId })}\n\n`);
    
    // Handle Redis messages
    subscriber.on('message', (channel, message) => {
        try {
            const eventData = JSON.parse(message);
            
            console.log(`🔵 [BACKEND-SSE-DEBUG] Redis message received on channel: ${channel}`, eventData);
            
            // Debug organization channels specifically
            if (channel && (channel.includes('organization') || channel.includes('orghub') || channel.startsWith('user_organizations_'))) {
                console.log(`🔴 [BACKEND-SSE-DEBUG] Received message for org channel: ${channel}, subscribed: ${sessionSubscriptions.get(sessionId)?.channels.has(channel)}, data:`, eventData);
            }
            
            // Only send if client is subscribed to this channel
            if (sessionSubscriptions.get(sessionId)?.channels.has(channel)) {
                console.log(`✅ [BACKEND-SSE-DEBUG] Forwarding message to client for channel: ${channel}`);
                res.write(`event: ${channel}\n`);
                res.write(`data: ${JSON.stringify(eventData)}\n\n`);
                
                // Debug what we're sending to client
                if (channel && (channel.includes('organization') || channel.includes('orghub') || channel.startsWith('user_organizations_'))) {
                    console.log(`🔴 [BACKEND-SSE-DEBUG] Sent to client - channel: ${channel}, data:`, eventData);
                }
            } else {
                console.log(`❌ [BACKEND-SSE-DEBUG] Client not subscribed to channel: ${channel}, available channels:`, 
                    Array.from(sessionSubscriptions.get(sessionId)?.channels || []));
            }
        } catch (err) {
            console.error(`❌ [BACKEND-SSE-DEBUG] Error processing Redis message for channel ${channel}:`, err);
        }
    });
    
    // Keep connection alive
    const keepAlive = setInterval(() => {
        res.write(': keep-alive\n\n');
    }, 20000);
    
    // Handle disconnect
    req.on('close', () => {
        clearInterval(keepAlive);
        cleanupSession(sessionId);
    });
}

// Subscribe session to a channel
function subscribeToChannel(sessionId, channel) {
    console.log(`🔍 [BACKEND-SSE-DEBUG] Attempting to subscribe session ${sessionId} to channel: ${channel}`);
    console.log(`🔍 [BACKEND-SSE-DEBUG] Current sessions:`, Array.from(sessionSubscriptions.keys()));
    
    const session = sessionSubscriptions.get(sessionId);
    if (!session) {
        console.log(`❌ [BACKEND-SSE-DEBUG] No session found for ${sessionId}`);
        console.log(`🔍 [BACKEND-SSE-DEBUG] Available sessions:`, Array.from(sessionSubscriptions.keys()));
        return false;
    }
    
    console.log(`✅ [BACKEND-SSE-DEBUG] Session ${sessionId} found, current channels:`, Array.from(session.channels));
    
    if (session.channels.has(channel)) {
        console.log(`⚠️ [BACKEND-SSE-DEBUG] Session ${sessionId} already subscribed to channel: ${channel}`);
        return true; // Changed from false to true - already subscribed should be success
    }
    
    // Debug organization channels specifically
    if (channel && (channel.includes('organization') || channel.includes('orghub') || channel.startsWith('user_organizations_'))) {
        console.log(`🟡 [BACKEND-SSE-DEBUG] Subscribing session ${sessionId} to org channel: ${channel}`);
    }
    
    try {
        session.subscriber.subscribe(channel);
        session.channels.add(channel);
        console.log(`✅ [BACKEND-SSE-DEBUG] Successfully subscribed session ${sessionId} to channel: ${channel}. Total channels: ${session.channels.size}`);
        return true;
    } catch (error) {
        console.error(`❌ [BACKEND-SSE-DEBUG] Failed to subscribe session ${sessionId} to channel: ${channel}`, error);
        return false;
    }
}

// Unsubscribe from channel
function unsubscribeFromChannel(sessionId, channel) {
    const session = sessionSubscriptions.get(sessionId);
    if (!session || !session.channels.has(channel)) return false;
    
    session.subscriber.unsubscribe(channel);
    session.channels.delete(channel);
    return true;
}

// Helper functions
function generateSessionId() {
    return require('crypto').randomBytes(16).toString('hex');
}

function cleanupSession(sessionId) {
    console.log(`🧹 [BACKEND-SSE-DEBUG] Cleaning up session: ${sessionId}`);
    const session = sessionSubscriptions.get(sessionId);
    if (session) {
        console.log(`🧹 [BACKEND-SSE-DEBUG] Session ${sessionId} had ${session.channels.size} channels subscribed`);
        session.subscriber.unsubscribe();
        session.subscriber.quit();
        sessionSubscriptions.delete(sessionId);
        console.log(`🧹 [BACKEND-SSE-DEBUG] Session ${sessionId} cleaned up successfully`);
    } else {
        console.log(`⚠️ [BACKEND-SSE-DEBUG] Attempted to cleanup non-existent session: ${sessionId}`);
    }
}

// Helper to get org hub channel name
function getOrgHubChannel(orgId, orgVersionId) {
    return `orghub_${orgId}_${orgVersionId}`;
}

// Unified publishing function for organization hub pattern
// Publishes to BOTH hub channel and entity-specific channel
function publishOrgHub({ orgId, orgVersionId, entity, operation, data }) {
  const hubChannel = getOrgHubChannel(orgId, orgVersionId);
  
  console.log(`📡 [PUBLISH-ORG-HUB] Called with:`, {
    orgId,
    orgVersionId,
    entity,
    operation,
    dataCount: Array.isArray(data) ? data.length : 1,
    hubChannel
  });
  
  // Format that matches what RealTimeContext expects
  const hubEvent = {
    channel: hubChannel,
    operation,
    entity, // Include entity type for proper frontend identification
    data: Array.isArray(data) ? data : [data],
    timestamp: Date.now()
  };
  
  console.log(`📡 [PUBLISH-ORG-HUB] Publishing hub event to ${hubChannel}:`, {
    operation: hubEvent.operation,
    entity: hubEvent.entity,
    dataCount: hubEvent.data.length
  });
  
  // Publish to hub channel
  publishToChannel(hubChannel, hubEvent);
  
  // Also publish to entity-specific channel for backward compatibility
  const entityChannel = `${entity}_${orgId}_${orgVersionId}`;
  
  console.log(`📡 [PUBLISH-ORG-HUB] Publishing to entity channel ${entityChannel}`);
  
  publishToChannel(entityChannel, {
    operation,
    data: Array.isArray(data) ? data : [data],
    timestamp: Date.now()
  });
  
  console.log(`✅ [PUBLISH-ORG-HUB] Published to both channels successfully`);
}

module.exports = {
    handleSSEConnection,
    subscribeToChannel,
    unsubscribeFromChannel,
    publishToChannel,
    publishOrgHub,
    getOrgHubChannel
};