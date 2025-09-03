const analyticsModel = require('../models/analyticsModel');
const { subscribeToChannel, publishToChannel } = require('./sseController');

async function getLeaderboards(req, res) {
    const { sessionId } = req.query;
    try {
        const leaderboards = await analyticsModel.getLeaderboards();
        if (sessionId) {
            subscribeToChannel(sessionId, "leaderboards");
        }
        res.status(200).json(leaderboards);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the leaderboards.",
        });
    }
}

async function getOrganizationAnalytics(req, res) {
        const { sessionId } = req.query;

        try {
            const organizations = await analyticsModel.getOrganizationAnalytics();
            if (sessionId) {
                subscribeToChannel(sessionId, "analytics_organizations");
            }
            res.status(200).json(organizations);
        } catch (error) {
            res.status(500).json({
                error: error.message || "An error occurred while fetching the organization analytics.",
            });
        }
    }

async function getActivities(req, res) {
        const { sessionId, organization_id } = req.query;

        try {
            const activities = await analyticsModel.getActivities(organization_id);
            if (sessionId) {
                subscribeToChannel(sessionId, "activities");
            }
            res.status(200).json(activities);
        } catch (error) {
            res.status(500).json({
                error: error.message || "An error occurred while fetching the leaderboards.",
            });
        }
    }


async function getOrganizationFinance(req, res){
    const { sessionId, organization_id } = req.query;

    try {
        const finance = await analyticsModel.getOrganizationFinance(organization_id);
        if (sessionId) {
            subscribeToChannel(sessionId, "finance");
        }
        res.status(200).json(finance);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the organization finance.",
        });
    }
}

async function getMemberEngagement(req, res) {
    const { sessionId, organization_id } = req.query;

    try {
        const engagement = await analyticsModel.getMemberEngagement(organization_id);
        if (sessionId) {
            subscribeToChannel(sessionId, "member_engagement");
        }
        res.status(200).json(engagement);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the member engagement.",
        });
    }
}

module.exports = {
    getLeaderboards,
    getActivities,
    getOrganizationAnalytics,
    getOrganizationFinance,
    getMemberEngagement
};
