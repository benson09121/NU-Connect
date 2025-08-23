const msal = require('@azure/msal-node');
const axios = require('axios');
const logModel = require('../models/logModel');
const { publishToChannel, subscribeToChannel } = require('./sseController');

async function getLogs(req, res) {
    try {
        const { user_id, type, start_date, end_date, sessionId } = req.query;

        // allow client to subscribe to logs SSE channel
        if (sessionId) subscribeToChannel(sessionId, 'logs');

        const logs = await logModel.getLogs({ user_id, type, start_date, end_date });
        res.status(200).json(logs);
    } catch (error) {
        console.error('[logs.getLogs]', error);
        res.status(500).json({ error: error.message || "An error occurred while fetching the logs." });
    }
}

async function getSystemCounts(req, res) {
    try {
        const { sessionId } = req.query;

        const counts = await logModel.getSystemCounts();

        // publish counts to SSE channel for realtime dashboards
        try {
            publishToChannel('system_counts', { operation: 'REFRESH', data: counts, timestamp: new Date() });
        } catch (pubErr) {
            console.warn('[logs.getSystemCounts] publish error:', pubErr.message);
        }

        // allow subscribing clients to system_counts
        if (sessionId) subscribeToChannel(sessionId, 'system_counts');

        res.status(200).json(counts || {});
    } catch (error) {
        console.error('[logs.getSystemCounts]', error);
        res.status(500).json({ error: error.message || "An error occurred while fetching system counts." });
    }
}

// New: create a log record via LogAction stored proc (convenience endpoint)
// Body: { user_email, action, type, meta_data, redirect_url, file_path }
// Publishes the new log info to 'logs' channel
async function createLog(req, res) {
    try {
        const { user_email, action, type, meta_data, redirect_url, file_path } = req.body;

        if (!user_email || !action) {
            return res.status(400).json({ error: 'user_email and action are required' });
        }

        await logModel.createLog(user_email, action, type || null, meta_data || null, redirect_url || null, file_path || null);

        const payload = {
            operation: 'CREATE',
            data: { user_email, action, type, meta_data, redirect_url, file_path, timestamp: new Date() }
        };

        try {
            publishToChannel('logs', payload);
        } catch (pubErr) {
            console.warn('[logs.createLog] publish error:', pubErr.message);
        }

        res.status(201).json({ success: true });
    } catch (error) {
        console.error('[logs.createLog]', error);
        res.status(500).json({ error: error.message || "An error occurred while creating the log." });
    }
}

module.exports = {
    getLogs,
    getSystemCounts,
    createLog
};