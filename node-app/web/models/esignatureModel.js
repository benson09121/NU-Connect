const pool = require('../../../config/databasePool');

/**
 * Upload or update user's e-signature
 * @param {string} userId - User ID
 * @param {string} signaturePath - File path to signature image
 * @returns {Promise<Object>} Success status and path
 */
async function uploadEsignature(userId, signaturePath) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            `INSERT INTO tbl_user_esignature (user_id, signature_path, uploaded_at)
             VALUES (?, ?, NOW())
             ON DUPLICATE KEY UPDATE signature_path = ?, uploaded_at = NOW()`,
            [userId, signaturePath, signaturePath]
        );
        return { success: true, path: signaturePath };
    } catch (error) {
        console.error('Error uploading e-signature:', error);
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * Get user's e-signature
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Signature data or null
 */
async function getEsignature(userId) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'SELECT signature_path, uploaded_at FROM tbl_user_esignature WHERE user_id = ?',
            [userId]
        );
        return rows[0] || null;
    } catch (error) {
        console.error('Error fetching e-signature:', error);
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * Delete user's e-signature
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Success status
 */
async function deleteEsignature(userId) {
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.query(
            'DELETE FROM tbl_user_esignature WHERE user_id = ?',
            [userId]
        );
        return { success: result.affectedRows > 0 };
    } catch (error) {
        console.error('Error deleting e-signature:', error);
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    uploadEsignature,
    getEsignature,
    deleteEsignature
};
