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

async function addRequirement(requirement_name, savePath, user_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL AddRequirement(?, ?, ?)',[requirement_name, savePath, user_id]);
        return rows[0];
    }
    catch (error) {
        console.error('Error fetching permissions:', error);
        throw error;
    }
    finally {
        connection.release();
    }
}

async function getRequirements(){
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetRequirements();');
        return rows[0];
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

async function updateRequirement(requirement_id, requirement_name, file_path) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL UpdateRequirement(?, ?, ?);', [requirement_id, requirement_name, file_path]);
        return rows[0];
    }   
    catch (error) {
        console.error('Error updating requirement:', error);
        throw error;
    }
    finally {
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

async function getSpecificEventRequirement(requirement_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetSpecificEventRequirement(?)', [requirement_id]);
        return rows[0];
    }
    catch (error) {
        console.error('Error fetching specific event requirement:', error);
        throw error;
    }
    finally {
        connection.release();
    }
}

async function updateEventRequirement(requirement_id, requirement_name, requirement_type, file_path, updated_by) {
    const connection = await pool.getConnection();
    const fs = require('fs');
    const path = require('path');
    
    try {
        const [rows] = await connection.query('CALL UpdateEventRequirement(?, ?, ?, ?, ?)', [requirement_id, requirement_name, requirement_type, file_path, updated_by]);
        
        // Handle old file deletion if a new file path is provided and old file exists
        if (rows[0] && rows[0][0] && rows[0][0].old_file_path && file_path && file_path !== rows[0][0].old_file_path) {
            const oldFilePath = path.join('/app/requirements', rows[0][0].old_file_path);
            try {
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                    console.log(`Deleted old file: ${oldFilePath}`);
                }
            } catch (fileError) {
                console.error('Error deleting old file:', fileError);
                // Don't throw here - the database update was successful
            }
        }
        
        return rows[0];
    }
    catch (error) {
        console.error('Error updating event requirement:', error);
        throw error;
    }
    finally {
        connection.release();
    }
}

async function archiveEventRequirement(requirement_id, archived_by) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL ArchiveEventRequirement(?, ?)', [requirement_id, archived_by]);
        return rows[0];
    }
    catch (error) {
        console.error('Error archiving event requirement:', error);
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
    addEventRequirement,
    getSpecificEventRequirement,
    updateEventRequirement,
    archiveEventRequirement
};