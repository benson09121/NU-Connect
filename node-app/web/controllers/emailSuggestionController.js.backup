const userCacheModel = require('../models/userCacheModel');
const organizationsModel = require('../models/organizationsModel');

function toInt(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

async function getEmailSuggestions(req, res) {
  try {
    const org_id = toInt(req.query.org_id);
    const org_version_id = toInt(req.query.org_version_id);
    const email_pattern = (req.query.email_pattern || '').trim();

    if (!org_id || !org_version_id || !email_pattern) {
      return res.status(400).json({
        error: 'org_id, org_version_id, and email_pattern are required',
      });
    }
    let suggestions = await userCacheModel.searchUsersByEmail(
      org_id,
      org_version_id,
      email_pattern
    );

    let cacheWarmed = true;

    if (!suggestions || suggestions.length === 0) {
      // Cache miss => hydrate cache from DB
      const users = await organizationsModel.getOrganizationUsers(org_id, org_version_id);
      if (users && users.length > 0) {
        await userCacheModel.cacheUsersByOrganization(org_id, org_version_id, users);
        suggestions = await userCacheModel.searchUsersByEmail(
          org_id,
          org_version_id,
          email_pattern
        );
      }
      cacheWarmed = true;
    }

    res.json({
      suggestions: suggestions || [],
      cached: cacheWarmed,
    });
  } catch (error) {
    console.error('Error getting email suggestions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getAllUserEmailSuggestions(req, res) {
  try {
    const email_pattern = (req.query.email_pattern || '').trim();
    if (!email_pattern) {
      return res.status(400).json({ error: 'email_pattern is required' });
    }

    let suggestions = await userCacheModel.searchAllUsersByEmail(email_pattern);

    if (!suggestions || suggestions.length === 0) {
      const users = await organizationsModel.getAllUsers(); // implemented below
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
    const org_id = toInt(req.params.org_id);
    const org_version_id = toInt(req.params.org_version_id);

    if (!org_id || !org_version_id) {
      return res.status(400).json({ error: 'org_id and org_version_id are required' });
    }

    const users = await organizationsModel.getOrganizationUsers(org_id, org_version_id);
    await userCacheModel.cacheUsersByOrganization(org_id, org_version_id, users);

    res.json({ message: 'Cache refreshed successfully' });
  } catch (error) {
    console.error('Error refreshing cache:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  getEmailSuggestions,
  refreshOrganizationCache,
  getAllUserEmailSuggestions,
};