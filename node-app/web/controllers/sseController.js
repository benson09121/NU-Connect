const { redisClient, redisSubscriber } = require('../../config/redis');
const sessionSubscriptions = new Map();


// Publish updates to any Redis channel
function publishToChannel(channel, data) {
    console.log(`🟢 [BACKEND-SSE-DEBUG] Publishing to channel: ${channel}, data:`, data);
    
    // Fix: Don't spread arrays, preserve them as arrays
    const payload = Array.isArray(data) 
        ? { data, timestamp: Date.now() }
        : { ...data, timestamp: Date.now() };
    
    redisClient.publish(channel, JSON.stringify(payload));
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
            
            // Debug organization channels specifically
            if (channel && (channel.includes('organization') || channel.includes('orghub'))) {
                console.log(`🔴 [BACKEND-SSE-DEBUG] Received message for org channel: ${channel}, subscribed: ${sessionSubscriptions.get(sessionId)?.channels.has(channel)}, data:`, eventData);
            }
            
            // Only send if client is subscribed to this channel
            if (sessionSubscriptions.get(sessionId)?.channels.has(channel)) {
                res.write(`event: ${channel}\n`);
                res.write(`data: ${JSON.stringify(eventData)}\n\n`);
                
                // Debug what we're sending to client
                if (channel && (channel.includes('organization') || channel.includes('orghub'))) {
                    console.log(`🔴 [BACKEND-SSE-DEBUG] Sent to client - channel: ${channel}, data:`, eventData);
                }
            }
        } catch (err) {
            console.error('Error processing message:', err);
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
    if (!session || session.channels.has(channel)) return false;
    
    // Debug organization channels specifically
    if (channel && (channel.includes('organization') || channel.includes('orghub'))) {
        console.log(`🟡 [BACKEND-SSE-DEBUG] Subscribing session ${sessionId} to org channel: ${channel}`);
    }
    
    session.subscriber.subscribe(channel);
    session.channels.add(channel);
    return true;
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
    }
}

module.exports = {
    handleSSEConnection,
    subscribeToChannel,
    unsubscribeFromChannel,
    publishToChannel
};