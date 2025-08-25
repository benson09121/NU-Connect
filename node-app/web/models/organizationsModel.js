const pool = require('../../config/db');

async function createOrganizationApplication(organizations, executives, requirements, user_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL CreateOrganizationApplication(?,?,?,?);',
            [JSON.stringify(organizations), JSON.stringify(executives), JSON.stringify(requirements), user_id]
        );
        return rows[0];
    } catch (error) {
        console.error('Error creating organization application:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getSpecificApplication(user_id, organization_name, app_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetSpecificApplication(?, ?, ?);', [user_id, organization_name, app_id]);
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

async function approveApplication(approval_id, comments, organization_id, application_id) {
    const connection = await pool.getConnection();
    try {
        
        // returns approval row
        const [rows] = await connection.query(
            'CALL ApproveApplication(?, ?, ?, ?);',
            [approval_id, comments, organization_id, application_id]
        );
        return rows[0];
    } catch (error) {
        console.error('Error approving application:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function rejectApplication(approval_id, comments, application_id) {
    const connection = await pool.getConnection();
    try {
        // proc signature: (p_application_id, p_approval_id, p_organization_id, p_comment)
        const [rows] = await connection.query(
            'CALL RejectApplication(?, ?, ?);',
            [application_id, approval_id,comments]
        );
        return rows[0];
    } catch (error) {
        console.error('Error rejecting application:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getOrganizationApplications() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetOrganizationApplications();');
        return rows[0];
    } catch (error) {
        console.error('Error fetching organization applications:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function checkOrganizationName(org_name) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL CheckOrganizationName(?);', [org_name]);
        return rows[0];
    } catch (error) {
        console.error('Error checking organization name:', error);
        throw error;
    } finally {
        connection.release();
    }

}
async function checkOrganizationEmails(org_emails) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL CheckOrganizationEmails(?);', [org_emails]);
        return rows[0];
    } catch (error) {
        console.error('Error checking organization emails:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getOrganizationDetails(org_id, org_version_id){
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetOrganizationDetails(?, ?);', [org_id, org_version_id]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching organization details:', error);
        throw error;
    } finally {
        connection.release();
    }
}
      
async function getUserByEmail(email) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('SELECT * FROM tbl_user WHERE email = ?', [email]);
        return rows[0] || null;
    } finally {
        connection.release();
    }
}

async function archiveOrganization(organization_id, user_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL ArchiveOrganization(?, ?);', [organization_id, user_id]);
        return rows[0];
    } catch (error) {
        console.error('Error archiving organization:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function unarchiveOrganization(organization_id, user_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL UnarchiveOrganization(?, ?);', [organization_id, user_id]);
        return rows[0];
    } catch (error) {
        console.error('Error unarchiving organization:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getOrganizationsByStatus(status) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetOrganizationsByStatus(?);', [status]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching organizations by status:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getOrganizationEventApplications(org_name) {
    const connection = await pool.getConnection();
    try {
        const [results] = await connection.query('CALL GetOrganizationEventApplications(?);', [org_name]);
        // MySQL returns multiple result sets for multi-SELECT procs
        return {
            applications: results[0],
            submissions: results[1]
        };
    } catch (error) {
        console.error('Error fetching organization event applications:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getEventRequirementSubmissionsByOrganization(organization_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetEventRequirementSubmissionsByOrganization(?);', [organization_id]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching event requirement submissions by organization:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getOrganizationIdByName(user_role, org_name) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'SELECT organization_id FROM tbl_organization WHERE name = ? LIMIT 1',
            [org_name]
        );
        return rows[0] ? rows[0].organization_id : null;
    } catch (error) {
        console.error('Error fetching organization_id by name:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getOrganizationDashboardStats(organization_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetOrganizationDashboardStats(?);', [organization_id]);
        return rows[0][0]; // Single row with stats
    } catch (error) {
        console.error('Error fetching organization dashboard stats:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function createExecutiveMember({
    organization_id,
    email,
    program_name,
    role_title,
    rank_level,
    action_by_email
}) {
    const connection = await pool.getConnection();
    try {
        // Log the SQL call and parameters
        console.log('SQL CALL: CALL CreateExecutiveMember(?, ?, ?, ?, ?, ?);', [
            organization_id,

            email,
            program_name,
            role_title,
            rank_level,
            action_by_email
        ]);
        [row] = await connection.query(
            `CALL CreateExecutiveMember(?, ?, ?, ?, ?, ?)`,
            [
                organization_id,
                email,
                program_name,
                role_title,
                rank_level,
                action_by_email
            ]
        );
        // If no error, success
        return row[0];
    } catch (error) {
        throw error;
    } finally {
        connection.release();
    }
}

async function updateExecutiveMember({
    organization_id,
    email,
    program_name,
    role_title,
    rank_level,
    action_by_email
}) {
    const connection = await pool.getConnection();
    try {
        console.log('SQL CALL: CALL UpdateExecutiveMember(?, ?, ?, ?, ?, ?);', [
            organization_id,
            email,
            program_name,
            role_title,
            rank_level,
            action_by_email
        ]);
        [row] = await connection.query(
            `CALL UpdateExecutiveMember(?, ?, ?, ?, ?, ?)`,
            [
                organization_id,
                email,
                program_name,
                role_title,
                rank_level,
                action_by_email
            ]
        );
        return row[0];
    } catch (error) {
        throw error;
    } finally {
        connection.release();
    }
}

async function archiveExecutiveMember({
    organization_id,
    cycle_number,
    email,
    action_by_email
}) {
    const connection = await pool.getConnection();
    try {
        console.log('SQL CALL: CALL ArchiveExecutiveMember(?, ?, ?);', [
            organization_id,
            email,
            action_by_email
        ]);
        [row] = await connection.query(
            `CALL ArchiveExecutiveMember(?, ?, ?)`,
            [
                organization_id,
                email,
                action_by_email
            ]
        );
        return row[0];
    } catch (error) {
        throw error;
    } finally {
        connection.release();
    }
}

async function getOrganizationCommittees(org_id, org_version_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetOrganizationCommittees(?, ?);', [org_id, org_version_id]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching organization committees:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function createCommittee({
    orgName,
    cycle_number,
    committee_name,
    description,
    action_by_email
}) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            `CALL CreateCommittee( ?, ?, ?, ?)`,
            [
                orgName,
                committee_name,
                description,
                action_by_email
            ]
        );
        return rows[0];
    } catch (error) {
        throw error;
    } finally {
        connection.release();
    }
}

async function updateCommittee({
    committee_id,
    new_name,
    new_description,
    action_by_email
}) {
    const connection = await pool.getConnection();
    try {

        const [rows] = await connection.query(
            `CALL UpdateCommittee(?, ?, ?, ?)`,
            [
                committee_id,
                new_name,
                new_description,
                action_by_email
            ]
        );
        return rows[0]; 
    } catch (error) {
        console.error('[updateCommittee] SQL/Error:', error.sqlMessage || error.message, error);
        throw error;
    } finally {
        connection.release();
    }
}

async function archiveCommittee({
    committee_id,
    reason,
    archived_by_email
}) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            `CALL ArchiveCommittee(?, ?, ?)`,
            [
                committee_id,
                reason,
                archived_by_email
            ]
        );
        return rows[0];
    } catch (error) {
        console.error('[archiveCommittee] SQL/Error:', error.sqlMessage || error.message, error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getAllCommitteeMembers(org_id, org_version_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetAllCommitteeMembers(?, ?);', [org_id, org_version_id]);
        return rows[0];
    } catch (error) {
        console.error('[getAllCommitteeMembers] SQL/Error:', error.sqlMessage || error.message, error);
        throw error;
    } finally {
        connection.release();
    }
}

async function addCommitteeMember({
    committee_id,
    user_email,
    role,
    action_by_email
}) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            `CALL AddCommitteeMember(?, ?, ?, ?)`,
            [
                committee_id,
                user_email,
                role,
                action_by_email
            ]
        );
        return rows[0];
    } catch (error) {
        console.error('[addCommitteeMember] SQL/Error:', error.sqlMessage || error.message, error);
        throw error;
    } finally {
        connection.release();
    }
}

async function updateCommitteeMember({
    committee_member_id,
    new_role,
    action_by_email
}) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            `CALL UpdateCommitteeMember(?, ?, ?)`,
            [committee_member_id, new_role, action_by_email]
        );
        return rows[0];
    } catch (error) {
        throw error;
    } finally {
        connection.release();
    }
}

async function archiveCommitteeMember({
    committee_member_id,
    reason,
    action_by_email
}) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            `CALL ArchiveCommitteeMember(?, ?, ?)`,
            [committee_member_id, reason, action_by_email]
        );
        return rows[0][0]; // { rows_archived: ... }
    } catch (error) {
        throw error;
    } finally {
        connection.release();
    }
}

async function getPendingOrganizationMembers(org_id, org_version_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetPendingOrganizationMembers(?, ?);', [org_id, org_version_id]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching pending organization members:', error);
        throw error;
    } finally {
        connection.release();
    }
}
async function approveMembershipApplication(application_id, reviewer_email, remarks) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL ApproveMembershipApplication(?, ?, ?);',
            [application_id, reviewer_email, remarks]
        );
        return rows[0];
    } catch (error) {
        console.error('Error approving membership application:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function rejectMembershipApplication(application_id, reviewer_email, remarks) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL RejectMembershipApplication(?, ?, ?);',
            [application_id, reviewer_email, remarks]
        );
        return rows[0];
    } catch (error) {
        console.error('Error rejecting membership application:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function addOrganizationMember({
    orgName,
    email,
    action_by_email,
    program_name
}) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL AddOrganizationMember(?, ?, ?, ?);',
            [
                orgName,
                email,
                action_by_email,
                program_name
            ]
        );
        return rows[0];
    } catch (error) {
        console.error('Error adding organization member:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function editOrganizationMember({
    current_email,
    new_email,
    new_program_name
}) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL EditOrganizationMember(?, ?, ?);',
            [current_email, new_email, new_program_name]
        );
        return rows[0];
    } catch (error) {
        console.error('Error editing organization member:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function archiveOrganizationMember({ member_id, archived_by_email }) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL ArchiveOrganizationMember(?, ?);',
            [member_id, archived_by_email]
        );
        return rows[0];
    } catch (error) {
        console.error('Error archiving organization member:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function GetApprovalTimeline(org_name, app_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL GetApprovalTimeline(?, ?);',
            [org_name, app_id]
        );
        return rows[0];
    } catch (error) {
        console.error('Error fetching approval timeline:', error);
        throw error;
    } finally {
        connection.release();
    }
}
async function getUpdateApplication(application_id){
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetUpdateApplication(?);', [application_id]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching update application:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getOrganizationByRole(user_role){
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetOrganizationByRole(?);', [user_role]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching organization by role:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getOrganizationByProgram(program_id){
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetOrganizationByProgram(?);', [program_id]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching organization by program:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getOrganizationByName(org_name){
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetOrganizationByName(?);', [org_name]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching organization by name:', error);
        throw error;
    } finally {
        connection.release();
    }
}



async function getOrganizationOfficers(org_id, org_version_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetOrganizationOfficers(?, ?);', [org_id, org_version_id]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching organization officers:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getOrganizationMembers(org_id, org_version_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetOrganizationMembers(?, ?);', [org_id, org_version_id]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching organization members:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getOrganizationUsers(org_id, org_version_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL GetOrganizationUsers(?, ?);',
            [org_id, org_version_id]
        );
        return rows[0];
    } catch (error) {
        console.error('Error fetching organization users:', error);
        throw error;
    } finally {
        connection.release();
    }
}


async function getAllUsers() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetAllUsers();');
        return rows[0];
    } catch (error) {
        console.error('Error fetching all users:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getSingleUser(member_id){
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetSingleUser(?);', [member_id]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching single user:', error);
        throw error;
    }
}

async function GetSingleOrganizationUser(member_id){
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetSingleOrganizationUser(?);', [member_id]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching single organization user:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getProgram() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetProgram();');
        return rows[0];
    } catch (error) {
        console.error('Error fetching program:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getApplication(application_id){
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetApplication(?);',[application_id]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching program:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getAllExecutiveRanks() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetAllExecutiveRanks();');
        return rows[0];
    } catch (error) {
        console.error('Error fetching executive ranks:', error);
        throw error;
    } finally {
        connection.release();
    }
}
      
async function getSingleOrganizationMember(member_id, org_name) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetSingleOrganizationMember(?, ?);', [member_id, org_name]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching single organization member:', error);
        throw error;
    } finally {
        connection.release();
    }
}

// Enhanced application period and approval process functions
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

async function initiateApprovalProcess(applicationId, userid) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL InitiateApprovalProcess(?, ?)', [
            applicationId,
            userid
        ]);
        return rows[0];
    } catch (error) {
        console.error('Error initiating approval process:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function sendApprovalNotification(approvalId, applicationId) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL NotifyApplicationApprovalChange(?,?)', [
            approvalId,
            applicationId
        ]);
        return rows[0];
    } catch (error) {
        console.error('Error sending approval notification:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getApprovedOrganizationLogos() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetApprovedOrganizationLogos();');
        return rows[0] || [];
    } catch (error) {
        console.error('Error fetching approved organization logos:', error);
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    createOrganizationApplication,
    getSpecificApplication,
    approveApplication,
    rejectApplication,
    getOrganizationApplications,
    checkOrganizationName,
    checkOrganizationEmails,
    getOrganizationDetails,
    getUserByEmail,
    archiveOrganization,
    unarchiveOrganization,
    getOrganizationsByStatus,
    getOrganizationEventApplications,
    getEventRequirementSubmissionsByOrganization,
    getOrganizationIdByName,
    getOrganizationDashboardStats,
    createExecutiveMember,
    updateExecutiveMember,
    archiveExecutiveMember,
    getOrganizationCommittees,
    createCommittee,
    updateCommittee,
    archiveCommittee,
    getAllCommitteeMembers,
    addCommitteeMember,
    updateCommitteeMember,
    archiveCommitteeMember,
    getPendingOrganizationMembers,
    approveMembershipApplication,
    rejectMembershipApplication,
    addOrganizationMember,
    editOrganizationMember,
    archiveOrganizationMember,
    GetApprovalTimeline,
    getUpdateApplication,
    getOrganizationByRole,
    getOrganizationByProgram,
    getOrganizationByName,
    getOrganizationOfficers,
    getOrganizationMembers,
    getOrganizationUsers,
    getAllUsers,
    getProgram,
    getApplication,
    getAllExecutiveRanks,
    getSingleUser,
    GetSingleOrganizationUser,
    getSingleOrganizationMember,
    // Enhanced functions
    addApplicationPeriod,
    updateApplicationPeriod,
    initiateApprovalProcess,
    sendApprovalNotification,
    getApprovedOrganizationLogos,
};