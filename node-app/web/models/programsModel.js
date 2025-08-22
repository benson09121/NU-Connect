const pool = require('../../config/db');
const { publishToChannel } = require('../controllers/sseController');

async function getAllPrograms() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetAllPrograms();');
        return rows[0];
    } catch (error) {
        throw error;
    } finally {
        connection.release();
    }
}

async function getAllColleges() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetAllColleges();');
        return rows[0];
    } catch (error) {
        throw error;
    } finally {
        connection.release();
    }
}

async function createProgram(college_id, name, abbreviation, email) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL CreateProgram(?, ?, ?, ?);',
            [college_id, name, abbreviation, email]
        );
        
        const program = rows[0][0];
        
        // Log the action for audit trail
        try {
            await connection.query(
                'CALL LogAction(?, ?, ?, ?, ?);',
                [email, 'CREATE', 'program', program.program_id, `Created program: ${name} (${abbreviation})`]
            );
        } catch (logError) {
            console.warn('Failed to log program creation:', logError.message);
        }
        
        return program;
    } finally {
        connection.release();
    }
}

async function updateProgram(program_id, college_id, name, abbreviation, email) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL UpdateProgram(?, ?, ?, ?, ?);',
            [program_id, college_id, name, abbreviation, email]
        );
        
        const program = rows[0][0];
        
        // Log the action for audit trail
        try {
            await connection.query(
                'CALL LogAction(?, ?, ?, ?, ?);',
                [email, 'UPDATE', 'program', program_id, `Updated program: ${name} (${abbreviation})`]
            );
        } catch (logError) {
            console.warn('Failed to log program update:', logError.message);
        }
        
        return program;
    } finally {
        connection.release();
    }
}

async function deleteProgram(program_id, email) {
    const connection = await pool.getConnection();
    try {
        // Get program name before deletion for logging
        const [programRows] = await connection.query(
            'SELECT name, abbreviation FROM tbl_programs WHERE program_id = ?', 
            [program_id]
        );
        const programName = programRows[0]?.name || 'Unknown Program';
        const programAbbr = programRows[0]?.abbreviation || '';
        
        await connection.query('CALL DeleteProgram(?, ?);', [program_id, email]);
        
        // Log the action for audit trail
        try {
            await connection.query(
                'CALL LogAction(?, ?, ?, ?, ?);',
                [email, 'DELETE', 'program', program_id, `Deleted program: ${programName} (${programAbbr})`]
            );
        } catch (logError) {
            console.warn('Failed to log program deletion:', logError.message);
        }
        
        return { success: true, message: "Program deleted." };
    } finally {
        connection.release();
    }
}

module.exports = {
    getAllPrograms,
    getAllColleges,
    createProgram,
    updateProgram,
    deleteProgram,
};