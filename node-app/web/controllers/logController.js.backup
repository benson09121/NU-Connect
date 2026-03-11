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

async function getOrgRelevantLogs(req, res) {
    try {
        let { user_id, user_email, type, start_date, end_date, sessionId } = req.query;

        // If user_id is not provided but user_email is, look up user_id
        if ((!user_id || user_id === 'undefined' || user_id === 'null') && user_email) {
            // You need a getUserByEmail function in your user model
            const userModel = require('../models/userModel'); // adjust path if needed
            const user = await userModel.getUserByEmail(user_email);
            if (!user) {
                return res.status(404).json({ message: "User not found for the provided email." });
            }
            user_id = user.user_id;
        }

        // allow client to subscribe to org logs SSE channel
        if (sessionId) subscribeToChannel(sessionId, 'org_logs');

        const logs = await logModel.getOrgRelevantLogs({ user_id, type, start_date, end_date });
        res.status(200).json(logs);
    } catch (error) {
        console.error('[logs.getOrgRelevantLogs]', error);
        res.status(500).json({ error: error.message || "An error occurred while fetching the org relevant logs." });
    }
}

async function getSystemCounts(req, res) {
    try {
        const { user_id: queryUserId, sessionId } = req.query;
        // Prefer explicit query param, else use JWT user_id if available
        const user_id = queryUserId ?? req.user?.user_id ?? null;

        const counts = await logModel.getSystemCounts(user_id);

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
    getOrgRelevantLogs,
    getSystemCounts,
    createLog
};