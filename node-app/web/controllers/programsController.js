const programsModel = require('../models/programsModel');
const logModel = require('../models/logModel');
const { subscribeToChannel, publishToChannel } = require('./sseController');

async function getAllPrograms(req, res) {
    const { sessionId } = req.query;
    try {
        const programs = await programsModel.getAllPrograms();
        
        // Subscribe to real-time updates for programs
        if (sessionId) {
            subscribeToChannel(sessionId, 'programs_updates');
        }
        
        res.json({
            success: true,
            data: programs
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while fetching programs.",
        });
    }
}

async function getAllColleges(req, res) {
    const { sessionId } = req.query;
    try {
        const colleges = await programsModel.getAllColleges();
        
        // Subscribe to real-time updates for colleges
        if (sessionId) {
            subscribeToChannel(sessionId, 'colleges_updates');
        }
        
        res.json({
            success: true,
            data: colleges
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while fetching colleges.",
        });
    }
}

async function createProgram(req, res) {
    const { college_id, name, abbreviation, email } = req.body;
    try {
        const program = await programsModel.createProgram(college_id, name, abbreviation, email);
        
        // Publish real-time update for new program
        publishToChannel('programs_updates', {
            operation: 'CREATE',
            data: program,
            user: req.user?.email || email,
            timestamp: new Date()
        });

        // Log the action centrally (uses LogAction SP)
        try {
            await logModel.createLog(
                req.user?.email || email,                     // p_user_email
                'Created program',                            // p_action (human friendly)
                'program',                                    // p_type
                { program_id: program?.program_id || null, name, abbreviation, college_id }, // p_meta_data
                null,                                         // p_redirect_url
                null                                          // p_file_path
            );

            // publish log to SSE channel
            publishToChannel('logs', {
                operation: 'CREATE',
                data: { user: req.user?.email || email, action: 'Created program', meta: { program_id: program?.program_id || null } },
                timestamp: new Date()
            });
        } catch (logErr) {
            console.warn('[programs.createProgram] log error:', logErr.message);
        }
        
        res.status(201).json({
            success: true,
            message: "Program created successfully.",
            data: program
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message || "An error occurred while creating the program." 
        });
    }
}

async function updateProgram(req, res) {
    const { program_id, college_id, name, abbreviation, email } = req.body;
    try {
        const program = await programsModel.updateProgram(program_id, college_id, name, abbreviation, email);
        
        // Publish real-time update for program modification
        publishToChannel('programs_updates', {
            operation: 'UPDATE',
            data: program,
            user: req.user?.email || email,
            timestamp: new Date()
        });

        // Log the action centrally
        try {
            await logModel.createLog(
                req.user?.email || email,
                'Updated program',
                'program',
                { program_id, name, abbreviation, college_id },
                null,
                null
            );

            publishToChannel('logs', {
                operation: 'UPDATE',
                data: { user: req.user?.email || email, action: 'Updated program', meta: { program_id } },
                timestamp: new Date()
            });
        } catch (logErr) {
            console.warn('[programs.updateProgram] log error:', logErr.message);
        }
        
        res.status(200).json({
            success: true,
            message: "Program updated successfully.",
            data: program
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message || "An error occurred while updating the program." 
        });
    }
}

async function deleteProgram(req, res) {
    const { program_id, email } = req.body;
    try {
        const result = await programsModel.deleteProgram(program_id, email);
        
        // Publish real-time update for program deletion
        publishToChannel('programs_updates', {
            operation: 'DELETE',
            data: { program_id },
            user: req.user?.email || email,
            timestamp: new Date()
        });

        // Log the action centrally
        try {
            await logModel.createLog(
                req.user?.email || email,
                'Deleted program',
                'program',
                { program_id },
                null,
                null
            );

            publishToChannel('logs', {
                operation: 'DELETE',
                data: { user: req.user?.email || email, action: 'Deleted program', meta: { program_id } },
                timestamp: new Date()
            });
        } catch (logErr) {
            console.warn('[programs.deleteProgram] log error:', logErr.message);
        }
        
        res.status(200).json({
            success: true,
            message: "Program deleted successfully.",
            data: result
        });
    } catch (error) {
        // Check for MySQL foreign key constraint error
        if (
            error.code === 'ER_ROW_IS_REFERENCED_2' ||
            (error.message && error.message.includes('a foreign key constraint fails'))
        ) {
            return res.status(400).json({
                success: false,
                error: "Cannot delete this program because it is still assigned to one or more users. Please reassign or remove those users first."
            });
        }
        res.status(500).json({ 
            success: false,
            error: error.message || "An error occurred while deleting the program." 
        });
    }
}

async function archiveProgram(req, res) {
    const { program_id, reason } = req.body;
    const user_id = req.user?.user_id || req.body.user_id;
    try {
        const program = await programsModel.archiveProgram(program_id, user_id, reason);
        publishToChannel('programs_updates', {
            operation: 'UPDATE',
            data: program,
            user: req.user?.email,
            timestamp: new Date()
        });
        res.status(200).json({
            success: true,
            message: "Program archived successfully.",
            data: program
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while archiving the program."
        });
    }
}

async function unarchiveProgram(req, res) {
    const { program_id, reason } = req.body;
    const user_id = req.user?.user_id || req.body.user_id;
    try {
        const program = await programsModel.unarchiveProgram(program_id, user_id, reason);
        publishToChannel('programs_updates', {
            operation: 'UPDATE',
            data: program,
            user: req.user?.email,
            timestamp: new Date()
        });
        res.status(200).json({
            success: true,
            message: "Program unarchived successfully.",
            data: program
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while unarchiving the program."
        });
    }
}


module.exports = {
    getAllPrograms,
    getAllColleges,
    createProgram,
    updateProgram,
    deleteProgram,
    archiveProgram,      // <-- add this
    unarchiveProgram 
};