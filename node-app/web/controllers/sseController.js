const { redisClient, redisSubscriber } = require('../../config/redis');
const sessionSubscriptions = new Map();


// Publish updates to any Redis channel
function publishToChannel(channel, data) {
    // Reduced logging to avoid flooding console with large data arrays
    const dataPreview = Array.isArray(data) 
        ? `Array(${data.length} items)`
        : typeof data === 'object' 
            ? `Object(${Object.keys(data).length} keys)`
            : data;
    
    
    // Fix: Don't spread arrays, preserve them as arrays
    const payload = Array.isArray(data) 
        ? { data, timestamp: Date.now() }
        : { ...data, timestamp: Date.now() };
    
    const result = redisClient.publish(channel, JSON.stringify(payload));
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
            
            // Reduced logging - only show summary for large data
            const dataPreview = eventData.data && Array.isArray(eventData.data)
                ? `${eventData.operation || 'data'} - Array(${eventData.data.length} items)`
                : eventData.operation
                    ? `${eventData.operation} - ${typeof eventData.data}`
                    : 'data update';
            
           
            // Only send if client is subscribed to this channel
            if (sessionSubscriptions.get(sessionId)?.channels.has(channel)) {
                res.write(`event: ${channel}\n`);
                res.write(`data: ${JSON.stringify(eventData)}\n\n`);
            } else {
               
            }
        } catch (err) {
          
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
    
    const session = sessionSubscriptions.get(sessionId);
    if (!session) {
        return false;
    }
    
    if (session.channels.has(channel)) {
        return true; // Changed from false to true - already subscribed should be success
    }
    
    // Debug organization channels specifically
    if (channel && (channel.includes('organization') || channel.includes('orghub') || channel.startsWith('user_organizations_'))) {
   
    }
    
    try {
        session.subscriber.subscribe(channel);
        session.channels.add(channel);
        return true;
    } catch (error) {
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
    const session = sessionSubscriptions.get(sessionId);
    if (session) {
        session.subscriber.unsubscribe();
        session.subscriber.quit();
        sessionSubscriptions.delete(sessionId);
    } else {
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