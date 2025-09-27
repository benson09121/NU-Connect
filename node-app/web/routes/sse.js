const express = require('express');
const router = express.Router();
const middleware = require('../../middlewares/middleWare');
const sseController = require('../controllers/sseController');

// SSE connection endpoint
router.get('/sse', middleware.validateAzureJWT, sseController.handleSSEConnection);

// Subscribe to channel endpoint
router.post('/subscribe', middleware.validateAzureJWT, async (req, res) => {
    try {
        const { sessionId, channel } = req.body;
        
        if (!sessionId || !channel) {
            return res.status(400).json({ error: 'sessionId and channel are required' });
        }
        
        console.log(`🟢 [SSE-SUBSCRIBE] Subscribing session ${sessionId} to channel: ${channel}`);
        
        const success = sseController.subscribeToChannel(sessionId, channel);
        
        if (success) {
            res.json({ success: true, message: `Subscribed to channel: ${channel}` });
        } else {
            res.status(400).json({ error: 'Failed to subscribe to channel' });
        }
    } catch (error) {
        console.error('Subscribe endpoint error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;