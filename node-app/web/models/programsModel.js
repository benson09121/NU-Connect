const pool = require('../../config/db');
const { publishToChannel } = require('../controllers/sseController');

async function getAllPrograms() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetAllPrograms();');
        return rows[0];
    } catch (error) {
        console.error('Error in getAllPrograms:', error);
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
        console.error('Error in getAllColleges:', error);
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
        
        // Log the action for audit trail (matches LogAction signature)
        try {
            await connection.query(
                'CALL LogAction(?, ?, ?, ?, ?, ?);',
                [
                    email,                                           // p_user_email
                    'CREATE',                                        // p_action
                    'program',                                       // p_type
                    JSON.stringify({                                 // p_meta_data (JSON)
                        program_id: program?.program_id || null,
                        name,
                        abbreviation,
                        college_id
                    }),
                    null,                                            // p_redirect_url -> set to null
                    null                                             // p_file_path
                ]
            );
        } catch (logError) {
            console.warn('Failed to log program creation:', logError.message);
        }
        
        return program;
    } catch (error) {
        console.error('Error in createProgram:', error);
        throw error;
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
        
        // Log the action for audit trail (matches LogAction signature)
        try {
            await connection.query(
                'CALL LogAction(?, ?, ?, ?, ?, ?);',
                [
                    email,                                           // p_user_email
                    'UPDATE',                                        // p_action
                    'program',                                       // p_type
                    JSON.stringify({                                 // p_meta_data
                        program_id,
                        name,
                        abbreviation,
                        college_id
                    }),
                    null,                                            // p_redirect_url -> set to null
                    null                                             // p_file_path
                ]
            );
        } catch (logError) {
            console.warn('Failed to log program update:', logError.message);
        }
        
        return program;
    } catch (error) {
        console.error('Error in updateProgram:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function deleteProgram(program_id, email) {
    const connection = await pool.getConnection();
    try {
        // Get program name before deletion for logging
        const [programRows] = await connection.query(
            'SELECT name, abbreviation FROM tbl_program WHERE program_id = ?', 
            [program_id]
        );
        const programName = programRows[0]?.name || 'Unknown Program';
        const programAbbr = programRows[0]?.abbreviation || '';
        
        await connection.query('CALL DeleteProgram(?, ?);', [program_id, email]);
        
        // Log the action for audit trail (matches LogAction signature)
        try {
            await connection.query(
                'CALL LogAction(?, ?, ?, ?, ?, ?);',
                [
                    email,                                           // p_user_email
                    'DELETE',                                        // p_action
                    'program',                                       // p_type
                    JSON.stringify({                                 // p_meta_data
                        program_id,
                        name: programName,
                        abbreviation: programAbbr
                    }),
                    null,                                            // p_redirect_url -> set to null
                    null                                             // p_file_path
                ]
            );
        } catch (logError) {
            console.warn('Failed to log program deletion:', logError.message);
        }
        
        return { success: true, message: "Program deleted." };
    } catch (error) {
        console.error('Error in deleteProgram:', error);
        throw error;
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