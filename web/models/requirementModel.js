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

async function getRequirements(filterType = null) {
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
    } catch (error) {
        console.error('Error fetching requirements:', error);
        throw error;
    } finally {
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

async function addApplicationPeriod(startDate, endDate, startTime, endTime, createdByEmail) {
    const connection = await pool.getConnection();
    try {
        // Get user_id from email
        const [userRows] = await connection.query('SELECT user_id FROM tbl_user WHERE email = ? LIMIT 1', [createdByEmail]);
        if (!userRows[0]) {
            throw new Error('User not found');
        }
        const createdBy = userRows[0].user_id;

        const [rows] = await connection.query('CALL AddApplicationPeriod(?, ?, ?, ?, ?)', [
            startDate,
            endDate,
            startTime,
            endTime,
            createdBy
        ]);
        return rows[0];
    } catch (error) {
        console.error('Error adding application period:', error);
        throw error;
    } finally {
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
        const resultRows = rows[0] || [];

        // Parse MySQL JSON text in `applications` column into JS arrays (if needed)
        return resultRows.map(r => {
            if (r && r.applications && typeof r.applications === 'string') {
                try {
                    r.applications = JSON.parse(r.applications);
                } catch (e) {
                    // leave as-is if parsing fails
                }
            }
            // ensure applications is an array (not null)
            if (!r.applications) r.applications = [];
            return r;
        });
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

async function updateApplicationPeriod(startDate, endDate, startTime, endTime, periodId, updatedByEmail) {
    const connection = await pool.getConnection();
    try {
        // Get user_id from email
        const [userRows] = await connection.query('SELECT user_id FROM tbl_user WHERE email = ? LIMIT 1', [updatedByEmail]);
        if (!userRows[0]) {
            throw new Error('User not found');
        }
        const updatedBy = userRows[0].user_id;

        const [rows] = await connection.query('CALL UpdateApplicationPeriod(?, ?, ?, ?, ?, ?)', [
            startDate,
            endDate,
            startTime,
            endTime,
            periodId,
            updatedBy
        ]);
        return rows[0];
    } catch (error) {
        console.error('Error updating application period:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function createApprovalChain(applicationId, initiatedByEmail) {
    const connection = await pool.getConnection();
    try {
        // Get user_id from email
        const [userRows] = await connection.query('SELECT user_id FROM tbl_user WHERE email = ? LIMIT 1', [initiatedByEmail]);
        if (!userRows[0]) {
            throw new Error('User not found');
        }
        const initiatedBy = userRows[0].user_id;

        // Use NEW approval chain procedure with e-signature support
        const [rows] = await connection.query('CALL sp_CreateApprovalChain(?, ?)', [
            applicationId,
            initiatedBy
        ]);
        return rows[0];
    } catch (error) {
        console.error('Error creating approval chain:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function terminateActiveApplicationPeriod(terminatedBy) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL TerminateActiveApplicationPeriod(?)', [terminatedBy]);
        return rows[0];
    } catch (error) {
        console.error('Error terminating application period:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getRequirementByFilePath(fileName) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            `SELECT 'requirement' AS src, requirement_id AS id FROM tbl_requirement WHERE file_path = ?
             UNION
             SELECT 'event_requirement' AS src, requirement_id AS id FROM tbl_event_application_requirement WHERE file_path = ?
             LIMIT 1;`,
            [fileName, fileName]
        );
        return rows[0] || null;
    } catch (error) {
        console.error('Error checking requirement by file path:', error);
        throw error;
    } finally {
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
    archiveEventRequirement,
    createApprovalChain,
    getRequirementByFilePath,
};