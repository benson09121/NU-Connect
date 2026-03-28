const pool = require('../../config/db');

async function createCollege(name, abbreviation, user_email) {
    console.log('[collegesModel.createCollege] args:', { name, abbreviation, user_email });
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL CreateCollege(?, ?, ?);',
            [name, abbreviation, user_email]
        );
        console.log('[collegesModel.createCollege] result:', rows[0][0]);
        return rows[0][0];
    } finally {
        connection.release();
    }
}

async function updateCollege(college_id, name, abbreviation, user_email) {
    console.log('[collegesModel.updateCollege] args:', { college_id, name, abbreviation, user_email });
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL UpdateCollege(?, ?, ?, ?);',
            [college_id, name, abbreviation, user_email]
        );
        console.log('[collegesModel.updateCollege] result:', rows[0][0]);
        return rows[0][0];
    } finally {
        connection.release();
    }
}

async function archiveCollege(college_id, reason, user_email) {
    console.log('[collegesModel.archiveCollege] args:', { college_id, reason, user_email });
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL ArchiveCollege(?, ?, ?);',
            [college_id, reason, user_email]
        );
        console.log('[collegesModel.archiveCollege] result:', rows[0][0]);
        return rows[0][0];
    } finally {
        connection.release();
    }
}

async function unarchiveCollege(college_id, user_email) {
    console.log('[collegesModel.unarchiveCollege] args:', { college_id, user_email });
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL UnarchiveCollege(?, ?);',
            [college_id, user_email]
        );
        console.log('[collegesModel.unarchiveCollege] result:', rows[0][0]);
        return rows[0][0];
    } finally {
        connection.release();
    }
}

async function getAllColleges() {
    console.log('[collegesModel.getAllColleges] called');
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('SELECT * FROM tbl_college ORDER BY name;');
        console.log('[collegesModel.getAllColleges] result count:', rows.length);
        return rows;
    } finally {
        connection.release();
    }
}

module.exports = {
    createCollege,
    updateCollege,
    archiveCollege,
    unarchiveCollege,
    getAllColleges,
};