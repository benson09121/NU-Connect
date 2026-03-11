const pool = require('../../config/db');
const { prisma } = require('../../config/db');

async function addEvent(event) {
    const connection = await pool.getConnection();
    try {
        const sql = `INSERT INTO tbl_event (
            event_id, title, description, venue_type, venue, start_date, end_date, start_time, end_time, 
            capacity, certificate, fee, is_open_to, organization_id, cycle_number, event_type, 
            status, type, user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const params = [
            event.event_id, event.title, event.description, event.venue_type || 'Face to face', 
            event.venue, event.start_date || event.date, event.end_date || event.date, 
            event.start_time, event.end_time, event.capacity, event.certificate, event.fee, 
            event.is_open_to || 'Members only', event.organization_id, event.cycle_number,
            event.event_type || 'Organization', event.status, event.type, event.user_id, 
            event.created_at
        ];
        const [result] = await connection.query(sql, params);
        return result;
    } finally {
        connection.release();
    }
}

async function getEventRequirements() {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query('CALL GetEventRequirements();');
    return rows[0];
  } finally {
    connection.release();
  }
}

async function saveEventRequirements(user_id, requirements) {
  const connection = await pool.getConnection();
  try {
    // requirements should be a JS array; stringify for MySQL JSON
    const [result] = await connection.query(
      'CALL SaveEventRequirements(?, ?);',
      [user_id, JSON.stringify(requirements)]
    );
    return result;
  } finally {
    connection.release();
  }
}

async function getEvents() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetEvents();');
        return rows[0];
    } finally {
        connection.release();
    }
}

async function getEventById(event_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetEventById(?);', [event_id]);
        return rows[0];
    } finally {
        connection.release();
    }
}

async function getAttendeesByEventId(event_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetEventAttendeesWithDetails(?);', [event_id]);
        return rows[0];
    } finally {
        connection.release();
    }
}

async function getEventsByStatus(status) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetEventsByStatus(?);', [status]);
        return rows[0];
    } finally {
        connection.release();
    }
}

async function updateEvent(event_id, event) {
    const connection = await pool.getConnection();
    try {
        const sql = `UPDATE tbl_event SET
            title = ?, description = ?, venue_type = ?, venue = ?, start_date = ?, end_date = ?, 
            start_time = ?, end_time = ?, capacity = ?, certificate = ?, fee = ?, is_open_to = ?, 
            organization_id = ?, cycle_number = ?, event_type = ?, status = ?, type = ?, 
            user_id = ?, created_at = ?
            WHERE event_id = ?`;
        const params = [
            event.title, event.description, event.venue_type || 'Face to face', event.venue, 
            event.start_date || event.date, event.end_date || event.date, event.start_time, 
            event.end_time, event.capacity, event.certificate, event.fee, 
            event.is_open_to || 'Members only', event.organization_id, event.cycle_number,
            event.event_type || 'Organization', event.status, event.type, event.user_id, 
            event.created_at, event_id
        ];
        const [result] = await connection.query(sql, params);
        return result;
    } finally {
        connection.release();
    }
}

async function deleteEvent(event_id) {
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.query('DELETE FROM tbl_event WHERE event_id = ?', [event_id]);
        return result;
    } finally {
        connection.release();
    }
}

async function getUserByEmail(email) {
  const user = await prisma.tbl_user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { user_id: true }
  });
  return user ?? null;
}

async function approvePaidEventRegistration(event_id, user_id, approver_id, remarks) {
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.query(
            'CALL ApprovePaidEventRegistration(?, ?, ?, ?);', 
            [event_id, user_id, approver_id, remarks]
        );
        return result;
    } finally {
        connection.release();
    }
}

async function rejectPaidEventRegistration(event_id, user_id, approver_id, remarks) {
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.query(
            'CALL RejectPaidEventRegistration(?, ?, ?, ?);', 
            [event_id, user_id, approver_id, remarks]
        );
        return result;
    } finally {
        connection.release();
    }
}

async function getEventStats(event_id) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query('CALL GetEventStatistics(?)', [event_id]);
    return rows[0][0]; // Return the first row of the first result set
  } finally {
    connection.release();
  }
}

async function getAllEvaluationQuestions() {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query('CALL GetAllEvaluationQuestions();');
    return rows[0]; 
  } finally {
    connection.release();
  }
}

async function getEventEvaluationResponsesByGroup(event_id) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query('CALL GetEventEvaluationResponsesByGroup(?);', [event_id]);
    if (rows[0] && rows[0][0] && rows[0][0].evaluation_responses) {
      const data = rows[0][0].evaluation_responses;
      if (typeof data === 'string') {
        return JSON.parse(data);
      }
      return data;
    }
    return [];
  } finally {
    connection.release();
  }
}

async function getEventApplicationDetails(event_application_id) {
  const connection = await pool.getConnection();
  try {
    const [results] = await connection.query('CALL GetEventApplicationDetails(?);', [event_application_id]);
    // MySQL returns multiple result sets for each SELECT in the procedure
    return {
      application: results[0][0] || null,
      requirements: results[1] || []
    };
  } finally {
    connection.release();
  }
}

async function getEventApplicationIdByProposedEventId(proposed_event_id) {
  const [rows] = await pool.query(
    'SELECT event_application_id FROM tbl_event_application WHERE proposed_event_id = ? LIMIT 1',
    [proposed_event_id]
  );
  return rows.length > 0 ? rows[0].event_application_id : null;
}

async function createEventApplication(
  organization_id,
  cycle_number,
  applicant_user_id,
  event,
  requirements,
  collaborators // <-- new param
) {
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.query(
      'CALL CreateEventApplication(?, ?, ?, ?, ?, ?);',
      [
        organization_id,
        cycle_number,
        applicant_user_id,
        JSON.stringify(event),
        JSON.stringify(requirements),
        collaborators ? JSON.stringify(collaborators) : null
      ]
    );
    return result[0];
  } finally {
    connection.release();
  }
}

async function getOrganizationMembership(user_id) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      'SELECT organization_id, cycle_number FROM tbl_organization_members WHERE user_id = ? ORDER BY joined_at DESC LIMIT 1',
      [user_id]
    );
    return rows[0] || null;
  } finally {
    connection.release();
  }
}

async function approveEventApplication(approval_id, comment, event_application_id, user_id) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      'CALL ApproveEventApplication(?, ?, ?, ?);',
      [approval_id, comment, event_application_id, user_id]
    );
    return rows[0];
  } finally {
    connection.release();
  }
}

async function rejectEventApplication(approval_id, event_application_id, comment, user_id) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      'CALL RejectEventApplication(?, ?, ?, ?);',
      [approval_id, event_application_id, comment, user_id]
    );
    return rows[0];
  } finally {
    connection.release();
  }
}

async function getEventEvaluationConfig(event_id) {
  const connection = await pool.getConnection();
  try {
    const [results] = await connection.query('CALL GetEventEvaluationConfig(?);', [event_id]);
    // MySQL returns multiple result sets for each SELECT in the procedure
    return {
      settings: results[0][0] || null,
      enabledGroups: results[1] || [],
      allGroups: results[2] || [],
      certificateTemplate: results[3][0] || null
    };

  } finally {
    connection.release();
  }
}

async function updateEventEvaluationConfig(event_id, group_ids, evaluation_end_date, evaluation_end_time, user_id) {
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.query(
      'CALL UpdateEventEvaluationConfig(?, ?, ?, ?, ?);',
      [
        event_id,
        JSON.stringify(group_ids),
        evaluation_end_date,
        evaluation_end_time,
        user_id
      ]
    );
    return result;
  } finally {
    connection.release();
  }
}

async function uploadOrUpdatePostEventRequirement({
  event_id,
  event_application_id,
  requirement_id,
  cycle_number,
  organization_id,
  file_path,
  submitted_by
}) {
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.query(
      'CALL UploadOrUpdatePostEventRequirement(?, ?, ?, ?, ?, ?, ?);',
      [
        event_id,
        event_application_id,
        requirement_id,
        cycle_number,
        organization_id,
        file_path,
        submitted_by
      ]
    );
    return result;
  } finally {
    connection.release();
  }
}

async function getEventRequirementSubmissions({
  event_id,
  event_application_id = null,
  requirement_id = null,
  submitted_by = null
}) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      'CALL GetEventRequirementSubmissions(?, ?, ?, ?);',
      [event_id, event_application_id, requirement_id, submitted_by]
    );
    return rows[0];
  } finally {
    connection.release();
  }
}

async function markEventRequirementAsViewed(submission_id, user_email) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      'CALL MarkEventRequirementAsViewed(?, ?);',
      [submission_id, user_email]
    );
    return rows[0]?.[0] || null;
  } finally {
    connection.release();
  }
}

async function approvePostEventRequirement(submission_id, user_email, remarks) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      'CALL ApprovePostEventRequirement(?, ?, ?);',
      [submission_id, user_email, remarks || null]
    );
    return rows[0]?.[0] || null;
  } finally {
    connection.release();
  }
}

async function rejectPostEventRequirement(submission_id, user_email, remarks) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      'CALL RejectPostEventRequirement(?, ?, ?);',
      [submission_id, user_email, remarks || null]
    );
    return rows[0]?.[0] || null;
  } finally {
    connection.release();
  }
}

async function createEvent(event) {
  const connection = await pool.getConnection();
  try {
    const sql = 'CALL CreateEvent(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);';
    const params = [
      event.user_id,                                   // 1: p_user_id
      event.title,                                     // 2: p_title
      event.description,                               // 3: p_description
      event.venue_type,                                // 4: p_venue_type
      event.venue ?? null,                             // 5: p_venue
      event.start_date,                                // 6: p_start_date
      event.end_date ?? event.start_date,              // 7: p_end_date
      event.start_time,                                // 8: p_start_time
      event.end_time,                                  // 9: p_end_time
      event.organization_id ?? null,                   // 10: p_organization_id
      event.cycle_number ?? null,                      // 11: p_cycle_number
      event.event_type ?? 'Organization',              // 12: p_event_type
      event.status ?? 'Pending',                       // 13: p_status
      event.type ?? 'Free',                            // 14: p_type
      event.is_open_to ?? 'Open to all',               // 15: p_is_open_to
      event.fee === '' || event.fee == null ? null : event.fee,                  // 16: p_fee
      event.capacity === '' || event.capacity == null ? null : event.capacity,  // 17: p_capacity
      event.image ?? null,                             // 18: p_image
      event.collaborators ? JSON.stringify(event.collaborators) : null // 19: p_collaborators
    ];

    const [rows] = await connection.query(sql, params);
    return rows?.[0]?.[0] ?? rows?.[0] ?? null;
  } finally {
    connection.release();
  }
}

async function getaddEventStatus(orgName) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL GetAddEventStatus(?);',
            [orgName]
        );
        return rows[0][0]; // Return the first row (object with id, cycle_number, can_add_event)
    } finally {
        connection.release();
    }
}

async function getaddEventStatusById(orgId) {
    // Get most recent event for this org
    const lastEvent = await prisma.tbl_event.findFirst({
        where: { organization_id: orgId },
        orderBy: { created_at: 'desc' },
        select: { event_id: true, status: true, cycle_number: true }
    });

    if (!lastEvent) {
        // No event yet — allow adding; return max cycle_number for org
        const maxCycle = await prisma.tbl_renewal_cycle.findFirst({
            where: { organization_id: orgId },
            orderBy: { cycle_number: 'desc' },
            select: { cycle_number: true }
        });
        return { id: null, cycle_number: maxCycle?.cycle_number ?? null, can_add_event: true };
    }

    // Count total post-event requirements
    const postReqCount = await prisma.tbl_event_application_requirement.count({
        where: { is_applicable_to: 'post_event' }
    });

    // Count distinct post-event requirements submitted for this event (any status)
    const submittedGroups = await prisma.tbl_event_requirement_submissions.groupBy({
        by: ['requirement_id'],
        where: {
            event_id: lastEvent.event_id,
            tbl_event_application_requirement: { is_applicable_to: 'post_event' }
        }
    });
    const submittedCount = submittedGroups.length;

    const canAdd = lastEvent.status === 'Rejected' || postReqCount === submittedCount;
    return { id: lastEvent.event_id, cycle_number: lastEvent.cycle_number, can_add_event: canAdd };
}

async function getEventApprovalTimeline(event_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetEventApprovalTimeline(?);', [event_id]);
        return rows[0];
    } finally {
        connection.release();
    }
}

async function getEventEvaluationFeedbackPeriod(event_id){
  const connection = await pool.getConnection();
  try {
      const [rows] = await connection.query('CALL GetEventEvaluationFeedbackPeriod(?);', [event_id]);
      return rows[0];
  } finally {
      connection.release();
  }
}

async function AddCertificateTemplate(event_id, filepath, user_id_or_email) {
    const connection = await pool.getConnection();
    try {
        let user_id = user_id_or_email;
        // If it's an email, look up user_id
        if (user_id_or_email && user_id_or_email.includes('@')) {
            const [rows] = await connection.query('SELECT user_id FROM tbl_user WHERE email = ?', [user_id_or_email]);
            if (!rows[0]) throw new Error('Uploader user not found');
            user_id = rows[0].user_id;
        }
        const [rows] = await connection.query('CALL AddCertificateTemplate(?, ?, ?);', [event_id, filepath, user_id]);
        return rows[0];
    } finally {
        connection.release();
    }
}

async function getCertificateTemplate(event_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetCertificateTemplate(?);', [event_id]);
        return rows[0]; // returns [{ template_path: 'event-86-template.docx', ... }]
    } finally {
        connection.release();
    }
}

async function DeleteCertificateTemplate(event_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL DeleteCertificateTemplate(?);', [event_id]);
        // MySQL SP returns: [[{ deleted_template_path: 'filename.docx' }], ...]
        return rows[0]?.deleted_template_path || rows[0]?.[0]?.deleted_template_path || null;
    } finally {
        connection.release();
    }
}

async function checkEventTitle(title) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL CheckEventTitle(?);', [title]);
        return rows[0][0]; // Return the first row of the first result set
    } finally {
        connection.release();
    }
}

async function checkScheduleConflict(params) {
    const connection = await pool.getConnection();
    try {
        console.log('Checking schedule conflict with enhanced validation...', params);
        
        const {
            event_title,
            organization_id,
            committee_id,
            venue,
            start_date,
            end_date,
            start_time,
            end_time,
            event_id
        } = params;
        
        const [rows] = await connection.query(
            'CALL CheckScheduleConflict(?, ?, ?, ?, ?, ?, ?, ?);', 
            [
                event_title || null,
                organization_id || null,
                committee_id || null,
                venue || null,
                start_date,
                start_time,
                end_time,
                event_id || null
            ]
        );
        
        // The stored procedure returns conflict information if any
        return rows[0] || []; // Return the first result set (array of conflicts)
    } finally {
        connection.release();
    }
}

async function createBlockedPeriod({ start_date, end_date, reason, created_by }) {
    const connection = await pool.getConnection();
    try {
        // First check for overlapping periods to provide specific error information
        const [existingPeriods] = await connection.query(`
            SELECT blocked_period_id, start_date, end_date, reason 
            FROM tbl_blocked_period 
            WHERE archived_at IS NULL 
            AND (
                (start_date <= ? AND end_date >= ?) OR
                (start_date <= ? AND end_date >= ?) OR
                (start_date >= ? AND end_date <= ?)
            )
        `, [start_date, start_date, end_date, end_date, start_date, end_date]);
        
        if (existingPeriods.length > 0) {
            const conflictDetails = existingPeriods.map(p => {
                const startDate = new Date(p.start_date).toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                });
                const endDate = new Date(p.end_date).toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                });
                return `"${p.reason}" (${startDate} to ${endDate})`;
            }).join(', ');
            
            const error = new Error(`Blocked period overlaps with existing blocked period(s): ${conflictDetails}`);
            error.code = 'ER_SIGNAL_EXCEPTION';
            error.sqlState = '45000';
            error.conflictingPeriods = existingPeriods;
            throw error;
        }
        
        const [rows] = await connection.query('CALL CreateBlockedPeriod(?, ?, ?, ?)', [start_date, end_date, reason, created_by]);
        return rows;
    } catch (error) {
        console.error('Error in createBlockedPeriod:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function updateBlockedPeriod({ blocked_period_id, start_date, end_date, reason, updated_by }) {
    const connection = await pool.getConnection();
    try {
        // Check for overlapping periods (excluding the current one being updated)
        const [existingPeriods] = await connection.query(`
            SELECT blocked_period_id, start_date, end_date, reason 
            FROM tbl_blocked_period 
            WHERE archived_at IS NULL 
            AND blocked_period_id != ?
            AND (
                (start_date <= ? AND end_date >= ?) OR
                (start_date <= ? AND end_date >= ?) OR
                (start_date >= ? AND end_date <= ?)
            )
        `, [blocked_period_id, start_date, start_date, end_date, end_date, start_date, end_date]);
        
        if (existingPeriods.length > 0) {
            const conflictDetails = existingPeriods.map(p => {
                const startDate = new Date(p.start_date).toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                });
                const endDate = new Date(p.end_date).toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                });
                return `"${p.reason}" (${startDate} to ${endDate})`;
            }).join(', ');
            
            const error = new Error(`Updated date range overlaps with existing blocked period(s): ${conflictDetails}`);
            error.code = 'ER_SIGNAL_EXCEPTION';
            error.sqlState = '45000';
            error.conflictingPeriods = existingPeriods;
            throw error;
        }
        
        const [rows] = await connection.query('CALL UpdateBlockedPeriod(?, ?, ?, ?, ?)', [blocked_period_id, start_date, end_date, reason, updated_by]);
        return rows;
    } catch (error) {
        console.error('Error in updateBlockedPeriod:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function archiveBlockedPeriod({ blocked_period_id, archived_by, archived_reason }) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL ArchiveBlockedPeriod(?, ?, ?)', [blocked_period_id, archived_by, archived_reason]);
        return rows;
    } catch (error) {
        console.error('Error in archiveBlockedPeriod:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function unarchiveBlockedPeriod({ blocked_period_id, unarchived_by, unarchived_reason }) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL UnarchiveBlockedPeriod(?, ?, ?)', [blocked_period_id, unarchived_by, unarchived_reason || null]);
        return rows;
    } catch (error) {
        console.error('Error in unarchiveBlockedPeriod:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function deleteBlockedPeriod({ blocked_period_id, deleted_by }) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL DeleteBlockedPeriod(?, ?)', [blocked_period_id, deleted_by]);
        return rows;
    } catch (error) {
        console.error('Error in deleteBlockedPeriod:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getBlockedPeriodsByStatus(status) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetBlockedPeriodsByStatus(?)', [status]);
        return rows[0];
    } catch (error) {
        console.error('Error in getBlockedPeriodsByStatus:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getAllBlockedPeriods() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetAllBlockedPeriods()');
        return rows[0] || [];
    } catch (error) {
        console.error('Error in getAllBlockedPeriods:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getEventsByUserRole(user_id_or_email) {
    // Step 1: Resolve user with role and program/college info
    const user = await prisma.tbl_user.findFirst({
        where: {
            OR: [
                { user_id: user_id_or_email },
                { email: { equals: user_id_or_email, mode: 'insensitive' } }
            ]
        },
        select: {
            user_id: true,
            program_id: true,
            tbl_role: { select: { role_name: true } },
            tbl_program: { select: { college_id: true } }
        }
    });

    const collab_cte = `
        collab_json AS (
            SELECT ec.event_id,
                   json_agg(json_build_object('organization_id', o.organization_id, 'name', o.name)) AS collaborators
            FROM tbl_event_collaborator ec
            JOIN tbl_organization o ON o.organization_id = ec.organization_id
            GROUP BY ec.event_id
        )`;

    const select_cols = `
        SELECT DISTINCT e.*,
               o.name AS organization_name,
               rc.org_version_id AS organization_version_id,
               COALESCE(cj.collaborators::text, '[]') AS collaborators
        FROM tbl_event e
        LEFT JOIN tbl_organization o ON o.organization_id = e.organization_id
        LEFT JOIN tbl_renewal_cycle rc
               ON rc.organization_id = e.organization_id AND rc.cycle_number = e.cycle_number
        LEFT JOIN collab_json cj ON cj.event_id = e.event_id`;

    // Step 2: No user found — only global events
    if (!user) {
        return prisma.$queryRawUnsafe(`
            WITH ${collab_cte}
            ${select_cols}
            WHERE e.event_type IN ('SDAO', 'System')
            ORDER BY e.start_date DESC, e.created_at DESC
        `);
    }

    const roleName = user.tbl_role?.role_name ?? '';
    const userId = user.user_id;
    const programId = user.program_id;
    const collegeId = user.tbl_program?.college_id ?? null;

    // Step 3: SDAO / Academic Director — all events
    if (roleName === 'SDAO' || roleName === 'Academic Director') {
        return prisma.$queryRawUnsafe(`
            WITH ${collab_cte}
            ${select_cols}
            ORDER BY e.start_date DESC, e.created_at DESC
        `);
    }

    // Step 4: Everyone else — role-scoped
    const safeRole = roleName.replace(/'/g, "''");
    const params = [userId];
    let p = 2; // next param index

    const programConds = [];
    if (programId != null) {
        programConds.push(
            `(ui_role = 'Program Chair' AND EXISTS (
                SELECT 1 FROM tbl_organization po
                JOIN tbl_organization_version pov ON pov.org_version_id = po.current_org_version_id
                WHERE po.organization_id = e.organization_id AND pov.base_program_id = $${p}
            ))`,
            `(ui_role = 'Program Chair' AND EXISTS (
                SELECT 1 FROM tbl_event_collaborator ec4
                JOIN tbl_organization po2 ON po2.organization_id = ec4.organization_id
                JOIN tbl_organization_version pov2 ON pov2.org_version_id = po2.current_org_version_id
                WHERE ec4.event_id = e.event_id AND pov2.base_program_id = $${p}
            ))`,
            `(ui_role = 'Program Chair' AND EXISTS (
                SELECT 1 FROM tbl_event_application ea3
                WHERE ea3.proposed_event_id = e.event_id AND EXISTS (
                    SELECT 1 FROM tbl_organization po3
                    JOIN tbl_organization_version pov3 ON pov3.org_version_id = po3.current_org_version_id
                    WHERE po3.organization_id = ea3.organization_id AND pov3.base_program_id = $${p}
                )
            ))`
        );
        params.push(programId);
        p++;
    }

    const collegeConds = [];
    if (collegeId != null) {
        collegeConds.push(
            `(ui_role = 'Dean' AND EXISTS (
                SELECT 1 FROM tbl_organization do1
                JOIN tbl_organization_version dov1 ON dov1.org_version_id = do1.current_org_version_id
                JOIN tbl_program dp1 ON dp1.program_id = dov1.base_program_id
                WHERE do1.organization_id = e.organization_id AND dp1.college_id = $${p}
            ))`,
            `(ui_role = 'Dean' AND EXISTS (
                SELECT 1 FROM tbl_event_collaborator ec5
                JOIN tbl_organization do2 ON do2.organization_id = ec5.organization_id
                JOIN tbl_organization_version dov2 ON dov2.org_version_id = do2.current_org_version_id
                JOIN tbl_program dp2 ON dp2.program_id = dov2.base_program_id
                WHERE ec5.event_id = e.event_id AND dp2.college_id = $${p}
            ))`,
            `(ui_role = 'Dean' AND EXISTS (
                SELECT 1 FROM tbl_event_application ea4
                WHERE ea4.proposed_event_id = e.event_id AND EXISTS (
                    SELECT 1 FROM tbl_organization do3
                    JOIN tbl_organization_version dov3 ON dov3.org_version_id = do3.current_org_version_id
                    JOIN tbl_program dp3 ON dp3.program_id = dov3.base_program_id
                    WHERE do3.organization_id = ea4.organization_id AND dp3.college_id = $${p}
                )
            ))`
        );
        params.push(collegeId);
        p++;
    }

    const conditions = [
        `e.event_type IN ('SDAO', 'System')`,
        `e.user_id = $1`,
        `EXISTS (
            SELECT 1 FROM tbl_organization_members m
            WHERE m.user_id = $1
              AND (m.status IS NULL OR m.status IN ('Active', 'Pending'))
              AND m.organization_id = e.organization_id
        )`,
        `EXISTS (
            SELECT 1 FROM tbl_event_collaborator ec2
            JOIN tbl_organization_members m2 ON m2.organization_id = ec2.organization_id
            WHERE ec2.event_id = e.event_id
              AND m2.user_id = $1
              AND (m2.status IS NULL OR m2.status IN ('Active', 'Pending'))
        )`,
        `(ui_role = 'Adviser' AND EXISTS (
            SELECT 1 FROM tbl_organization ao
            WHERE ao.organization_id = e.organization_id AND ao.adviser_id = $1
        ))`,
        `(ui_role = 'Adviser' AND EXISTS (
            SELECT 1 FROM tbl_event_collaborator ec3
            JOIN tbl_organization ao2 ON ao2.organization_id = ec3.organization_id
            WHERE ec3.event_id = e.event_id AND ao2.adviser_id = $1
        ))`,
        ...programConds,
        ...collegeConds,
        `EXISTS (
            SELECT 1 FROM tbl_event_application ea
            WHERE ea.proposed_event_id = e.event_id AND (
                ea.applicant_user_id = $1
                OR EXISTS (
                    SELECT 1 FROM tbl_organization_members m3
                    WHERE m3.user_id = $1
                      AND (m3.status IS NULL OR m3.status IN ('Active', 'Pending'))
                      AND m3.organization_id = ea.organization_id
                )
                OR (ui_role = 'Adviser' AND EXISTS (
                    SELECT 1 FROM tbl_organization ao3
                    WHERE ao3.organization_id = ea.organization_id AND ao3.adviser_id = $1
                ))
            )
        )`
    ].join('\n        OR ');

    const sql = `
        WITH role_ctx AS (SELECT '${safeRole}' AS ui_role),
        ${collab_cte}
        ${select_cols}
        CROSS JOIN role_ctx
        WHERE ${conditions}
        ORDER BY e.start_date DESC, e.created_at DESC
    `;

    return prisma.$queryRawUnsafe(sql, ...params);
}

async function archiveEvent(event_id, user_id, reason) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL ArchiveEvent(?, ?, ?);', [event_id, user_id, reason]);
        return rows[0]?.[0] || null;
    } finally {
        connection.release();
    }
}

async function unarchiveEvent(event_id, user_id, reason) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL UnarchiveEvent(?, ?, ?);', [event_id, user_id, reason]);
        return rows[0]?.[0] || null;
    } finally {
        connection.release();
    }
}

async function updateEventSDAO(event_id, event, user_id, collaboratorsParam) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      'CALL UpdateEvent(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
      [
        event_id,
        event.title,
        event.description,
        event.venue_type,
        event.venue,
        event.start_date,
        event.end_date,
        event.start_time,
        event.end_time,
        event.status,
        event.type,
        event.is_open_to,
        event.fee,
        event.capacity,
        event.image,
        user_id,
        collaboratorsParam // <== NEW 17th arg (NULL | '[]' | '[1,2,...]')
      ]
    );
    return rows[0]?.[0] || null;
  } finally {
    connection.release();
  }
}

async function deleteEventSDAO(event_id, user_id, reason) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query('CALL DeleteEvent(?, ?, ?);', [
      event_id,
      user_id,
      (reason && String(reason).trim() !== '') ? reason.trim() : null
    ]);
    // rows[0]?.[0]?.result may hold the JSON from the SP (if you kept the SELECT)
    const spPayload = rows?.[0]?.[0] || null;
    return spPayload;
  } catch (err) {
    // Detailed logs for backend
    console.error('[Model.deleteEventSDAO] SP DeleteEvent failed', {
      event_id, user_id, hasReason: !!reason,
      code: err.code, errno: err.errno, sqlState: err.sqlState, message: err.message
    });
    throw err;
  } finally {
    connection.release();
  }
}


async function getOneEventAttendeesWithDetails(event_id, user_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetOneEventAttendeesWithDetails(?, ?);', [event_id, user_id]);
        return rows[0];
    } finally {
        connection.release();
    }
}

async function getOrganizationVersionId(organization_id) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      'SELECT current_org_version_id FROM tbl_organization WHERE organization_id = ? LIMIT 1',
      [organization_id]
    );
    return rows[0]?.current_org_version_id || null;
  } finally {
    connection.release();
  }

}

module.exports = {
    addEvent,
    getEventRequirements,
    saveEventRequirements,
    getEvents,
    getEventById,
    getAttendeesByEventId,
    updateEvent,
    deleteEvent,
    getEventsByStatus,
    getUserByEmail,
    approvePaidEventRegistration,
    rejectPaidEventRegistration,
    getEventStats,
    getAllEvaluationQuestions,
    getEventEvaluationResponsesByGroup,
    getEventApplicationDetails,
    getEventApplicationIdByProposedEventId,
    createEventApplication,
    getOrganizationMembership,
    approveEventApplication,
    rejectEventApplication,
    getEventEvaluationConfig,
    updateEventEvaluationConfig,
    uploadOrUpdatePostEventRequirement,
    getEventRequirementSubmissions,
    markEventRequirementAsViewed,
    approvePostEventRequirement,
    rejectPostEventRequirement,
    createEvent,
    getaddEventStatus,
    getaddEventStatusById,
    getEventApprovalTimeline,
    getEventEvaluationFeedbackPeriod,
    AddCertificateTemplate,
    getCertificateTemplate,
    DeleteCertificateTemplate,
    checkEventTitle,
    checkScheduleConflict,
    createBlockedPeriod,
    updateBlockedPeriod,
    archiveBlockedPeriod,
    unarchiveBlockedPeriod,
    deleteBlockedPeriod,
    getBlockedPeriodsByStatus,
    getAllBlockedPeriods,
    getEventsByUserRole,
    archiveEvent,
    unarchiveEvent,
    updateEventSDAO,
    deleteEventSDAO,
    getOneEventAttendeesWithDetails,
    getOrganizationVersionId
};