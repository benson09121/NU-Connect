const pool = require('../../config/db');
const { prisma } = require('../../config/db');

// ── Helper: resolve cycle_number from org_version_id ───────────────────────
async function _getCycleNumber(orgId, orgVersionId) {
  const cycle = await prisma.tbl_renewal_cycle.findFirst({
    where: { organization_id: Number(orgId), org_version_id: Number(orgVersionId) },
    select: { cycle_number: true },
  });
  if (!cycle) throw new Error('No renewal cycle found for the given organization and version');
  return cycle.cycle_number;
}

// ── Helper: fetch a single member override entry (for mutation return values) ─
async function _getMemberOverrideEntry(memberId, orgId, cycleNumber) {
  const om = await prisma.tbl_organization_members.findFirst({
    where: { member_id: Number(memberId) },
    include: {
      tbl_user: {
        include: {
          tbl_program_tbl_user_program_idTotbl_program: { select: { name: true, abbreviation: true } },
        },
      },
      tbl_executive_role: { include: { tbl_executive_rank: true } },
      tbl_member_permission_override: { include: { tbl_permission: true } },
    },
  });
  if (!om) return null;
  const cms = await prisma.tbl_committee_members.findMany({
    where: {
      user_id: om.user_id,
      tbl_committee: { organization_id: Number(orgId), cycle_number: cycleNumber },
    },
    include: {
      tbl_committee: { select: { name: true } },
      tbl_committee_role: { select: { role_name: true } },
    },
  });
  const u = om.tbl_user;
  const er = om.tbl_executive_role;
  const rank = er?.tbl_executive_rank;
  const prog = u?.tbl_program_tbl_user_program_idTotbl_program;
  const committeeNames = [...new Set(cms.map(c => c.tbl_committee?.name).filter(Boolean))].join(', ');
  const committeeRoles = [...new Set(cms.map(c => c.tbl_committee_role?.role_name).filter(Boolean))].join(', ');
  return {
    id: om.member_id,
    user_id: om.user_id,
    member_name: `${u?.f_name ?? ''} ${u?.l_name ?? ''}`.trim(),
    f_name: u?.f_name,
    l_name: u?.l_name,
    member_email: u?.email,
    member_type: om.member_type,
    executive_role: er?.role_title ?? null,
    executive_rank_level: rank?.rank_level ?? null,
    executive_rank_title: rank?.default_title ?? null,
    committee_names: committeeNames || null,
    committee_roles: committeeRoles || null,
    program_name: prog?.name ?? null,
    program_abbreviation: prog?.abbreviation ?? null,
    member_status: om.status,
    joined_at: om.joined_at,
    permission_overrides: om.tbl_member_permission_override.map(mpo => ({
      override_id: mpo.override_id,
      permission_id: mpo.permission_id,
      permission_name: mpo.tbl_permission.permission_name,
      permission_scope: mpo.tbl_permission.scope,
      is_allowed: mpo.is_allowed,
      override_type: mpo.is_allowed ? 'Force Allow' : 'Force Deny',
    })),
    total_overrides: om.tbl_member_permission_override.length,
  };
}

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

async function approveApplication(chain_id, comments, organization_id, application_id, user_email) {
    const connection = await pool.getConnection();
    try {
        console.log('🔐 [E-SIG] Starting approval with e-signature:', { chain_id, user_email, has_comments: !!comments });
        
        // STEP 1: Check if this is a final approver or intermediate approver
        const [chainInfo] = await connection.query(
            'SELECT is_final_approval, approval_order FROM tbl_organization_approval_chain WHERE chain_id = ?',
            [chain_id]
        );
        
        const isFinalApprover = chainInfo[0]?.is_final_approval;
        const approvalOrder = chainInfo[0]?.approval_order;
        
        console.log('🔐 [E-SIG] Approval details:', { 
            chain_id, 
            is_final_approval: isFinalApprover, 
            approval_order: approvalOrder 
        });
        
        // STEP 2: Call appropriate stored procedure based on approver type
        // NOTE: user_email is used because approver_user_id stores email addresses
        let spResult;
        if (isFinalApprover) {
            // Final approver uses sp_ApproveApprovalStep
            console.log('🔐 [E-SIG] Calling sp_ApproveApprovalStep (final approver)');
            const [approveResult] = await connection.query(
                'CALL sp_ApproveApprovalStep(?, ?, ?);',
                [chain_id, user_email, comments || '']
            );
            spResult = approveResult[0]?.[0];
        } else {
            // Intermediate approver uses sp_SignApprovalStep
            console.log('🔐 [E-SIG] Calling sp_SignApprovalStep (intermediate approver)');
            const [signResult] = await connection.query(
                'CALL sp_SignApprovalStep(?, ?, ?);',
                [chain_id, user_email, comments || '']
            );
            spResult = signResult[0]?.[0];
        }
        
        console.log('🔐 [E-SIG] Stored procedure result:', spResult);
        
        if (!spResult || spResult.status === 'error') {
            throw new Error(spResult?.message || 'Failed to process approval with e-signature');
        }
        
        // STEP 3: Copy signature file if paths provided
        if (spResult.user_signature_path && spResult.approval_signature_path) {
            const fs = require('fs').promises;
            const path = require('path');
            
            const sourcePath = path.join(__dirname, '../../../', spResult.user_signature_path);
            const destPath = path.join(__dirname, '../../../', spResult.approval_signature_path);
            
            try {
                // Ensure destination directory exists
                const destDir = path.dirname(destPath);
                await fs.mkdir(destDir, { recursive: true });
                
                // Copy signature file
                await fs.copyFile(sourcePath, destPath);
                console.log(`✅ [E-SIG] Copied signature: ${spResult.user_signature_path} → ${spResult.approval_signature_path}`);
            } catch (fileError) {
                console.error('❌ [E-SIG] Failed to copy signature file:', fileError);
                // Don't throw - signature_path is already saved in database
            }
        }
        
        // STEP 4: Get updated approval chain info for return value
        const [updatedChain] = await connection.query(
            `SELECT 
                ac.approval_order as current_step,
                (SELECT MAX(approval_order) FROM tbl_organization_approval_chain WHERE application_id = ?) as total_steps,
                ac.status
            FROM tbl_organization_approval_chain ac
            WHERE ac.chain_id = ?`,
            [application_id, chain_id]
        );
        
        const stepInfo = updatedChain[0];
        
        // STEP 5: Return result in expected format (for backward compatibility)
        return [[{
            result: {
                application: {
                    step: stepInfo.current_step || approvalOrder || 0
                },
                other: {
                    last_step: stepInfo.total_steps || 0
                },
                status: stepInfo.status
            }
        }]];
        
    } catch (error) {
        console.error('❌ [E-SIG] Error approving application with e-signature:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function rejectApplication(chain_id, comments, application_id) {
    const connection = await pool.getConnection();
    try {
        // proc signature: (p_application_id, p_chain_id, p_comment)
        const [rows] = await connection.query(
            'CALL RejectApplication(?, ?, ?);',
            [application_id, chain_id, comments]
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
async function checkOrganizationEmails(org_emails, president_email) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL CheckOrganizationEmails(?, ?);', [org_emails, president_email]);
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
        // Make sure to trim and lowercase the email for comparison
        const [rows] = await connection.query(
            "SELECT * FROM tbl_user WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) LIMIT 1",
            [email]
        );
        return rows[0] || null;
    } finally {
        connection.release();
    }
}

async function archiveOrganization(organization_id, user_id, reason) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL ArchiveOrganization(?, ?, ?);', [organization_id, user_id, reason]);

        // MySQL CALL returns an array of resultsets. The procedure SELECT * returns first resultset.
        // Normalize to single row object (or null)
        const single = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0][0] : (Array.isArray(rows) ? rows[0] : rows);
        return single || null;
    } catch (error) {
        console.error('Error archiving organization:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function unarchiveOrganization(organization_id, user_id, reason = null) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL UnarchiveOrganization(?, ?, ?);', [organization_id, user_id, reason]);

        const single = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0][0] : (Array.isArray(rows) ? rows[0] : rows);
        return single || null;
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

async function getOrganizationIdByName(org_name) {
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
    orgId,
    email,
    program_name,
    role_title,
    rank_level,
    action_by_email,
    orgVersionId
}) {
    const connection = await pool.getConnection();
    try {
        [row] = await connection.query(
            `CALL CreateExecutiveMember(?, ?, ?, ?, ?, ?, ?)`,
            [
                orgId,
                email,
                program_name,
                role_title,
                rank_level,
                action_by_email,
                orgVersionId
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
    orgId,
    email,
    program_name,
    role_title,
    rank_level,
    action_by_email,
}) {
    const connection = await pool.getConnection();
    try {
        [row] = await connection.query(
            `CALL UpdateExecutiveMember(?, ?, ?, ?, ?, ?)`,
            [
                orgId,
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
    orgId,
    committee_name,
    description,
    action_by_email
}) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            `CALL CreateCommittee( ?, ?, ?, ?)`,
            [
                orgId,
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
        // Pass through the original error to preserve the SQL message
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
            `CALL UpdateCommitteeMember(?, ?, ?)`,  // Fixed: Now 3 parameters
            [committee_member_id, new_role, action_by_email]  // Removed committee_id
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
        return rows[0];
    } catch (error) {
        console.error('[archiveCommitteeMember] SQL/Error:', error.sqlMessage || error.message, error);
        // Pass through the original error to preserve the SQL message
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

async function getArchivedOrganizationMembers(orgId, orgVersionId) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetArchivedOrganizationMembers(?, ?);', [orgId, orgVersionId]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching archived organization members:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function archiveOrganizationMember({ member_id, archived_by_email, reason, orgId, orgVersionId }) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL ArchiveOrganizationMember(?, ?, ?, ?, ?);',
            [member_id, archived_by_email, reason, orgId, orgVersionId]
        );
        return rows[0];
    } catch (error) {
        console.error('Error archiving organization member:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function unarchiveOrganizationMember(memberId, unarchivedByEmail, reason, orgId, orgVersionId) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL UnarchiveOrganizationMember(?, ?, ?, ?, ?);', [
            memberId,
            unarchivedByEmail,
            reason,
            orgId,
            orgVersionId
        ]);
        return rows[0];
    } catch (error) {
        console.error('Error unarchiving organization member:', error);
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

// NEW: Get approval chain with proper field names for frontend
async function getApprovalChain(application_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL sp_GetApprovalChain(?);',
            [application_id]
        );
        return rows[0];
    } catch (error) {
        console.error('Error fetching approval chain:', error);
        throw error;
    } finally {
        connection.release();
    }
}

// New e-signature approval chain functions
async function getApprovalChainById(chain_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'SELECT * FROM tbl_organization_approval_chain WHERE chain_id = ?',
            [chain_id]
        );
        return rows[0];
    } catch (error) {
        console.error('Error fetching approval chain by ID:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function markApprovalAsReceived(chain_id, user_email, notes = '') {
    const connection = await pool.getConnection();
    try {
        console.log('🔐 [RECEIVE+SIGN] Marking as received with e-signature:', { chain_id, user_email });
        
        // STEP 1: Call NEW sp_ReceiveAndSignApproval to receive AND apply signature in one action
        // This changes status from 'Pending' → 'Received' AND applies signature_path
        // NOTE: Stored procedure will look up user_id from email internally
        const [receiveResult] = await connection.query(
            'CALL sp_ReceiveAndSignApproval(?, ?, ?)',
            [chain_id, user_email, notes || '']
        );
        
        const spResult = receiveResult[0]?.[0];
        console.log('🔐 [RECEIVE+SIGN] Stored procedure result:', spResult);
        
        if (!spResult || spResult.status === 'error') {
            throw new Error(spResult?.message || 'Failed to receive approval with e-signature');
        }
        
        // STEP 2: Copy signature file if filenames provided
        // Construct full paths from filenames stored in database
        if (spResult.user_signature_filename && spResult.approval_signature_filename) {
            const fs = require('fs').promises;
            const path = require('path');
            
            // Construct full paths from filenames
            // Source: /app/esignatures/{filename}
            // Dest: /app/approval-signatures/{filename}
            const sourcePath = path.join('/app/esignatures', spResult.user_signature_filename);
            const destPath = path.join('/app/approval-signatures', spResult.approval_signature_filename);
            
            try {
                // Ensure destination directory exists
                const destDir = path.dirname(destPath);
                await fs.mkdir(destDir, { recursive: true });
                
                // Copy signature file
                await fs.copyFile(sourcePath, destPath);
                console.log(`✅ [RECEIVE+SIGN] Copied signature from esignatures to approval-signatures`);
                console.log(`   Source: ${spResult.user_signature_filename}`);
                console.log(`   Dest: ${spResult.approval_signature_filename}`);
            } catch (fileError) {
                console.error('❌ [RECEIVE+SIGN] Failed to copy signature file:', fileError);
                // Don't throw - signature_path is already saved in database
            }
        }
        
        // STEP 3: Return success result
        return [{
            status: 'success',
            message: 'Approval received with e-signature successfully',
            chain_id: chain_id,
            signature_path: spResult.approval_signature_filename
        }];
        
    } catch (error) {
        console.error('❌ [RECEIVE+SIGN] Error:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function checkUserHasESignature(user_email) {
    const connection = await pool.getConnection();
    try {
        // Get user_id from email first
        const [userResult] = await connection.query(
            'SELECT user_id FROM tbl_user WHERE email = ? LIMIT 1',
            [user_email]
        );
        
        if (userResult.length === 0) {
            return false;
        }
        
        const userId = userResult[0].user_id;
        
        const [result] = await connection.query(
            'SELECT signature_path FROM tbl_user_esignature WHERE user_id = ?',
            [userId]
        );
        
        return result.length > 0 && result[0].signature_path !== null;
    } catch (error) {
        console.error('❌ [CHECK-ESIG] Database error:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function markApprovalAsSigned(chain_id, user_email, signature_path, notes = null) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL sp_SignApprovalStep(?, ?, ?)',
            [chain_id, user_email, notes]
        );
        
        // Update signature_path separately since sp_SignApprovalStep doesn't handle file path
        await connection.query(
            'UPDATE tbl_organization_approval_chain SET signature_path = ? WHERE chain_id = ?',
            [signature_path, chain_id]
        );
        
        return rows[0];
    } catch (error) {
        console.error('Error marking approval as signed:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function uploadApprovalSignature(chain_id, signature_path) {
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.query(
            'UPDATE tbl_organization_approval_chain SET signature_path = ? WHERE chain_id = ?',
            [signature_path, chain_id]
        );
        return result;
    } catch (error) {
        console.error('Error uploading approval signature:', error);
        throw error;
    } finally {
        connection.release();
    }
}

// Check if user has e-signature for a specific approval chain
async function checkUserSignature(chain_id, user_email) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            `SELECT 
                chain_id, 
                approver_user_id, 
                signature_path,
                status
            FROM tbl_organization_approval_chain oac
            JOIN tbl_user u ON oac.approver_user_id = u.user_id
            WHERE oac.chain_id = ? AND u.email = ?`,
            [chain_id, user_email]
        );
        
        if (rows.length === 0) {
            throw new Error('Approval chain not found or user not authorized');
        }
        
        return {
            hasSignature: !!rows[0].signature_path,
            signature_path: rows[0].signature_path,
            status: rows[0].status
        };
    } catch (error) {
        console.error('Error checking user signature:', error);
        throw error;
    } finally {
        connection.release();
    }
}

// Upload user e-signature to approval chain
async function uploadUserSignature(chain_id, user_email, signature_path) {
    const connection = await pool.getConnection();
    try {
        // First verify the user is the approver for this chain
        const [chainRows] = await connection.query(
            `SELECT oac.chain_id, oac.approver_user_id
            FROM tbl_organization_approval_chain oac
            JOIN tbl_user u ON oac.approver_user_id = u.user_id
            WHERE oac.chain_id = ? AND u.email = ?`,
            [chain_id, user_email]
        );
        
        if (chainRows.length === 0) {
            throw new Error('Approval chain not found or user not authorized');
        }
        
        // Update the signature path
        const [result] = await connection.query(
            'UPDATE tbl_organization_approval_chain SET signature_path = ?, updated_at = CURRENT_TIMESTAMP WHERE chain_id = ?',
            [signature_path, chain_id]
        );
        
        return {
            success: true,
            chain_id,
            signature_path,
            message: 'E-signature uploaded successfully'
        };
    } catch (error) {
        console.error('Error uploading user signature:', error);
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

async function getOrganizationByRole(user_role, status = null) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetOrganizationByRole(?, ?);', [user_role, status]);
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

async function getOrganizationById(org_id, org_version_id){
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetOrganizationById(?, ?);', [org_id, org_version_id]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching organization by ID:', error);
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
      
async function getSingleOrganizationMember(member_id, org_id) {
    const connection = await pool.getConnection();
    try {
    const [rows] = await connection.query('CALL GetSingleOrganizationMember(?, ?);', [member_id, org_id]);
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

async function createApprovalChain(applicationId, initiatedByEmail) {
    const connection = await pool.getConnection();
    try {
        // Use NEW approval chain procedure with e-signature support
        const [rows] = await connection.query('CALL sp_CreateApprovalChain(?, ?)', [
            applicationId,
            initiatedByEmail
        ]);
        return rows[0];
    } catch (error) {
        console.error('Error creating approval chain:', error);
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

async function checkOrgRenewalStatus(org_id){
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL CheckOrgRenewalStatus(?)', [org_id]);
        return rows[0] || {};
    } catch (error) {
        console.error('Error checking organization renewal status:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getOrganizationDashboardOverview(organization_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetOrganizationDashboardOverview(?);', [organization_id]);
        return rows[0][0]; // Single row with stats
    } catch (error) {
        console.error('Error fetching organization dashboard overview:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getAllOrganizations() {
    const connection = await pool.getConnection();
    try {
        // Call the stored procedure with NULL to ignore user filtering
        const [rows] = await connection.query('CALL GetAllOrganizations();');
        return rows[0];
    } catch (error) {
        console.error('Error fetching all organizations:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getAllApplicationsByOrganization(organization_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetAllApplicationsByOrganization(?);', [organization_id]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching applications by organization:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getUserOrganization(user_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetUserOrganization(?);', [user_id]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching user organization:', error);
        throw error;
    } finally {
        connection.release();
    }
}

// ── Prisma: getOrganizationCommitteeRoles ──────────────────────────────────
async function getOrganizationCommitteeRoles(orgId, orgVersionId) {
  const cycle_number = await _getCycleNumber(orgId, orgVersionId);
  const committees = await prisma.tbl_committee.findMany({
    where: { organization_id: Number(orgId), cycle_number },
    include: {
      tbl_committee_role: {
        include: {
          tbl_committee_role_permission: { include: { tbl_permission: true } },
        },
        orderBy: { role_name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });
  const result = [];
  for (const c of committees) {
    for (const cr of c.tbl_committee_role) {
      result.push({
        role_type: 'Committee',
        id: cr.committee_role_id,
        role_name: cr.role_name,
        committee_id: c.committee_id,
        committee_name: c.name,
        permissions: cr.tbl_committee_role_permission.map(rp => ({
          permission_id: rp.tbl_permission.permission_id,
          permission_name: rp.tbl_permission.permission_name,
          permission_scope: rp.tbl_permission.scope,
          permission_source: 'committee_role',
        })),
      });
    }
  }
  return result;
}

// ── Prisma: getOrganizationExecutives ──────────────────────────────────────
async function getOrganizationExecutives(org_id, org_version_id) {
  const cycle_number = await _getCycleNumber(org_id, org_version_id);
  const roles = await prisma.tbl_executive_role.findMany({
    where: { organization_id: Number(org_id), cycle_number },
    include: {
      tbl_executive_rank: {
        include: { tbl_rank_permission: { include: { tbl_permission: true } } },
      },
    },
    orderBy: { tbl_executive_rank: { rank_level: 'asc' } },
  });
  return roles.map(er => ({
    role_type: 'Executive',
    id: er.executive_role_id,
    role_name: er.role_title,
    rank_id: er.rank_id,
    rank_title: er.tbl_executive_rank.default_title,
    rank_level: er.tbl_executive_rank.rank_level,
    permissions: er.tbl_executive_rank.tbl_rank_permission.map(rp => ({
      permission_id: rp.tbl_permission.permission_id,
      permission_name: rp.tbl_permission.permission_name,
      permission_scope: rp.tbl_permission.scope,
      permission_source: 'rank',
    })),
  }));
}

// ── Prisma: getOrganizationPermissions ─────────────────────────────────────
async function getOrganizationPermissions() {
  return prisma.tbl_permission.findMany({ where: { scope: 'Organization' } });
}
// ── Prisma: updateCommitteePermissions ────────────────────────────────────
async function updateCommitteePermissions(committee_id, role_type, permissions) {
  const numId = Number(committee_id);
  // Map display role_type to Prisma enum value
  const roleEnumMap = { 'Committee Head': 'Committee_Head', 'Committee Officer': 'Committee_Officer' };
  const roleEnum = roleEnumMap[role_type];
  if (!roleEnum) throw new Error(`Invalid role_type: ${role_type}`);

  // Ensure both committee roles exist
  await prisma.tbl_committee_role.createMany({
    data: [
      { committee_id: numId, role_name: 'Committee_Head' },
      { committee_id: numId, role_name: 'Committee_Officer' },
    ],
    skipDuplicates: true,
  });

  // Find the target role
  const role = await prisma.tbl_committee_role.findFirst({
    where: { committee_id: numId, role_name: roleEnum },
  });
  if (!role) throw new Error('Committee role not found');

  // Replace permissions
  await prisma.tbl_committee_role_permission.deleteMany({ where: { committee_role_id: role.committee_role_id } });
  if (permissions.length > 0) {
    const perms = await prisma.tbl_permission.findMany({ where: { permission_name: { in: permissions } } });
    if (perms.length > 0) {
      await prisma.tbl_committee_role_permission.createMany({
        data: perms.map(p => ({ committee_role_id: role.committee_role_id, permission_id: p.permission_id })),
        skipDuplicates: true,
      });
    }
  }
  return { success: true, committee_role_id: role.committee_role_id };
}

// ── Prisma: updateExecutivePermissions ────────────────────────────────────
async function updateExecutivePermissions(executive_id, permissions) {
  // executive_id is the rank_id
  const rankId = Number(executive_id);
  const rank = await prisma.tbl_executive_rank.findUnique({ where: { rank_id: rankId } });
  if (!rank) throw new Error('Executive rank not found');

  // Replace rank permissions
  await prisma.tbl_rank_permission.deleteMany({ where: { rank_id: rankId } });
  if (permissions.length > 0) {
    const perms = await prisma.tbl_permission.findMany({ where: { permission_name: { in: permissions } } });
    if (perms.length > 0) {
      await prisma.tbl_rank_permission.createMany({
        data: perms.map(p => ({ rank_id: rankId, permission_id: p.permission_id })),
        skipDuplicates: true,
      });
    }
  }

  // Return updated executive roles for this rank
  const roles = await prisma.tbl_executive_role.findMany({
    where: { rank_id: rankId },
    include: {
      tbl_executive_rank: { include: { tbl_rank_permission: { include: { tbl_permission: true } } } },
    },
  });
  return roles.map(er => ({
    id: er.executive_role_id,
    role_name: er.role_title,
    rank_id: er.rank_id,
    rank_title: er.tbl_executive_rank.default_title,
    rank_level: er.tbl_executive_rank.rank_level,
    role_type: 'Executive',
    permissions: er.tbl_executive_rank.tbl_rank_permission.map(rp => ({
      permission_id: rp.tbl_permission.permission_id,
      permission_name: rp.tbl_permission.permission_name,
      permission_scope: rp.tbl_permission.scope,
      permission_source: 'rank',
    })),
  }));
}

// ── Prisma: getMemberPermissionOverrides ──────────────────────────────────
async function getMemberPermissionOverrides(organization_id, organization_version_id) {
  const cycle_number = await _getCycleNumber(organization_id, organization_version_id);
  const members = await prisma.tbl_organization_members.findMany({
    where: {
      organization_id: Number(organization_id),
      cycle_number,
      status: 'Active',
      tbl_member_permission_override: { some: {} },
    },
    include: {
      tbl_user: {
        include: {
          tbl_program_tbl_user_program_idTotbl_program: { select: { name: true, abbreviation: true } },
        },
      },
      tbl_executive_role: { include: { tbl_executive_rank: true } },
      tbl_member_permission_override: { include: { tbl_permission: true } },
    },
    orderBy: [{ tbl_user: { l_name: 'asc' } }, { tbl_user: { f_name: 'asc' } }],
  });

  // Fetch committee memberships for all relevant user_ids
  const userIds = members.map(m => m.user_id);
  const cms = await prisma.tbl_committee_members.findMany({
    where: {
      user_id: { in: userIds },
      tbl_committee: { organization_id: Number(organization_id), cycle_number },
    },
    include: {
      tbl_committee: { select: { name: true } },
      tbl_committee_role: { select: { role_name: true } },
    },
  });
  const committeesByUser = {};
  for (const cm of cms) {
    if (!committeesByUser[cm.user_id]) committeesByUser[cm.user_id] = { names: new Set(), roles: new Set() };
    if (cm.tbl_committee?.name) committeesByUser[cm.user_id].names.add(cm.tbl_committee.name);
    if (cm.tbl_committee_role?.role_name) committeesByUser[cm.user_id].roles.add(cm.tbl_committee_role.role_name);
  }

  return members.map(om => {
    const u = om.tbl_user;
    const er = om.tbl_executive_role;
    const rank = er?.tbl_executive_rank;
    const prog = u?.tbl_program_tbl_user_program_idTotbl_program;
    const cb = committeesByUser[om.user_id];
    return {
      id: om.member_id,
      user_id: om.user_id,
      member_name: `${u?.f_name ?? ''} ${u?.l_name ?? ''}`.trim(),
      f_name: u?.f_name,
      l_name: u?.l_name,
      member_email: u?.email,
      member_type: om.member_type,
      executive_role: er?.role_title ?? null,
      executive_rank_level: rank?.rank_level ?? null,
      executive_rank_title: rank?.default_title ?? null,
      committee_names: cb ? [...cb.names].join(', ') || null : null,
      committee_roles: cb ? [...cb.roles].join(', ') || null : null,
      program_name: prog?.name ?? null,
      program_abbreviation: prog?.abbreviation ?? null,
      member_status: om.status,
      joined_at: om.joined_at,
      permission_overrides: om.tbl_member_permission_override.map(mpo => ({
        override_id: mpo.override_id,
        permission_id: mpo.permission_id,
        permission_name: mpo.tbl_permission.permission_name,
        permission_scope: mpo.tbl_permission.scope,
        is_allowed: mpo.is_allowed,
        override_type: mpo.is_allowed ? 'Force Allow' : 'Force Deny',
      })),
      total_overrides: om.tbl_member_permission_override.length,
    };
  });
}

// ── Prisma: getEmailSuggestionOverride ──────────────────────────────────────
async function getEmailSuggestionOverride(organization_id, organization_version_id, pattern) {
  const cycle_number = await _getCycleNumber(organization_id, organization_version_id);
  const search = (pattern ?? '').toLowerCase().trim();

  // Get active members WITHOUT existing overrides, excluding rank-1 (President)
  const members = await prisma.tbl_organization_members.findMany({
    where: {
      organization_id: Number(organization_id),
      cycle_number,
      status: 'Active',
      tbl_member_permission_override: { none: {} },
      // Exclude President (rank_level = 1)
      NOT: {
        AND: [
          { member_type: 'Executive' },
          { tbl_executive_role: { tbl_executive_rank: { rank_level: 1 } } },
        ],
      },
    },
    include: {
      tbl_user: {
        include: {
          tbl_program_tbl_user_program_idTotbl_program: { select: { name: true, abbreviation: true } },
        },
      },
      tbl_executive_role: { include: { tbl_executive_rank: true } },
    },
  });

  // Apply search filter in JS (case-insensitive email/name match)
  const filtered = search === '' ? members : members.filter(om => {
    const u = om.tbl_user;
    const email = (u?.email ?? '').toLowerCase();
    const fullName = `${u?.f_name ?? ''} ${u?.l_name ?? ''}`.toLowerCase().trim();
    const fName = (u?.f_name ?? '').toLowerCase();
    const lName = (u?.l_name ?? '').toLowerCase();
    return email.includes(search) || fullName.includes(search) || fName.includes(search) || lName.includes(search);
  });

  // Fetch committee memberships for filtered members
  const userIds = filtered.map(m => m.user_id);
  const cms = userIds.length > 0 ? await prisma.tbl_committee_members.findMany({
    where: {
      user_id: { in: userIds },
      tbl_committee: { organization_id: Number(organization_id), cycle_number },
    },
    include: {
      tbl_committee: { select: { name: true } },
      tbl_committee_role: { select: { role_name: true } },
    },
  }) : [];
  const committeesByUser = {};
  for (const cm of cms) {
    if (!committeesByUser[cm.user_id]) committeesByUser[cm.user_id] = { names: new Set(), roles: new Set() };
    if (cm.tbl_committee?.name) committeesByUser[cm.user_id].names.add(cm.tbl_committee.name);
    if (cm.tbl_committee_role?.role_name) committeesByUser[cm.user_id].roles.add(cm.tbl_committee_role.role_name);
  }

  // Compute search priority for ordering
  const withPriority = filtered.map(om => {
    const u = om.tbl_user;
    const email = (u?.email ?? '').toLowerCase();
    const fullName = `${u?.f_name ?? ''} ${u?.l_name ?? ''}`.toLowerCase().trim();
    let priority = 5;
    if (search !== '') {
      if (email === search || fullName === search) priority = 1;
      else if (fullName === search) priority = 2;
      else if (email.startsWith(search)) priority = 3;
      else if (fullName.startsWith(search)) priority = 4;
    }
    return { om, priority };
  });

  withPriority.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    // member_type DESC: Executive > Committee > Member
    const typeOrder = { Executive: 0, Committee: 1, Member: 2 };
    const tA = typeOrder[a.om.member_type] ?? 3;
    const tB = typeOrder[b.om.member_type] ?? 3;
    if (tA !== tB) return tA - tB;
    // rank_level ASC for executives
    const rA = a.om.tbl_executive_role?.tbl_executive_rank?.rank_level ?? 999;
    const rB = b.om.tbl_executive_role?.tbl_executive_rank?.rank_level ?? 999;
    if (rA !== rB) return rA - rB;
    const lA = (a.om.tbl_user?.l_name ?? '').toLowerCase();
    const lB = (b.om.tbl_user?.l_name ?? '').toLowerCase();
    if (lA !== lB) return lA < lB ? -1 : 1;
    return ((a.om.tbl_user?.f_name ?? '').toLowerCase() < (b.om.tbl_user?.f_name ?? '').toLowerCase()) ? -1 : 1;
  });

  return withPriority.slice(0, 50).map(({ om }) => {
    const u = om.tbl_user;
    const er = om.tbl_executive_role;
    const rank = er?.tbl_executive_rank;
    const prog = u?.tbl_program_tbl_user_program_idTotbl_program;
    const cb = committeesByUser[om.user_id];
    return {
      user_id: u?.user_id,
      f_name: u?.f_name,
      l_name: u?.l_name,
      name: `${u?.f_name ?? ''} ${u?.l_name ?? ''}`.trim(),
      email: u?.email,
      program_name: prog?.name ?? 'Unknown Program',
      program_abbreviation: prog?.abbreviation ?? 'N/A',
      member_type: om.member_type,
      id: om.member_id,
      executive_role: er?.role_title ?? null,
      executive_rank_level: rank?.rank_level ?? null,
      executive_rank_title: rank?.default_title ?? null,
      committees: cb ? [...cb.names].join(', ') || null : null,
      committee_roles: cb ? [...cb.roles].join(', ') || null : null,
      member_status: om.status,
      joined_at: om.joined_at,
    };
  });
}

// ── Prisma: addMemberPermissionOverride ──────────────────────────────────
async function addMemberPermissionOverride(email, permissions, organization_id, organization_version_id, action_by_email) {
  const cycle_number = await _getCycleNumber(organization_id, organization_version_id);

  const user = await prisma.tbl_user.findFirst({ where: { email }, select: { user_id: true } });
  if (!user) throw new Error('User not found');

  const member = await prisma.tbl_organization_members.findFirst({
    where: { organization_id: Number(organization_id), cycle_number, user_id: user.user_id, status: 'Active' },
    select: { member_id: true },
  });
  if (!member) throw new Error('User is not an active member of this organization');

  // If user already has overrides, delete them so we can replace them (upsert behavior)
  await prisma.tbl_member_permission_override.deleteMany({ where: { member_id: member.member_id } });

  const permNames = permissions.map(p => p.permission_name);
  const perms = await prisma.tbl_permission.findMany({ where: { permission_name: { in: permNames } } });
  const permMap = Object.fromEntries(perms.map(p => [p.permission_name, p.permission_id]));

  const overrideData = permissions
    .filter(p => permMap[p.permission_name])
    .map(p => ({ member_id: member.member_id, permission_id: permMap[p.permission_name], is_allowed: p.is_allowed }));
  if (overrideData.length > 0) {
    await prisma.tbl_member_permission_override.createMany({ data: overrideData });
  }

  return _getMemberOverrideEntry(member.member_id, organization_id, cycle_number);
}

// ── Prisma: updateMemberPermissionOverride ────────────────────────────────
async function updateMemberPermissionOverride(member_id, organization_id, organization_version_id, permission_lists, action_by_email) {
  const cycle_number = await _getCycleNumber(organization_id, organization_version_id);

  const member = await prisma.tbl_organization_members.findFirst({
    where: { member_id: Number(member_id), organization_id: Number(organization_id), cycle_number, status: 'Active' },
    select: { member_id: true },
  });
  if (!member) throw new Error('Member not found or not active in this organization');

  // Replace permissions
  await prisma.tbl_member_permission_override.deleteMany({ where: { member_id: Number(member_id) } });
  if (permission_lists.length > 0) {
    const permNames = permission_lists.map(p => p.permission_name);
    const perms = await prisma.tbl_permission.findMany({ where: { permission_name: { in: permNames } } });
    const permMap = Object.fromEntries(perms.map(p => [p.permission_name, p.permission_id]));
    const overrideData = permission_lists
      .filter(p => permMap[p.permission_name])
      .map(p => ({ member_id: Number(member_id), permission_id: permMap[p.permission_name], is_allowed: p.is_allowed }));
    if (overrideData.length > 0) {
      await prisma.tbl_member_permission_override.createMany({ data: overrideData });
    }
  }

  return _getMemberOverrideEntry(member_id, organization_id, cycle_number);
}

// ── Prisma: removeMemberPermissionOverride ────────────────────────────────
async function removeMemberPermissionOverride(member_id, organization_id, organization_version_id, action_by_email) {
  const cycle_number = await _getCycleNumber(organization_id, organization_version_id);

  const member = await prisma.tbl_organization_members.findFirst({
    where: { member_id: Number(member_id), organization_id: Number(organization_id), cycle_number, status: 'Active' },
    select: { member_id: true },
  });
  if (!member) throw new Error('Member not found or not active in this organization');

  const overrideCount = await prisma.tbl_member_permission_override.count({ where: { member_id: Number(member_id) } });
  if (overrideCount === 0) throw new Error('Member does not have any permission overrides to remove');

  // Fetch entry before deletion (for response)
  const entry = await _getMemberOverrideEntry(member_id, organization_id, cycle_number);

  await prisma.tbl_member_permission_override.deleteMany({ where: { member_id: Number(member_id) } });

  return { ...entry, permission_overrides: [], total_overrides: 0 };
}

async function getLeaveApplications(org_id, org_version_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetPendingLeaveApplications(?, ?);', [org_id, org_version_id]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching leave applications:', error);
        throw error;
    } finally {
        connection.release();
    }
}

// Membership Questions functions
async function getMembershipQuestions(organization_id, cycle_number) {
    const connection = await pool.getConnection();
    try {
        const [questions] = await connection.execute(`
            SELECT question_id, organization_id, cycle_number, question_text, 
                   question_type, is_required, options
            FROM tbl_membership_question 
            WHERE organization_id = ? AND cycle_number = ?
            ORDER BY question_id ASC
        `, [organization_id, cycle_number]);
        
        return questions;
    } catch (error) {
        console.error('Error fetching membership questions:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function createMembershipQuestion(organization_id, cycle_number, question_text, question_type = 'text', is_required = true, options = null) {
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.execute(`
            INSERT INTO tbl_membership_question (organization_id, cycle_number, question_text, question_type, is_required, options)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [organization_id, cycle_number, question_text, question_type, is_required, options ? JSON.stringify(options) : null]);
        
        return { question_id: result.insertId, success: true };
    } catch (error) {
        console.error('Error creating membership question:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function updateMembershipQuestion(question_id, question_text, question_type, is_required, options = null) {
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.execute(`
            UPDATE tbl_membership_question 
            SET question_text = ?, question_type = ?, is_required = ?, options = ?
            WHERE question_id = ?
        `, [question_text, question_type, is_required, options ? JSON.stringify(options) : null, question_id]);
        
        return { affected_rows: result.affectedRows, success: result.affectedRows > 0 };
    } catch (error) {
        console.error('Error updating membership question:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function deleteMembershipQuestion(question_id) {
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.execute(`
            DELETE FROM tbl_membership_question WHERE question_id = ?
        `, [question_id]);
        
        return { affected_rows: result.affectedRows, success: result.affectedRows > 0 };
    } catch (error) {
        console.error('Error deleting membership question:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getMembershipResponses(application_id) {
    const connection = await pool.getConnection();
    try {
        const [responses] = await connection.execute(`
            SELECT mr.response_id, mr.application_id, mr.question_id, mr.response_value,
                   mq.question_text, mq.question_type, mq.is_required
            FROM tbl_membership_response mr
            JOIN tbl_membership_question mq ON mr.question_id = mq.question_id
            WHERE mr.application_id = ?
            ORDER BY mq.question_id ASC
        `, [application_id]);
        
        return responses;
    } catch (error) {
        console.error('Error fetching membership responses:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function createMembershipResponse(application_id, question_id, response_value) {
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.execute(`
            INSERT INTO tbl_membership_response (application_id, question_id, response_value)
            VALUES (?, ?, ?)
        `, [application_id, question_id, response_value]);
        
        return { response_id: result.insertId, success: true };
    } catch (error) {
        console.error('Error creating membership response:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function processMembershipApproval(application_id, reviewer_email, remarks) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL ProcessMembershipApproval(?, ?, ?);',
            [application_id, reviewer_email, remarks]
        );

        console.log(rows);
        
        // The procedure returns multiple result sets:
        // [0] = approved application details
        // [1] = transaction details (if exists)
        // [2] = new member details
        // [3] = archived members (for SSE publishing)
        return {
            approvedApplication: rows[0] ?? null,
            completedTransaction: rows[1] ?? null,
            newMember: rows[2] ?? null,
            archivedMembers: rows[3] ?? null
        };
    } catch (error) {
        console.error('Error processing membership approval:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function processMembershipRejection(application_id, reviewer_email, remarks) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL ProcessMembershipRejection(?, ?, ?);',
            [application_id, reviewer_email, remarks]
        );

        console.log(rows);
        
        // The procedure returns multiple result sets:
        // [0] = rejected application details
        // [1] = transaction details (if exists) - status updated to Failed
        return {
            rejectedApplication: rows[0] ?? null,
            failedTransaction: rows[1] ?? null
        };
    } catch (error) {
        console.error('Error processing membership rejection:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function approveLeaveApplication(leave_application_id, organization_id, organization_version_id, reviewer_email, remarks) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL ApproveLeaveApplication(?, ?, ?, ?, ?);',
            [leave_application_id, organization_id, organization_version_id, reviewer_email, remarks]
        );

        console.log(rows);
        
        // The procedure returns multiple result sets:
        // [0] = approved application details
        // [1] = archived members (for SSE publishing)
        return {
            approvedApplication: rows[0] ?? null,
            archivedMembers: rows[1] ?? null
        };
    } catch (error) {
        console.error('Error approving leave application:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function rejectLeaveApplication(leave_application_id, organization_id, organization_version_id, reviewer_email, remarks) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL RejectLeaveApplication(?, ?, ?, ?, ?);',
            [leave_application_id, organization_id, organization_version_id, reviewer_email, remarks]
        );

        console.log(rows);
        
        // The procedure returns the rejected application details
        return rows[0] ?? null;
    } catch (error) {
        console.error('Error rejecting leave application:', error);
        throw error;
    } finally {
        connection.release();
    }
}
async function getApplicationOfficers(application_id) {
    const connection = await pool.getConnection();
    try {
        console.log('🔍 [DB-DEBUG] getApplicationOfficers - Fetching officers for application_id:', application_id);
        const [rows] = await connection.query(`
            SELECT 
                ae.proposed_user_id as user_id,
                ae.proposed_name as name,
                ae.proposed_email as email,
                u.status,
                ae.proposed_title as title,
                u.f_name,
                u.l_name
            FROM tbl_application_executives ae
            LEFT JOIN tbl_user u ON ae.proposed_user_id = u.user_id
            WHERE ae.application_id = ?
        `, [application_id]);
        
        console.log('🔍 [DB-DEBUG] getApplicationOfficers - Retrieved officers:', {
          count: rows.length,
          officers: rows.map(row => ({
            user_id: row.user_id,
            name: row.name,
            email: row.email,
            f_name: row.f_name,
            l_name: row.l_name,
            title: row.title,
            status: row.status
          }))
        });
        
        return rows;
    } catch (error) {
        console.error('❌ [DB-DEBUG] Error getting application officers:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function updateOrganizationPaymentType(organization_id, paymentData) {
    const connection = await pool.getConnection();
    try {
        const { membership_fee_type, membership_fee_amount } = paymentData;
        
        // Write to the current organization version (versioned data), not the parent row
        const [rows] = await connection.query(`
            UPDATE tbl_organization_version
            SET membership_fee_type = ?,
                membership_fee_amount = ?
            WHERE org_version_id = (
                SELECT current_org_version_id FROM tbl_organization WHERE organization_id = ?
            )
        `, [membership_fee_type, membership_fee_amount, organization_id]);
        
        if (rows.affectedRows === 0) {
            throw new Error('Organization not found');
        }
        
        return { 
            success: true, 
            affectedRows: rows.affectedRows,
            organization_id,
            membership_fee_type,
            membership_fee_amount
        };
    } catch (error) {
        console.error('Error updating organization payment type:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function updateOrganizationTermOption(organization_id, organization_version_id, term_option) {
    let connection;
    
    try {
        connection = await pool.getConnection();
        
        // Call the stored procedure UpdateOrganizationTermOption
        const [rows] = await connection.query(
            'CALL UpdateOrganizationTermOption(?, ?, ?)',
            [organization_id, organization_version_id, term_option]
        );
        
        return rows[0][0]; // Return the result from the stored procedure
        
    } catch (error) {
        console.error('Error updating organization term option:', error);
        throw error;
    } finally {
        if (connection) {
            connection.release();
        }
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
    getOrganizationById,
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
    createApprovalChain,
    sendApprovalNotification,
    getApprovedOrganizationLogos,
    checkOrgRenewalStatus,
    getOrganizationDashboardOverview,
    getAllOrganizations,
    getAllApplicationsByOrganization,
    getUserOrganization,
    getOrganizationCommitteeRoles,
    getOrganizationExecutives,
    getOrganizationPermissions,
    updateCommitteePermissions,
    updateExecutivePermissions,
    getMemberPermissionOverrides,
    getEmailSuggestionOverride,
    addMemberPermissionOverride,
    updateMemberPermissionOverride,
    removeMemberPermissionOverride,
    getArchivedOrganizationMembers,
    unarchiveOrganizationMember,
    getLeaveApplications,
    // Membership Questions functions
    getMembershipQuestions,
    createMembershipQuestion,
    updateMembershipQuestion,
    deleteMembershipQuestion,
    getMembershipResponses,
    markApprovalAsReceived,
    markApprovalAsSigned,
    checkUserHasESignature,
    createMembershipResponse,
    processMembershipApproval,
    processMembershipRejection,
    approveLeaveApplication,
    rejectLeaveApplication,
    getApplicationOfficers,
    updateOrganizationPaymentType,
    updateOrganizationTermOption,
    // E-signature approval chain functions
    getApprovalChain,  // NEW: Use sp_GetApprovalChain with proper field names
    getApprovalChainById,
    markApprovalAsReceived,
    markApprovalAsSigned,
    uploadApprovalSignature,
    checkUserSignature,
    uploadUserSignature
};