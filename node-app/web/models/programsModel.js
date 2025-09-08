const pool = require('../../config/db');

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
        return rows[0][0];
    } catch (error) {
        console.error('[programsModel.createProgram] Database error:', error);
        
        // Handle specific stored procedure error messages
        if (error.message) {
            const errorMsg = error.message.toLowerCase();
            if (errorMsg.includes('program name or abbreviation already exists')) {
                throw new Error('Program name or abbreviation already exists');
            } else if (errorMsg.includes('user not found for provided email')) {
                throw new Error('User not found for provided email');
            } else if (errorMsg.includes('college not found')) {
                throw new Error('College not found');
            } else if (errorMsg.includes('cannot create program under an archived college')) {
                throw new Error('Cannot create program under an archived college');
            }
        }
        
        // Re-throw with more specific error information for MySQL errors
        if (error.code === 'ER_DUP_ENTRY') {
            if (error.message.includes('program_name')) {
                throw new Error('A program with this name already exists in the selected college');
            } else if (error.message.includes('program_abbreviation')) {
                throw new Error('A program with this abbreviation already exists');
            } else {
                throw new Error('A program with this name or abbreviation already exists');
            }
        } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            throw new Error('The selected college does not exist');
        } else if (error.code === 'ER_BAD_NULL_VALUE') {
            throw new Error('Required information is missing');
        }
        
        // Re-throw the original error if it's not a recognized database error
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
        return rows[0][0];
    } catch (error) {
        console.error('[programsModel.updateProgram] Database error:', error);
        
        // Handle specific stored procedure error messages
        if (error.message) {
            const errorMsg = error.message.toLowerCase();
            if (errorMsg.includes('program name or abbreviation already exists')) {
                throw new Error('Program name or abbreviation already exists');
            } else if (errorMsg.includes('user not found for provided email')) {
                throw new Error('User not found for provided email');
            } else if (errorMsg.includes('program not found')) {
                throw new Error('Program not found');
            } else if (errorMsg.includes('college not found')) {
                throw new Error('College not found');
            } else if (errorMsg.includes('cannot move program into an archived college')) {
                throw new Error('Cannot move program into an archived college');
            }
        }
        
        // Re-throw with more specific error information for MySQL errors
        if (error.code === 'ER_DUP_ENTRY') {
            if (error.message.includes('program_name')) {
                throw new Error('A program with this name already exists in the selected college');
            } else if (error.message.includes('program_abbreviation')) {
                throw new Error('A program with this abbreviation already exists');
            } else {
                throw new Error('A program with this name or abbreviation already exists');
            }
        } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            throw new Error('The selected college does not exist');
        } else if (error.code === 'ER_BAD_NULL_VALUE') {
            throw new Error('Required information is missing');
        }
        
        // Re-throw the original error if it's not a recognized database error
        throw error;
    } finally {
        connection.release();
    }
}

async function archiveProgram(program_id, user_email, reason) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL ArchiveProgram(?, ?, ?);',
            [program_id, user_email, reason]
        );
        return rows[0][0];
    } finally {
        connection.release();
    }
}

async function unarchiveProgram(program_id, user_email) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL UnarchiveProgram(?, ?);',
            [program_id, user_email]
        );
        return rows[0][0];
    } finally {
        connection.release();
    }
}

async function deleteProgram(program_id, email) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL DeleteProgram(?, ?);',
            [program_id, email]
        );
        return rows[0][0];
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
    archiveProgram, 
    unarchiveProgram 
};