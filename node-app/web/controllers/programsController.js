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
    const { college_id, name, abbreviation } = req.body;
    const email = req.user?.email || req.body.email;
    
    try {
        // Validate required fields
        if (!college_id) {
            return res.status(400).json({
                success: false,
                error: "Please select a college."
            });
        }
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: "Program name is required."
            });
        }
        
        if (!abbreviation || abbreviation.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: "Program abbreviation is required."
            });
        }
        
        if (!email) {
            return res.status(400).json({
                success: false,
                error: "User authentication required."
            });
        }

        const program = await programsModel.createProgram(college_id, name, abbreviation, email);

        publishToChannel('programs_updates', {
            operation: 'CREATE',
            data: program,
            user: email,
            timestamp: new Date()
        });

        res.status(201).json({
            success: true,
            message: "Program created successfully.",
            data: program
        });
    } catch (error) {
        console.error('[createProgram] Error:', error);
        console.error('[createProgram] Error details:', {
            message: error.message,
            code: error.code,
            sqlState: error.sqlState,
            errno: error.errno
        });
        
        let message = "An error occurred while creating the program.";
        let statusCode = 400;
        
        // Handle specific MySQL errors
        if (error.code === 'ER_DUP_ENTRY') {
            if (error.message.includes('program_name')) {
                message = "A program with this name already exists in the selected college.";
            } else if (error.message.includes('program_abbreviation')) {
                message = "A program with this abbreviation already exists.";
            } else {
                message = "A program with this name or abbreviation already exists.";
            }
        } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            if (error.message.includes('college')) {
                message = "The selected college does not exist. Please refresh and try again.";
            } else {
                message = "Invalid reference data. Please refresh and try again.";
            }
        } else if (error.code === 'ER_BAD_NULL_VALUE') {
            message = "Required information is missing. Please fill in all required fields.";
        } else if (error.message) {
            // Handle custom stored procedure errors
            const errorMsg = error.message.toLowerCase();
            if (errorMsg.includes('program name or abbreviation already exists')) {
                message = "A program with this name or abbreviation already exists.";
            } else if (errorMsg.includes('user not found for provided email')) {
                message = "User authentication failed. Please log in again.";
                statusCode = 401;
            } else if (errorMsg.includes('college not found')) {
                message = "The selected college does not exist. Please refresh and try again.";
            } else if (errorMsg.includes('cannot create program under an archived college')) {
                message = "Cannot create a program under an archived college. Please select an active college.";
            } else if (errorMsg.includes('permission') || errorMsg.includes('not authorized')) {
                message = "You do not have permission to create programs.";
                statusCode = 403;
            }
        }
        
        res.status(statusCode).json({
            success: false,
            error: message
        });
    }
}

async function updateProgram(req, res) {
    const { program_id, college_id, name, abbreviation } = req.body;
    const email = req.user?.email || req.body.email;
    
    try {
        // Validate required fields
        if (!program_id) {
            return res.status(400).json({
                success: false,
                error: "Program ID is required."
            });
        }
        
        if (!college_id) {
            return res.status(400).json({
                success: false,
                error: "Please select a college."
            });
        }
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: "Program name is required."
            });
        }
        
        if (!abbreviation || abbreviation.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: "Program abbreviation is required."
            });
        }
        
        if (!email) {
            return res.status(400).json({
                success: false,
                error: "User authentication required."
            });
        }

        const program = await programsModel.updateProgram(program_id, college_id, name, abbreviation, email);

        publishToChannel('programs_updates', {
            operation: 'UPDATE',
            data: program,
            user: email,
            timestamp: new Date()
        });

        res.status(200).json({
            success: true,
            message: "Program updated successfully.",
            data: program
        });
    } catch (error) {
        console.error('[updateProgram] Error:', error);
        console.error('[updateProgram] Error details:', {
            message: error.message,
            code: error.code,
            sqlState: error.sqlState,
            errno: error.errno
        });
        
        let message = "An error occurred while updating the program.";
        let statusCode = 400;
        
        // Handle specific MySQL errors
        if (error.code === 'ER_DUP_ENTRY') {
            if (error.message.includes('program_name')) {
                message = "A program with this name already exists in the selected college.";
            } else if (error.message.includes('program_abbreviation')) {
                message = "A program with this abbreviation already exists.";
            } else {
                message = "A program with this name or abbreviation already exists.";
            }
        } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            if (error.message.includes('college')) {
                message = "The selected college does not exist. Please refresh and try again.";
            } else {
                message = "Invalid reference data. Please refresh and try again.";
            }
        } else if (error.code === 'ER_BAD_NULL_VALUE') {
            message = "Required information is missing. Please fill in all required fields.";
        } else if (error.message) {
            // Handle custom stored procedure errors
            const errorMsg = error.message.toLowerCase();
            if (errorMsg.includes('program name or abbreviation already exists')) {
                message = "A program with this name or abbreviation already exists.";
            } else if (errorMsg.includes('user not found for provided email')) {
                message = "User authentication failed. Please log in again.";
                statusCode = 401;
            } else if (errorMsg.includes('program not found')) {
                message = "The program you are trying to update does not exist or may have been deleted.";
                statusCode = 404;
            } else if (errorMsg.includes('college not found')) {
                message = "The selected college does not exist. Please refresh and try again.";
            } else if (errorMsg.includes('cannot move program into an archived college')) {
                message = "Cannot move a program to an archived college. Please select an active college.";
            } else if (errorMsg.includes('permission') || errorMsg.includes('not authorized')) {
                message = "You do not have permission to update this program.";
                statusCode = 403;
            }
        }
        
        res.status(statusCode).json({
            success: false,
            error: message
        });
    }
}

async function archiveProgram(req, res) {
    const { program_id, reason } = req.body;
    const email = req.user?.email || req.body.email;
    try {
        const program = await programsModel.archiveProgram(program_id, email, reason);

        publishToChannel('programs_updates', {
            operation: 'ARCHIVE',
            data: program,
            user: email,
            timestamp: new Date()
        });

        res.status(200).json({
            success: true,
            message: "Program archived successfully.",
            data: program
        });
    } catch (error) {
        console.error('[archiveProgram] Error:', error);
        let message = error.message || "An error occurred while archiving the program.";
        if (message.includes('already archived')) {
            message = "This program is already archived.";
        } else if (message.includes('Program not found')) {
            message = "The program you are trying to archive does not exist.";
        }
        res.status(400).json({
            success: false,
            error: message
        });
    }
}

async function unarchiveProgram(req, res) {
    const { program_id } = req.body;
    const email = req.user?.email || req.body.email;
    try {
        const program = await programsModel.unarchiveProgram(program_id, email);

        publishToChannel('programs_updates', {
            operation: 'UNARCHIVE',
            data: program,
            user: email,
            timestamp: new Date()
        });

        res.status(200).json({
            success: true,
            message: "Program unarchived successfully.",
            data: program
        });
    } catch (error) {
        console.error('[unarchiveProgram] Error:', error);
        let message = error.message || "An error occurred while unarchiving the program.";
        if (message.includes('not archived')) {
            message = "This program is not archived.";
        } else if (message.includes('Program not found')) {
            message = "The program you are trying to unarchive does not exist.";
        }
        res.status(400).json({
            success: false,
            error: message
        });
    }
}

async function deleteProgram(req, res) {
    const { program_id } = req.body;
    const email = req.user?.email || req.body.email;
    try {
        const result = await programsModel.deleteProgram(program_id, email);

        publishToChannel('programs_updates', {
            operation: 'DELETE',
            data: { program_id },
            user: email,
            timestamp: new Date()
        });

        res.status(200).json({
            success: true,
            message: "Program deleted (archived) successfully.",
            data: result
        });
    } catch (error) {
        console.error('[deleteProgram] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while deleting the program."
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