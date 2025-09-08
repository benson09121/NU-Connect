const collegesModel = require('../models/collegesModel');
const { publishToChannel, subscribeToChannel } = require('./sseController');

async function createCollege(req, res) {
    console.log('[createCollege] req.body:', req.body, 'req.user:', req.user);
    const { name, abbreviation } = req.body;
    const user_email = req.user?.email || req.body.user_email;
    try {
        const college = await collegesModel.createCollege(name, abbreviation, user_email);

        publishToChannel('colleges_updates', {
            operation: 'CREATE',
            data: college,
            user: user_email,
            timestamp: new Date()
        });

        res.status(201).json({
            success: true,
            message: "College created successfully.",
            data: college
        });
    } catch (error) {
        console.error('[createCollege] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while creating the college."
        });
    }
}

async function updateCollege(req, res) {
    console.log('[updateCollege] req.body:', req.body, 'req.user:', req.user);
    const { college_id, name, abbreviation } = req.body;
    const user_email = req.user?.email || req.body.user_email;
    try {
        const college = await collegesModel.updateCollege(college_id, name, abbreviation, user_email);

        publishToChannel('colleges_updates', {
            operation: 'UPDATE',
            data: college,
            user: user_email,
            timestamp: new Date()
        });

        res.status(200).json({
            success: true,
            message: "College updated successfully.",
            data: college
        });
    } catch (error) {
        console.error('[updateCollege] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while updating the college."
        });
    }
}

async function archiveCollege(req, res) {
    console.log('[archiveCollege] req.body:', req.body, 'req.user:', req.user);
    const { college_id, reason } = req.body;
    const user_email = req.user?.email || req.body.user_email;
    try {
        const college = await collegesModel.archiveCollege(college_id, reason, user_email);

        publishToChannel('colleges_updates', {
            operation: 'ARCHIVE',
            data: college,
            user: user_email,
            timestamp: new Date()
        });

        res.status(200).json({
            success: true,
            message: "College archived successfully.",
            data: college
        });
    } catch (error) {
        console.error('[archiveCollege] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while archiving the college."
        });
    }
}

async function unarchiveCollege(req, res) {
    console.log('[unarchiveCollege] req.body:', req.body, 'req.user:', req.user);
    const { college_id } = req.body;
    const user_email = req.user?.email || req.body.user_email;
    try {
        const college = await collegesModel.unarchiveCollege(college_id, user_email);

        publishToChannel('colleges_updates', {
            operation: 'UNARCHIVE',
            data: college,
            user: user_email,
            timestamp: new Date()
        });

        res.status(200).json({
            success: true,
            message: "College unarchived successfully.",
            data: college
        });
    } catch (error) {
        console.error('[unarchiveCollege] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while unarchiving the college."
        });
    }
}

async function getAllColleges(req, res) {
    console.log('[getAllColleges] req.query:', req.query);
    const { sessionId } = req.query;
    try {
        const colleges = await collegesModel.getAllColleges();
        if (sessionId) {
            subscribeToChannel(sessionId, 'colleges_updates');
        }
        res.json({
            success: true,
            data: colleges
        });
    } catch (error) {
        console.error('[getAllColleges] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while fetching colleges.",
        });
    }
}

module.exports = {
    createCollege,
    updateCollege,
    archiveCollege,
    unarchiveCollege,
    getAllColleges,
};