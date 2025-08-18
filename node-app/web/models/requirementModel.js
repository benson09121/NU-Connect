const pool = require('../../config/db');

async function getUserByEmail(email) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('SELECT * FROM tbl_user WHERE email = ?', [email]);
        return rows[0] || null;
    } finally {
        connection.release();
    }
}

async function addRequirement(requirement_name, is_applicable_to, savePath, user_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL AddRequirement(?, ?, ?, ?);',
            [requirement_name, is_applicable_to || null, savePath || null, user_id]
        );
        return rows[0];
    } finally {
        connection.release();
    }
}

async function getRequirements(filterType = null){
    const connection = await pool.getConnection();
    try {
        if (filterType) {
            const norm = filterType.toLowerCase();
            const [rows] = await connection.query('CALL GetRequirementsFiltered(?);', [norm]);
            return rows[0];
        } else {
            const [rows] = await connection.query('CALL GetRequirements();');
            return rows[0];
        }
    }
    catch (error) {
        console.error('Error fetching requirements:', error);
        throw error;
    }
    finally {
        connection.release();
    }
}

async function getSpecificRequirement(requirement_id){
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetSpecificRequirement(?);', [requirement_id]);
        return rows[0];
    }
    catch (error) {
        console.error('Error fetching specific requirement:', error);
        throw error;
    }
    finally {
        connection.release();
    }
}

async function deleteRequirement(requirement_id){
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL DeleteRequirement(?);', [requirement_id]);
        return rows[0];
    }
    catch (error) {
        console.error('Error deleting requirement:', error);
        throw error;
    }
    finally {
        connection.release();
    }
}

async function updateRequirement(requirement_id, requirement_name, is_applicable_to, file_path) {
  const connection = await pool.getConnection();
  try {
    console.log('[MODEL updateRequirement] args:', {
      requirement_id,
      requirement_name,
      is_applicable_to,
      file_path: file_path || null
    });
    const [rows] = await connection.query(
      'CALL UpdateRequirement(?, ?, ?, ?);',
      [requirement_id, requirement_name, is_applicable_to, file_path || null]
    );
    return rows[0];
  } finally {
    connection.release();
  }
}

async function addApplicationPeriod(startDate, endDate, startTime, endTime, user_id){
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL AddApplicationPeriod(?, ?, ?, ?, ?);', [startDate, endDate, startTime, endTime, user_id]);
        return rows[0];
    }
    catch (error) {
        console.error('Error adding requirement period:', error);
        throw error;
    }
    finally {
        connection.release();
    }

}
async function addEventRequirement(requirement_name, requirement_type, savePath, user_id){
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL AddEventRequirement(?, ?, ?, ?);', [requirement_name, requirement_type, savePath, user_id]);
        return rows[0];
    }
    catch (error) {
        console.error('Error adding event requirement:', error);
        throw error;
    }
    finally {
        connection.release();
    }
}

async function getAllPeriodsWithApplications() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetAllPeriodsWithApplications();');
        return rows[0];
    }
    catch (error) {
        console.error('Error fetching periods with applications:', error);
        throw error;
    }
    finally {
        connection.release();
    }
}

async function getActiveApplicationPeriodSimple() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetActiveApplicationPeriodSimple();');
        return rows[0];
    } catch (error) {
        console.error('Error fetching active application period:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getActiveApplicationPeriod(){
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetActiveApplicationPeriod();');
        return rows[0];
    }
    catch (error) {
        console.error('Error fetching active application period:', error);
        throw error;
    }
    finally {
        connection.release();
    }
}

async function updateApplicationPeriod(startDate, endDate, startTime, endTime, period_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL UpdateApplicationPeriod(?, ?, ?, ?, ?);',[startDate, endDate, startTime, endTime, period_id]);
        return rows[0];
    }
    catch (error) {
        console.error('Error updating requirement period:', error);
        throw error;
    }
    finally {
        connection.release();
    }
}   

async function terminateActiveApplicationPeriod(user_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL TerminateActiveApplicationPeriod(?);', [user_id]);
        return rows[0];
    }
    catch (error) {
        console.error('Error terminating active application period:', error);
        throw error;
    }
    finally {
        connection.release();
    }
}

module.exports = {
    getUserByEmail,
    addRequirement,
    getRequirements,
    getSpecificRequirement,
    deleteRequirement,
    updateRequirement,
    addApplicationPeriod,
    getAllPeriodsWithApplications,
    getActiveApplicationPeriod,
    getActiveApplicationPeriodSimple,
    updateApplicationPeriod,
    terminateActiveApplicationPeriod,
    addEventRequirement
};