const pool = require('../../config/db');

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
        return rows[0][0];
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
    } finally {
        connection.release();
    }
}

async function deleteProgram(program_id, email) {
    const connection = await pool.getConnection();
    try {
        await connection.query('CALL DeleteProgram(?, ?);', [program_id, email]);
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