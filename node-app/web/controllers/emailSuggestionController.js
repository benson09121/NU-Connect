const userCacheModel = require('../models/userCacheModel');
const organizationsModel = require('../models/organizationsModel');

async function getEmailSuggestions(req, res) {
    try {
        const { org_name, email_pattern } = req.query;
        
        if (!org_name || !email_pattern) {
            return res.status(400).json({ 
                error: 'org_name and email_pattern are required' 
            });
        }

        // Check if user has access to this organization


        // Try to get from cache first
        let suggestions = await userCacheModel.searchUsersByEmail(org_name, email_pattern);
        
        // If cache miss, populate cache
        if (!suggestions || suggestions.length === 0) {
            const users = await organizationsModel.getOrganizationUsers(org_name);
            if (users && users.length > 0) {
                await userCacheModel.cacheUsersByOrganization(org_name, users);
                suggestions = await userCacheModel.searchUsersByEmail(org_name, email_pattern);
            }
        }

        res.json({
            suggestions: suggestions || [],
            cached: true
        });
    } catch (error) {
        console.error('Error getting email suggestions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

async function getAllUserEmailSuggestions(req, res) {
    try {
        const { email_pattern } = req.query;
        if (!email_pattern) {
            return res.status(400).json({ error: 'email_pattern is required' });
        }

        let suggestions = await userCacheModel.searchAllUsersByEmail(email_pattern);

        // If cache miss, populate cache from DB
        if (!suggestions || suggestions.length === 0) {
            const users = await organizationsModel.getAllUsers(); // You need to implement this
            if (users && users.length > 0) {
                await userCacheModel.cacheAllUsers(users);
                suggestions = await userCacheModel.searchAllUsersByEmail(email_pattern);
            }
        }

        res.json({ suggestions: suggestions || [], cached: true });
    } catch (error) {
        console.error('Error getting all user email suggestions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

async function refreshOrganizationCache(req, res) {
    try {
        const { org_name } = req.params;
        
        const users = await organizationsModel.getOrganizationUsers(org_name);
        await userCacheModel.cacheUsersByOrganization(org_name, users);
        
        res.json({ message: 'Cache refreshed successfully' });
    } catch (error) {
        console.error('Error refreshing cache:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    getEmailSuggestions,
    refreshOrganizationCache,
    getAllUserEmailSuggestions
};