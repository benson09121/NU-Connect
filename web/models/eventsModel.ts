/**
 * web/models/eventsModel.ts
 *
 * Prisma-based queries for the Events page.
 * Refactored from the legacy eventModel.js (stored-procedure + MySQL pool approach).
 *
 * Covered endpoints:
 *   GET /events/by-user-role
 *   GET /events/add-event-status
 */

import { prisma } from '../../config/db';
import {
  event_status,
  event_type,
  event_fee_type,
  event_open_to,
  venue_type as venue_type_enum,
} from '../../lib/generated/prisma/client';

// ---------------------------------------------------------------------------
// Enum normalizers — convert frontend strings to Prisma enum keys.
// Needed because @map() values (e.g. "Face to face") differ from enum keys.
// ---------------------------------------------------------------------------

function toVenueType(s: string): venue_type_enum {
  if (s === 'Face to face' || s === 'Face_to_face') return venue_type_enum.Face_to_face;
  return venue_type_enum.Online;
}

function toEventType(s: string): event_type {
  if (s === 'SDAO') return event_type.SDAO;
  if (s === 'System') return event_type.System;
  return event_type.Organization;
}

function toEventStatus(s: string): event_status {
  if (s === 'Approved') return event_status.Approved;
  if (s === 'Rejected') return event_status.Rejected;
  if (s === 'Archived') return event_status.Archived;
  return event_status.Pending;
}

function toFeeType(s: string): event_fee_type {
  if (s === 'Paid') return event_fee_type.Paid;
  return event_fee_type.Free;
}

function toOpenTo(s: string): event_open_to {
  if (s === 'Members only' || s === 'Members_only') return event_open_to.Members_only;
  if (s === 'NU Students only' || s === 'NU_Students_only') return event_open_to.NU_Students_only;
  return event_open_to.Open_to_all;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Look up a user by email (case-insensitive). Returns null when not found. */
export async function getUserByEmail(email: string) {
  return prisma.tbl_user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { user_id: true },
  });
}

// ---------------------------------------------------------------------------
// GET /events/by-user-role
// ---------------------------------------------------------------------------

/**
 * Returns events visible to a given user based on their role and org memberships.
 * Replicates the logic of the GetEventsByUserRole stored procedure in pure Prisma + raw SQL.
 *
 * Scope rules:
 *   - No user found          → SDAO/System events only
 *   - SDAO / Academic Dir    → all events
 *   - Everyone else          → member orgs + own events + advanced role conditions
 */
export async function getEventsByUserRole(userId: string): Promise<unknown[]> {
  // Resolve the user's role and program/college context
  const user = await prisma.tbl_user.findFirst({
    where: { user_id: userId },
    select: {
      program_id: true,
      tbl_role: { select: { role_name: true } },
      tbl_program_tbl_user_program_idTotbl_program: { select: { college_id: true } },
    },
  });

  // CTE: per-event collaborator JSON array
  const collabCte = `
    collab_json AS (
      SELECT ec.event_id,
             json_agg(
               json_build_object(
                 'organization_id', o.organization_id,
                 'organization_name', o.name,
                 'base_program_id', ov.base_program_id
               )
             ) AS collaborators
      FROM tbl_event_collaborator ec
      JOIN tbl_organization o         ON o.organization_id = ec.organization_id
      LEFT JOIN tbl_organization_version ov ON ov.org_version_id = o.current_org_version_id
      GROUP BY ec.event_id
    )`;

  // CTE: per-event schedule JSON array
  const scheduleCte = `
    schedule_json AS (
      SELECT es.event_id,
             json_agg(
               json_build_object(
                 'date',       to_char(es.date,       'YYYY-MM-DD'),
                 'start_time', to_char(es.start_time, 'HH24:MI:SS'),
                 'end_time',   to_char(es.end_time,   'HH24:MI:SS'),
                 'venue_ids',  COALESCE((
                                 SELECT json_agg(esv.venue_id ORDER BY esv.venue_id)
                                 FROM   tbl_event_schedule_venue esv
                                 WHERE  esv.schedule_id = es.schedule_id
                               ), '[]'::json),
                 'venues',     COALESCE((
                                 SELECT json_agg(json_build_object('id', v.venue_id, 'name', v.name) ORDER BY v.venue_id)
                                 FROM   tbl_event_schedule_venue esv2
                                 JOIN   tbl_venue v ON v.venue_id = esv2.venue_id
                                 WHERE  esv2.schedule_id = es.schedule_id
                               ), '[]'::json)
               ) ORDER BY es.date, es.start_time
             ) AS schedules
      FROM tbl_event_schedule es
      GROUP BY es.event_id
    )`;

  // Shared SELECT / FROM / JOIN fragment (CTE must already be in scope)
  const selectBlock = `
    SELECT DISTINCT
           e.*,
           o.name AS organization_name,
           rc.org_version_id AS organization_version_id,
           COALESCE(cj.collaborators::text, '[]') AS collaborators,
           COALESCE(sj.schedules::text, '[]')     AS schedules,
           NULL AS publication_image
    FROM tbl_event e
    LEFT JOIN tbl_organization o   ON o.organization_id = e.organization_id
    LEFT JOIN tbl_renewal_cycle rc ON rc.organization_id = e.organization_id
                                   AND rc.cycle_number = e.cycle_number
    LEFT JOIN collab_json cj       ON cj.event_id = e.event_id
    LEFT JOIN schedule_json sj     ON sj.event_id = e.event_id`;

  // No user → only global events
  if (!user) {
    return prisma.$queryRawUnsafe(`
      WITH ${collabCte}, ${scheduleCte}
      ${selectBlock}
      WHERE e.event_type IN ('SDAO', 'System')
      ORDER BY e.start_date DESC, e.created_at DESC
    `);
  }

  const roleName = user.tbl_role?.role_name ?? '';
  const programId = user.program_id;
  const collegeId = user.tbl_program_tbl_user_program_idTotbl_program?.college_id ?? null;

  // SDAO / Academic Director → all events
  if (roleName === 'SDAO' || roleName === 'Academic Director') {
    return prisma.$queryRawUnsafe(`
      WITH ${collabCte}, ${scheduleCte}
      ${selectBlock}
      ORDER BY e.start_date DESC, e.created_at DESC
    `);
  }

  // Everyone else: build a WHERE clause scoped to the user's role.
  // roleName comes from the DB, not from user input, so interpolation is safe.
  const safeRole = roleName.replace(/'/g, "''");
  const params: unknown[] = [userId]; // $1 = userId
  let p = 2; // next positional-param index

  // Program Chair conditions (only when program_id is known)
  const programConds: string[] = [];
  if (programId != null) {
    programConds.push(
      // Events belonging to orgs under this program
      `(ui_role = 'Program Chair' AND EXISTS (
          SELECT 1 FROM tbl_organization po
          JOIN tbl_organization_version pov ON pov.org_version_id = po.current_org_version_id
          WHERE po.organization_id = e.organization_id AND pov.base_program_id = $${p}
      ))`,
      // Collaborator orgs under this program
      `(ui_role = 'Program Chair' AND EXISTS (
          SELECT 1 FROM tbl_event_collaborator ec4
          JOIN tbl_organization po2        ON po2.organization_id = ec4.organization_id
          JOIN tbl_organization_version pov2 ON pov2.org_version_id = po2.current_org_version_id
          WHERE ec4.event_id = e.event_id AND pov2.base_program_id = $${p}
      ))`,
      // Proposed events for orgs under this program
      `(ui_role = 'Program Chair' AND EXISTS (
          SELECT 1 FROM tbl_event_application ea3
          WHERE ea3.proposed_event_id = e.event_id AND EXISTS (
              SELECT 1 FROM tbl_organization po3
              JOIN tbl_organization_version pov3 ON pov3.org_version_id = po3.current_org_version_id
              WHERE po3.organization_id = ea3.organization_id AND pov3.base_program_id = $${p}
          )
      ))`,
    );
    params.push(programId);
    p++;
  }

  // Dean conditions (only when college_id is known)
  const collegeConds: string[] = [];
  if (collegeId != null) {
    collegeConds.push(
      `(ui_role = 'Dean' AND EXISTS (
          SELECT 1 FROM tbl_organization do1
          JOIN tbl_organization_version dov1 ON dov1.org_version_id = do1.current_org_version_id
          JOIN tbl_program dp1               ON dp1.program_id = dov1.base_program_id
          WHERE do1.organization_id = e.organization_id AND dp1.college_id = $${p}
      ))`,
      `(ui_role = 'Dean' AND EXISTS (
          SELECT 1 FROM tbl_event_collaborator ec5
          JOIN tbl_organization do2        ON do2.organization_id = ec5.organization_id
          JOIN tbl_organization_version dov2 ON dov2.org_version_id = do2.current_org_version_id
          JOIN tbl_program dp2               ON dp2.program_id = dov2.base_program_id
          WHERE ec5.event_id = e.event_id AND dp2.college_id = $${p}
      ))`,
      `(ui_role = 'Dean' AND EXISTS (
          SELECT 1 FROM tbl_event_application ea4
          WHERE ea4.proposed_event_id = e.event_id AND EXISTS (
              SELECT 1 FROM tbl_organization do3
              JOIN tbl_organization_version dov3 ON dov3.org_version_id = do3.current_org_version_id
              JOIN tbl_program dp3               ON dp3.program_id = dov3.base_program_id
              WHERE do3.organization_id = ea4.organization_id AND dp3.college_id = $${p}
          )
      ))`,
    );
    params.push(collegeId);
    p++;
  }

  // All WHERE conditions joined with OR
  const conditions = [
    // Global events visible to everyone
    `e.event_type IN ('SDAO', 'System')`,
    // Events created by this user
    `e.user_id = $1`,
    // User is a member of the event's organization
    `EXISTS (
        SELECT 1 FROM tbl_organization_members m
        WHERE m.user_id = $1
          AND (m.status IS NULL OR m.status IN ('Active', 'Pending'))
          AND m.organization_id = e.organization_id
    )`,
    // User is a member of a collaborating organization
    `EXISTS (
        SELECT 1 FROM tbl_event_collaborator ec2
        JOIN tbl_organization_members m2 ON m2.organization_id = ec2.organization_id
        WHERE ec2.event_id = e.event_id
          AND m2.user_id = $1
          AND (m2.status IS NULL OR m2.status IN ('Active', 'Pending'))
    )`,
    // Adviser: user advises the owner org
    `(ui_role = 'Adviser' AND EXISTS (
        SELECT 1 FROM tbl_organization ao
        WHERE ao.organization_id = e.organization_id AND ao.adviser_id = $1
    ))`,
    // Adviser: user advises a collaborating org
    `(ui_role = 'Adviser' AND EXISTS (
        SELECT 1 FROM tbl_event_collaborator ec3
        JOIN tbl_organization ao2 ON ao2.organization_id = ec3.organization_id
        WHERE ec3.event_id = e.event_id AND ao2.adviser_id = $1
    ))`,
    ...programConds,
    ...collegeConds,
    // Proposed events related to this user or their orgs
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
    )`,
  ].join('\n    OR ');

  const sql = `
    WITH role_ctx AS (SELECT '${safeRole}' AS ui_role),
    ${collabCte}, ${scheduleCte}
    ${selectBlock}
    CROSS JOIN role_ctx
    WHERE ${conditions}
    ORDER BY e.start_date DESC, e.created_at DESC
  `;

  return prisma.$queryRawUnsafe(sql, ...params);
}

// ---------------------------------------------------------------------------
// GET /events/add-event-status
// ---------------------------------------------------------------------------

export interface AddEventStatusResult {
  id: number | null;
  cycle_number: number | null;
  can_add_event: boolean;
}

/**
 * Check whether an org can propose a new event.
 *
 * Logic (mirrors GetAddEventStatus stored procedure):
 *   - No events yet             → can add (return max cycle_number)
 *   - Last event is Rejected    → can add
 *   - All post-event reqs submitted (any status) → can add
 *   - Otherwise                 → cannot add
 */
export async function getAddEventStatusById(orgId: number): Promise<AddEventStatusResult> {
  // Get the most recently created event for the org
  const lastEvent = await prisma.tbl_event.findFirst({
    where: { organization_id: orgId },
    orderBy: { created_at: 'desc' },
    select: { event_id: true, status: true, cycle_number: true },
  });

  if (!lastEvent) {
    // No events yet — allow adding; return the org's latest cycle_number
    const maxCycle = await prisma.tbl_renewal_cycle.findFirst({
      where: { organization_id: orgId },
      orderBy: { cycle_number: 'desc' },
      select: { cycle_number: true },
    });
    return { id: null, cycle_number: maxCycle?.cycle_number ?? null, can_add_event: true };
  }

  // Count total post-event requirements defined globally
  const postReqCount = await prisma.tbl_event_application_requirement.count({
    where: {
      is_applicable_to: 'post_event',
      status: 'active',
    },
  });

  // Count distinct post-event requirements submitted AND APPROVED for this event
  const approvedGroups = await prisma.tbl_event_requirement_submissions.groupBy({
    by: ['requirement_id'],
    where: {
      event_id: lastEvent.event_id,
      status: 'Approved',
      tbl_event_application_requirement: {
        is_applicable_to: 'post_event',
        status: 'active',
      },
    },
  });
  const approvedCount = approvedGroups.length;

  const canAdd = lastEvent.status === 'Rejected' || postReqCount === approvedCount;
  return { id: lastEvent.event_id, cycle_number: lastEvent.cycle_number, can_add_event: canAdd };
}

// ---------------------------------------------------------------------------
// GET /events/specific?event_id=:id
// ---------------------------------------------------------------------------

export interface EventAttendee {
  attendance_id: number;
  user_id: string;
  full_name: string;
  email: string;
  attendance_status: string;
  transaction_id: number | null;
  transaction_status: string | null;
  registration_date: Date | null;
}

export interface EventStats {
  totalRegistered: number;
  totalAttended: number;
  totalEvaluated: number;
  attendanceRate: number;
  evaluationRate: number;
  averageRating: number;
  avgFeedbackTime?: string;
  totalPaidRevenue: number;
}

export interface EventCollaborator {
  organization_id: number;
  organization_name: string;
  base_program_id: number | null;
}

export interface EventScheduleSlot {
  schedule_id: number;
  date: Date;
  start_time: Date;
  end_time: Date;
  note: string | null;
  venue_ids: number[];
  venues: { venue_id: number; name: string }[];
}

export interface EventDetail {
  event_id: number;
  title: string;
  description: string;
  event_type: string | null;
  status: string | null;
  venue_type: string | null;
  venue: string | null;
  is_open_to: string | null;
  fee: number | null;
  capacity: number | null;
  certificate: string | null;
  start_date: Date;
  end_date: Date;
  schedules: EventScheduleSlot[];
  organization_id: number | null;
  organization_version_id: number | null;
  cycle_number: number | null;
  organization_name: string | null;
  organization_logo: string | null;
  user_id: string;
  image: string | null;
  publication_image: string | null;
  collaborators: EventCollaborator[];
  attendees: EventAttendee[];
  stats: EventStats;
}

export async function getEventById(eventId: number): Promise<EventDetail | null> {
  const event = await prisma.tbl_event.findUnique({
    where: { event_id: eventId },
    select: {
      event_id: true,
      title: true,
      description: true,
      event_type: true,
      status: true,
      venue_type: true,
      venue: true,
      is_open_to: true,
      fee: true,
      capacity: true,
      certificate: true,
      start_date: true,
      end_date: true,
      organization_id: true,
      cycle_number: true,
      user_id: true,
      image: true,
      // Per-day schedules
      tbl_event_schedule: {
        select: {
          schedule_id: true,
          date: true,
          start_time: true,
          end_time: true,
          note: true,
          tbl_event_schedule_venue: {
            select: {
              venue_id: true,
              tbl_venue: { select: { name: true } },
            },
          },
        },
        orderBy: [{ date: 'asc' }, { start_time: 'asc' }],
      },
      // Organization info
      tbl_organization: {
        select: {
          name: true,
          tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version: {
            select: { org_version_id: true, logo_path: true },
          },
        },
      },
      // Collaborating orgs
      tbl_event_collaborator: {
        select: {
          organization_id: true,
          tbl_organization: {
            select: {
              name: true,
              tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version: {
                select: { base_program_id: true },
              },
            },
          },
        },
      },
      // Attendees
      tbl_event_attendance: {
        select: {
          attendance_id: true,
          user_id: true,
          status: true,
          created_at: true,
          time_in: true,
          time_out: true,
          tbl_user: { select: { f_name: true, l_name: true, email: true } },
          tbl_transaction: {
            select: { 
              transaction_id: true,
              status: true,
              proof_image: true,
              amount: true,
              tbl_transaction_type: {
                select: { label: true }
              },
              created_at: true,
              updated_at: true
            },
          },
        },
      },
      // Evaluations for stats
      tbl_evaluation: {
        select: {
          duration_seconds: true,
          tbl_evaluation_response: {
            select: { response_value: true },
          },
        },
      },
    },
  });

  if (!event) return null;

  // Resolve org_version_id from renewal cycle (matching event's cycle_number)
  const renewalCycle = event.organization_id && event.cycle_number
    ? await prisma.tbl_renewal_cycle.findUnique({
        where: {
          organization_id_cycle_number: {
            organization_id: event.organization_id,
            cycle_number: event.cycle_number,
          },
        },
        select: { org_version_id: true },
      })
    : null;

  const orgVersionId = renewalCycle?.org_version_id ?? null;
  const currentVersion =
    event.tbl_organization
      ?.tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version;

  // Build attendees
  const attendees: EventAttendee[] = event.tbl_event_attendance.map((a) => ({
    attendance_id: a.attendance_id,
    user_id: a.user_id,
    full_name: `${a.tbl_user?.f_name ?? ''} ${a.tbl_user?.l_name ?? ''}`.trim(),
    email: a.tbl_user?.email ?? '',
    attendance_status: a.status,
    transaction_status: a.tbl_transaction?.status ?? null,
    registration_date: a.created_at,
  }));

  // Build stats
  const totalRegistered = event.tbl_event_attendance.filter((a) =>
    ['Registered', 'Attended', 'Evaluated'].includes(a.status),
  ).length;
  const totalAttended = event.tbl_event_attendance.filter((a) =>
    ['Attended', 'Evaluated'].includes(a.status),
  ).length;
  const totalEvaluated = event.tbl_event_attendance.filter(
    (a) => a.status === 'Evaluated',
  ).length;
  const attendanceRate =
    totalRegistered > 0 ? Math.round((totalAttended / totalRegistered) * 1000) / 10 : 0;
  const evaluationRate =
    totalAttended > 0 ? Math.round((totalEvaluated / totalAttended) * 1000) / 10 : 0;

  // Average rating from likert responses — we already fetched all responses;
  // the stored proc filtered by question_type = 'likert_4' but we can't filter
  // inside the nested select cheaply, so we use all numeric responses instead.
  const allResponseValues = event.tbl_evaluation.flatMap((e) =>
    e.tbl_evaluation_response.map((r) => parseFloat(r.response_value)).filter((v) => !isNaN(v)),
  );
  const averageRating =
    allResponseValues.length > 0
      ? Math.round((allResponseValues.reduce((s, v) => s + v, 0) / allResponseValues.length) * 100) / 100
      : 0;

  // Average feedback time
  const allDurations = event.tbl_evaluation.map((e) => e.duration_seconds).filter((d) => d !== null);
  const avgDurationSeconds = allDurations.length > 0 
    ? allDurations.reduce((s, v) => s + (v ?? 0), 0) / allDurations.length 
    : 0;
  const avgFeedbackTime = avgDurationSeconds > 0 
    ? `${Math.floor(avgDurationSeconds / 60)}m ${Math.round(avgDurationSeconds % 60)}s` 
    : "N/A";

  // Total paid revenue — sum Approved transactions for this event
  const paidRevenue = await prisma.tbl_transaction.aggregate({
    where: {
      status: 'Completed',
      tbl_transaction_event: { event_id: eventId },
    },
    _sum: { amount: true },
  });
  const totalPaidRevenue = Number(paidRevenue._sum.amount ?? 0);

  // Build collaborators
  const collaborators: EventCollaborator[] = event.tbl_event_collaborator.map((c) => ({
    organization_id: c.organization_id,
    organization_name: c.tbl_organization?.name ?? '',
    base_program_id:
      c.tbl_organization
        ?.tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version
        ?.base_program_id ?? null,
  }));

  return {
    event_id: event.event_id,
    title: event.title,
    description: event.description,
    event_type: event.event_type,
    status: event.status,
    venue_type: event.venue_type,
    venue: event.venue,
    is_open_to: event.is_open_to,
    fee: event.fee,
    capacity: event.capacity,
    certificate: event.certificate,
    start_date: event.start_date,
    end_date: event.end_date,
    schedules: event.tbl_event_schedule.map((s) => ({
      schedule_id: s.schedule_id,
      date: s.date,
      start_time: s.start_time,
      end_time: s.end_time,
      note: s.note ?? null,
      venue_ids: s.tbl_event_schedule_venue.map((sv) => sv.venue_id),
      venues: s.tbl_event_schedule_venue.map((sv) => ({
        venue_id: sv.venue_id,
        name: sv.tbl_venue.name,
      })),
    })),
    organization_id: event.organization_id,
    organization_version_id: orgVersionId,
    cycle_number: event.cycle_number,
    organization_name: event.tbl_organization?.name ?? null,
    organization_logo: event.organization_id
      ? `/api/web/organizations/${event.organization_id}/logo`
      : null,
    user_id: event.user_id,
    image: event.image,
    publication_image: null, // stored on disk per event_application, not in tbl_event
    collaborators,
    attendees,
    stats: {
      totalRegistered,
      totalAttended,
      totalEvaluated,
      attendanceRate,
      evaluationRate,
      averageRating,
      avgFeedbackTime,
      totalPaidRevenue,
    },
  };
}

// ---------------------------------------------------------------------------
// GET /event-requirement-submissions-by-organization?organization_id=:id
// ---------------------------------------------------------------------------

export interface PostEventSubmission {
  submission_id: number;
  event_id: number | null;
  event_application_id: number | null;
  organization_id: number;
  organization_version_id: number | null;
  cycle_number: number;
  requirement_id: number;
  template_requirement_id: number;
  requirement_name: string;
  template_file_path: string | null;
  file_path: string;
  original_filename: string;
  status: string;
  is_viewed: boolean;
  remarks: string | null;
  reviewed_by_email: string | null;
  reviewed_at: Date | null;
  submitted_at: Date | null;
  updated_at: Date | null;
}

function submissionStatusWire(status: string | null | undefined): string {
  // API contract uses "Submitted" for student-uploaded waiting state.
  if (!status || status === 'Pending' || status === 'Viewed') return 'Submitted';
  return status;
}

// ---------------------------------------------------------------------------
// GET /blocked-periods?status=unarchived|archived|all
// ---------------------------------------------------------------------------

export interface BlockedPeriod {
  blocked_period_id: number;
  reason: string;
  description: null;
  start_date: Date;
  end_date: Date;
  is_archived: boolean;
  created_at: Date | null;
}

export async function getBlockedPeriods(status: 'unarchived' | 'archived' | 'all' = 'unarchived'): Promise<BlockedPeriod[]> {
  const where =
    status === 'unarchived' ? { archived_at: null }
    : status === 'archived'  ? { archived_at: { not: null } }
    : {};

  const rows = await prisma.tbl_blocked_period.findMany({
    where,
    select: {
      blocked_period_id: true,
      reason: true,
      start_date: true,
      end_date: true,
      archived_at: true,
      created_at: true,
    },
    orderBy: { start_date: 'asc' },
  });

  return rows.map((r) => ({
    blocked_period_id: r.blocked_period_id,
    reason: r.reason,
    description: null,
    start_date: r.start_date,
    end_date: r.end_date,
    is_archived: r.archived_at !== null,
    created_at: r.created_at ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Blocked period mutations
// ---------------------------------------------------------------------------

async function checkBlockedPeriodOverlap(
  start: Date,
  end: Date,
  excludeId?: number,
): Promise<void> {
  const conflicting = await prisma.tbl_blocked_period.findMany({
    where: {
      archived_at: null,
      start_date: { lte: end },
      end_date: { gte: start },
      ...(excludeId !== undefined && { blocked_period_id: { not: excludeId } }),
    },
    select: { blocked_period_id: true, reason: true, start_date: true, end_date: true },
  });
  if (conflicting.length > 0) {
    throw Object.assign(
      new Error('The selected date range overlaps with existing active blocked period(s).'),
      { code: 'OVERLAP_ERROR', conflictingPeriods: conflicting },
    );
  }
}

export async function createBlockedPeriod(data: {
  start_date: string;
  end_date: string;
  reason: string;
  created_by: string;
}): Promise<BlockedPeriod> {
  const start = new Date(data.start_date);
  const end = new Date(data.end_date);
  await checkBlockedPeriodOverlap(start, end);

  const row = await prisma.tbl_blocked_period.create({
    data: { start_date: start, end_date: end, reason: data.reason, created_by: data.created_by },
    select: { blocked_period_id: true, reason: true, start_date: true, end_date: true, created_at: true },
  });
  return {
    blocked_period_id: row.blocked_period_id,
    reason: row.reason,
    description: null,
    start_date: row.start_date,
    end_date: row.end_date,
    is_archived: false,
    created_at: row.created_at ?? null,
  };
}

export async function updateBlockedPeriod(data: {
  blocked_period_id: number;
  start_date?: string;
  end_date?: string;
  reason?: string;
}): Promise<BlockedPeriod> {
  const existing = await prisma.tbl_blocked_period.findUnique({
    where: { blocked_period_id: data.blocked_period_id },
    select: { start_date: true, end_date: true, archived_at: true },
  });
  if (!existing) throw Object.assign(new Error('Blocked period not found.'), { code: 'NOT_FOUND' });

  const start = data.start_date ? new Date(data.start_date) : existing.start_date;
  const end = data.end_date ? new Date(data.end_date) : existing.end_date;
  await checkBlockedPeriodOverlap(start, end, data.blocked_period_id);

  const row = await prisma.tbl_blocked_period.update({
    where: { blocked_period_id: data.blocked_period_id },
    data: {
      start_date: start,
      end_date: end,
      ...(data.reason !== undefined && { reason: data.reason }),
    },
    select: { blocked_period_id: true, reason: true, start_date: true, end_date: true, archived_at: true, created_at: true },
  });
  return {
    blocked_period_id: row.blocked_period_id,
    reason: row.reason,
    description: null,
    start_date: row.start_date,
    end_date: row.end_date,
    is_archived: row.archived_at !== null,
    created_at: row.created_at ?? null,
  };
}

export async function archiveBlockedPeriod(data: {
  blocked_period_id: number;
  archived_by: string;
  archived_reason: string;
}): Promise<void> {
  const existing = await prisma.tbl_blocked_period.findUnique({
    where: { blocked_period_id: data.blocked_period_id },
    select: { archived_at: true },
  });
  if (!existing) throw Object.assign(new Error('Blocked period not found.'), { code: 'NOT_FOUND' });
  if (existing.archived_at)
    throw Object.assign(new Error('Blocked period is already archived.'), { code: 'ALREADY_ARCHIVED' });

  await prisma.tbl_blocked_period.update({
    where: { blocked_period_id: data.blocked_period_id },
    data: { archived_at: new Date(), archived_by: data.archived_by, archived_reason: data.archived_reason },
  });
}

export async function unarchiveBlockedPeriod(data: {
  blocked_period_id: number;
  unarchived_by: string;
  unarchived_reason?: string;
}): Promise<void> {
  const existing = await prisma.tbl_blocked_period.findUnique({
    where: { blocked_period_id: data.blocked_period_id },
    select: { archived_at: true },
  });
  if (!existing) throw Object.assign(new Error('Blocked period not found.'), { code: 'NOT_FOUND' });
  if (!existing.archived_at)
    throw Object.assign(new Error('Blocked period is not archived.'), { code: 'NOT_ARCHIVED' });

  await prisma.tbl_blocked_period.update({
    where: { blocked_period_id: data.blocked_period_id },
    data: {
      archived_at: null,
      archived_by: null,
      archived_reason: null,
      unarchived_at: new Date(),
      unarchived_by: data.unarchived_by,
      unarchived_reason: data.unarchived_reason ?? null,
    },
  });
}

export async function deleteBlockedPeriod(blocked_period_id: number): Promise<{ reason: string; start_date: Date; end_date: Date }> {
  const existing = await prisma.tbl_blocked_period.findUnique({
    where: { blocked_period_id },
    select: { blocked_period_id: true, reason: true, start_date: true, end_date: true },
  });
  if (!existing) throw Object.assign(new Error('Blocked period not found.'), { code: 'NOT_FOUND' });
  await prisma.tbl_blocked_period.delete({ where: { blocked_period_id } });
  return { reason: existing.reason, start_date: existing.start_date, end_date: existing.end_date };
}

export async function getPostEventSubmissionsByOrg(
  organizationId: number,
  eventApplicationId?: number | null,
): Promise<PostEventSubmission[]> {
  const rows = await prisma.tbl_event_requirement_submissions.findMany({
    where: {
      organization_id: organizationId,
      ...(eventApplicationId ? { event_application_id: eventApplicationId } : {}),
    },
    select: {
      submission_id: true,
      event_id: true,
      event_application_id: true,
      organization_id: true,
      cycle_number: true,
      requirement_id: true,
      status: true,
      file_path: true,
      submitted_at: true,
      updated_at: true,
      remarks: true,
      reviewed_by_email: true,
      reviewed_at: true,
      viewed_at: true,
      tbl_event_application_requirement: {
        select: { requirement_name: true, file_path: true },
      },
    },
    orderBy: { submitted_at: 'desc' },
  });

  // current_org_version_id is owned by tbl_organization, so resolve it once per org
  const org = await prisma.tbl_organization.findUnique({
    where: { organization_id: organizationId },
    select: { current_org_version_id: true },
  });

  return rows.map((r) => ({
    submission_id: r.submission_id,
    event_id: r.event_id,
    event_application_id: r.event_application_id,
    organization_id: r.organization_id,
    organization_version_id: org?.current_org_version_id ?? null,
    cycle_number: r.cycle_number,
    requirement_id: r.requirement_id,
    template_requirement_id: r.requirement_id,
    requirement_name: r.tbl_event_application_requirement.requirement_name,
    template_file_path: r.tbl_event_application_requirement.file_path ?? null,
    file_path: r.file_path,
    original_filename: r.file_path.split('/').pop() ?? r.file_path,
    status: submissionStatusWire(r.status ?? 'Pending'),
    is_viewed: r.viewed_at !== null,
    remarks: r.remarks ?? null,
    reviewed_by_email: r.reviewed_by_email ?? null,
    reviewed_at: r.reviewed_at ?? null,
    submitted_at: r.submitted_at,
    updated_at: r.updated_at ?? r.submitted_at,
  }));
}

export async function getPostEventSubmissionsByEventApplication(
  eventApplicationId: number,
): Promise<PostEventSubmission[]> {
  const rows = await prisma.tbl_event_requirement_submissions.findMany({
    where: { event_application_id: eventApplicationId },
    select: {
      submission_id: true,
      event_id: true,
      event_application_id: true,
      organization_id: true,
      cycle_number: true,
      requirement_id: true,
      status: true,
      file_path: true,
      submitted_at: true,
      updated_at: true,
      remarks: true,
      reviewed_by_email: true,
      reviewed_at: true,
      viewed_at: true,
      tbl_event_application_requirement: {
        select: { requirement_name: true, file_path: true },
      },
    },
    orderBy: { submitted_at: 'desc' },
  });

  const orgVersionByOrgId = new Map<number, number | null>();

  for (const row of rows) {
    if (!orgVersionByOrgId.has(row.organization_id)) {
      const org = await prisma.tbl_organization.findUnique({
        where: { organization_id: row.organization_id },
        select: { current_org_version_id: true },
      });
      orgVersionByOrgId.set(row.organization_id, org?.current_org_version_id ?? null);
    }
  }

  return rows.map((r) => ({
    submission_id: r.submission_id,
    event_id: r.event_id,
    event_application_id: r.event_application_id,
    organization_id: r.organization_id,
    organization_version_id: orgVersionByOrgId.get(r.organization_id) ?? null,
    cycle_number: r.cycle_number,
    requirement_id: r.requirement_id,
    template_requirement_id: r.requirement_id,
    requirement_name: r.tbl_event_application_requirement.requirement_name,
    template_file_path: r.tbl_event_application_requirement.file_path ?? null,
    file_path: r.file_path,
    original_filename: r.file_path.split('/').pop() ?? r.file_path,
    status: submissionStatusWire(r.status ?? 'Pending'),
    is_viewed: r.viewed_at !== null,
    remarks: r.remarks ?? null,
    reviewed_by_email: r.reviewed_by_email ?? null,
    reviewed_at: r.reviewed_at ?? null,
    submitted_at: r.submitted_at,
    updated_at: r.updated_at ?? r.submitted_at,
  }));
}

export async function uploadOrUpdatePostEventRequirementById(data: {
  event_id: number;
  event_application_id: number | null;
  organization_id: number;
  cycle_number: number;
  requirement_id: number;
  file_path: string;
  submitted_by: string;
}): Promise<{ submission_id: number; file_path: string; status: string | null }> {
  // Validate requirement by immutable ID (source of truth)
  const reqTemplate = await prisma.tbl_event_application_requirement.findUnique({
    where: { requirement_id: data.requirement_id },
    select: { requirement_id: true, status: true },
  });
  if (!reqTemplate || reqTemplate.status !== 'active') {
    throw Object.assign(new Error('Requirement template not found or inactive.'), { code: 'REQUIREMENT_NOT_FOUND' });
  }

  // Upsert behavior: one latest submission per event+requirement+org+cycle(+optional app)
  const existing = await prisma.tbl_event_requirement_submissions.findFirst({
    where: {
      event_id: data.event_id,
      requirement_id: data.requirement_id,
      organization_id: data.organization_id,
      cycle_number: data.cycle_number,
      event_application_id: data.event_application_id,
    },
    orderBy: { submitted_at: 'desc' },
    select: { submission_id: true },
  });

  if (existing) {
    const updated = await prisma.tbl_event_requirement_submissions.update({
      where: { submission_id: existing.submission_id },
      data: {
        file_path: data.file_path,
        submitted_by: data.submitted_by,
        submitted_at: new Date(),
        updated_at: new Date(),
        status: 'Pending',
        remarks: null,
        reviewed_by_email: null,
        reviewed_at: null,
      },
      select: { submission_id: true, file_path: true, status: true },
    });
    return updated;
  }

  const created = await prisma.tbl_event_requirement_submissions.create({
    data: {
      event_id: data.event_id,
      event_application_id: data.event_application_id,
      requirement_id: data.requirement_id,
      organization_id: data.organization_id,
      cycle_number: data.cycle_number,
      file_path: data.file_path,
      submitted_by: data.submitted_by,
      status: 'Pending',
      remarks: null,
      reviewed_by_email: null,
      reviewed_at: null,
      updated_at: new Date(),
    },
    select: { submission_id: true, file_path: true, status: true },
  });
  return created;
}

export async function reviewPostEventSubmission(data: {
  submission_id: number;
  action: 'Approved' | 'Rejected';
  reviewed_by_email: string;
  remarks?: string | null;
}): Promise<{
  submission_id: number;
  status: string;
  remarks: string | null;
  reviewed_by_email: string | null;
  reviewed_at: Date | null;
}> {
  const existing = await prisma.tbl_event_requirement_submissions.findUnique({
    where: { submission_id: data.submission_id },
    select: { submission_id: true },
  });
  if (!existing) {
    throw Object.assign(new Error('Submission not found.'), { code: 'NOT_FOUND' });
  }

  const updated = await prisma.tbl_event_requirement_submissions.update({
    where: { submission_id: data.submission_id },
    data: {
      status: data.action,
      remarks: data.remarks ?? null,
      reviewed_by_email: data.reviewed_by_email,
      reviewed_at: new Date(),
      updated_at: new Date(),
    },
    select: {
      submission_id: true,
      status: true,
      remarks: true,
      reviewed_by_email: true,
      reviewed_at: true,
    },
  });

  return {
    submission_id: updated.submission_id,
    status: updated.status ?? data.action,
    remarks: updated.remarks ?? null,
    reviewed_by_email: updated.reviewed_by_email ?? null,
    reviewed_at: updated.reviewed_at ?? null,
  };
}

export async function getPendingPostEventSubmissions(filters: {
  organization_id?: number;
  event_application_id?: number;
  status?: 'Submitted' | 'Resubmitted' | 'Pending' | 'Viewed' | 'Approved' | 'Rejected';
}): Promise<PostEventSubmission[]> {
  const where: any = {};

  if (filters.organization_id) where.organization_id = filters.organization_id;
  if (filters.event_application_id) where.event_application_id = filters.event_application_id;

  // Frontend may pass Submitted/Resubmitted — both map to DB Pending in current schema.
  if (filters.status) {
    if (filters.status === 'Submitted' || filters.status === 'Resubmitted') {
      where.status = 'Pending';
    } else {
      where.status = filters.status;
    }
  } else {
    // Default inbox is pending-like submissions only
    where.status = { in: ['Pending', 'Viewed'] };
  }

  const rows = await prisma.tbl_event_requirement_submissions.findMany({
    where,
    select: {
      submission_id: true,
      event_id: true,
      event_application_id: true,
      organization_id: true,
      cycle_number: true,
      requirement_id: true,
      status: true,
      file_path: true,
      submitted_at: true,
      updated_at: true,
      remarks: true,
      reviewed_by_email: true,
      reviewed_at: true,
      viewed_at: true,
      tbl_event_application_requirement: {
        select: { requirement_name: true, file_path: true },
      },
    },
    orderBy: [{ submitted_at: 'desc' }],
  });

  const orgVersionByOrgId = new Map<number, number | null>();
  for (const row of rows) {
    if (!orgVersionByOrgId.has(row.organization_id)) {
      const org = await prisma.tbl_organization.findUnique({
        where: { organization_id: row.organization_id },
        select: { current_org_version_id: true },
      });
      orgVersionByOrgId.set(row.organization_id, org?.current_org_version_id ?? null);
    }
  }

  return rows.map((r) => ({
    submission_id: r.submission_id,
    event_id: r.event_id,
    event_application_id: r.event_application_id,
    organization_id: r.organization_id,
    organization_version_id: orgVersionByOrgId.get(r.organization_id) ?? null,
    cycle_number: r.cycle_number,
    requirement_id: r.requirement_id,
    template_requirement_id: r.requirement_id,
    requirement_name: r.tbl_event_application_requirement.requirement_name,
    template_file_path: r.tbl_event_application_requirement.file_path ?? null,
    file_path: r.file_path,
    original_filename: r.file_path.split('/').pop() ?? r.file_path,
    status: submissionStatusWire(r.status ?? 'Pending'),
    is_viewed: r.viewed_at !== null,
    remarks: r.remarks ?? null,
    reviewed_by_email: r.reviewed_by_email ?? null,
    reviewed_at: r.reviewed_at ?? null,
    submitted_at: r.submitted_at,
    updated_at: r.updated_at ?? r.submitted_at,
  }));
}

// ---------------------------------------------------------------------------
// Event Requirements
// ---------------------------------------------------------------------------

/** Convert Prisma enum value → wire string expected by the frontend. */
function applicableToWire(val: string | null | undefined): string {
  return val === 'post_event' ? 'post-event' : 'pre-event';
}

/** Convert wire string from the frontend → Prisma enum value. */
export function parseApplicableTo(value: string): 'pre_event' | 'post_event' {
  return value === 'post-event' ? 'post_event' : 'pre_event';
}

export interface EventRequirement {
  requirement_id: number;
  requirement_name: string;
  /** Alias of is_applicable_to — kept for backward-compat with frontend hook. */
  requirement_type: string;
  is_applicable_to: string;
  file_path: string | null;
  created_at: Date | null;
  updated_at: Date | null;
}

export async function getEventRequirements(): Promise<EventRequirement[]> {
  const rows = await prisma.tbl_event_application_requirement.findMany({
    where: { status: 'active' },
    orderBy: { created_at: 'asc' },
  });

  return rows.map((r) => {
    const wire = applicableToWire(r.is_applicable_to);
    return {
      requirement_id: r.requirement_id,
      requirement_name: r.requirement_name,
      requirement_type: wire,
      is_applicable_to: wire,
      file_path: r.file_path ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });
}

export async function createEventRequirement(data: {
  requirement_name: string;
  is_applicable_to: 'pre_event' | 'post_event';
  file_path?: string | null;
  created_by: string;
}): Promise<number> {
  const row = await prisma.tbl_event_application_requirement.create({
    data: {
      requirement_name: data.requirement_name,
      is_applicable_to: data.is_applicable_to,
      file_path: data.file_path ?? null,
      status: 'active',
      created_by: data.created_by,
    },
    select: { requirement_id: true },
  });
  return row.requirement_id;
}

export async function updateEventRequirement(data: {
  requirement_id: number;
  requirement_name: string;
  is_applicable_to: 'pre_event' | 'post_event';
  /** Pass a string to set a new path, null to clear, undefined to leave unchanged. */
  file_path?: string | null;
}): Promise<void> {
  const updateData: Record<string, unknown> = {
    requirement_name: data.requirement_name,
    is_applicable_to: data.is_applicable_to,
    updated_at: new Date(),
  };
  if (data.file_path !== undefined) {
    updateData.file_path = data.file_path;
  }
  await prisma.tbl_event_application_requirement.update({
    where: { requirement_id: data.requirement_id },
    data: updateData,
  });
}

export async function archiveEventRequirement(requirement_id: number): Promise<void> {
  await prisma.tbl_event_application_requirement.update({
    where: { requirement_id },
    data: { status: 'archived', updated_at: new Date() },
  });
}

export async function getEventRequirementById(requirement_id: number) {
  return prisma.tbl_event_application_requirement.findUnique({
    where: { requirement_id },
    select: {
      requirement_id: true,
      requirement_name: true,
      is_applicable_to: true,
      file_path: true,
      status: true,
    },
  });
}

export async function getEventRequirementTemplateById(requirement_id: number) {
  return prisma.tbl_event_application_requirement.findUnique({
    where: { requirement_id },
    select: {
      requirement_id: true,
      requirement_name: true,
      file_path: true,
      status: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Create Event — supporting queries
// ---------------------------------------------------------------------------

/** Returns all active (non-archived) organizations. */
export async function getAllOrganizations() {
  const orgs = await prisma.tbl_organization.findMany({
    where: { archived_at: null },
    select: {
      organization_id: true,
      name: true,
    },
    orderBy: { name: 'asc' },
  });
  return orgs.map((o) => ({
    id: o.organization_id,
    organization_id: o.organization_id,
    org_id: o.organization_id,
    name: o.name,
    organization_name: o.name,
  }));
}

export async function getOrganizationById(organization_id: number) {
  return prisma.tbl_organization.findUnique({
    where: { organization_id },
    select: {
      organization_id: true,
      current_org_version_id: true,
      name: true,
    },
  });
}

/** Returns organizations where the given user is an active member. */
export async function getUserOrganizations(userId: string) {
  const memberships = await prisma.tbl_organization_members.findMany({
    where: { user_id: userId, status: 'Active' },
    select: {
      organization_id: true,
      cycle_number: true,
      tbl_renewal_cycle: {
        select: {
          tbl_organization: { select: { organization_id: true, name: true } },
        },
      },
    },
  });

  const seen = new Set<number>();
  const result: { id: number; organization_id: number; name: string; organization_name: string }[] = [];
  for (const m of memberships) {
    const org = m.tbl_renewal_cycle?.tbl_organization;
    if (org && !seen.has(org.organization_id)) {
      seen.add(org.organization_id);
      result.push({
        id: org.organization_id,
        organization_id: org.organization_id,
        name: org.name,
        organization_name: org.name,
      });
    }
  }
  return result;
}

/** Check if an event title is already in use by active/pending events. */
export async function checkEventTitleExists(title: string) {
  const matches = await prisma.tbl_event.findMany({
    where: {
      title: { equals: title.trim(), mode: 'insensitive' },
      status: { in: [event_status.Pending, event_status.Approved] },
    },
    select: { status: true },
  });
  return matches;
}

export interface ScheduleSlotParam {
  date: string;       // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time: string;   // HH:MM:SS
  venue_ids?: number[] | null;
}

export interface ScheduleConflictParams {
  schedules: ScheduleSlotParam[];
  event_id?: number | null;
}

export interface ConflictItem {
  conflict_type: 'blocked_period' | 'schedule_conflict';
  conflict_message: string;
}

/** Per-slot schedule conflict check. */
export async function checkScheduleConflictPrisma(params: ScheduleConflictParams): Promise<ConflictItem[]> {
  const { schedules, event_id } = params;
  const conflicts: ConflictItem[] = [];

  if (!schedules || schedules.length === 0) return conflicts;

  // 1. Blocked periods — flag any slot whose date falls within a blocked period
  const minDate = new Date(schedules.reduce((m, s) => s.date < m ? s.date : m, schedules[0].date));
  const maxDate = new Date(schedules.reduce((m, s) => s.date > m ? s.date : m, schedules[0].date));

  const blockedPeriods = await prisma.tbl_blocked_period.findMany({
    where: {
      archived_at: null,
      OR: [{ start_date: { lte: maxDate }, end_date: { gte: minDate } }],
    },
    select: { reason: true, start_date: true, end_date: true },
  });
  for (const bp of blockedPeriods) {
    conflicts.push({
      conflict_type: 'blocked_period',
      conflict_message: `Blocked period: "${bp.reason}" (${bp.start_date.toISOString().slice(0, 10)} to ${bp.end_date.toISOString().slice(0, 10)})`,
    });
  }

  // 2. Per-slot venue conflicts
  for (const slot of schedules) {
    const vids = slot.venue_ids?.filter(Boolean) ?? [];
    if (vids.length === 0) continue;

    const slotDate = new Date(slot.date);
    const slotStart = new Date(`1970-01-01T${slot.start_time}Z`);
    const slotEnd   = new Date(`1970-01-01T${slot.end_time}Z`);

    const venueConflicts = await prisma.tbl_event_schedule_venue.findMany({
      where: {
        venue_id: { in: vids },
        tbl_event_schedule: {
          date: slotDate,
          start_time: { lt: slotEnd },
          end_time:   { gt: slotStart },
          tbl_event: {
            status: { in: [event_status.Pending, event_status.Approved] },
            ...(event_id ? { event_id: { not: event_id } } : {}),
          },
        },
      },
      select: {
        tbl_venue: { select: { name: true } },
        tbl_event_schedule: {
          select: { date: true, tbl_event: { select: { title: true } } },
        },
      },
    });

    for (const vc of venueConflicts) {
      conflicts.push({
        conflict_type: 'schedule_conflict',
        conflict_message: `Venue "${vc.tbl_venue.name}" is already booked by "${
          vc.tbl_event_schedule.tbl_event.title
        }" on ${vc.tbl_event_schedule.date.toISOString().slice(0, 10)} at ${slot.start_time}–${slot.end_time}`,
      });
    }
  }

  return conflicts;
}

// ─── schedule helpers ────────────────────────────────────────────────────────

/** Collect every distinct venue_id from the top-level venue_ids + per-slot venue_ids. */
function collectVenueIds(data: { venue_ids?: number[] | null; schedules?: ScheduleInput[] | null }): number[] {
  const set = new Set<number>();
  for (const vid of data.venue_ids ?? []) set.add(vid);
  for (const slot of data.schedules ?? []) {
    for (const vid of slot.venue_ids ?? []) set.add(vid);
  }
  return Array.from(set);
}

/** Create tbl_event_schedule + tbl_event_schedule_venue rows for a given event. */
async function createEventSchedules(eventId: number, schedules: ScheduleInput[]): Promise<void> {
  for (const slot of schedules) {
    const schedule = await prisma.tbl_event_schedule.create({
      data: {
        event_id: eventId,
        date: new Date(slot.date),
        start_time: new Date(`1970-01-01T${slot.start_time}Z`),
        end_time: new Date(`1970-01-01T${slot.end_time}Z`),
        note: slot.note ?? null,
      },
      select: { schedule_id: true },
    });

    const vids = slot.venue_ids?.filter(Boolean) ?? [];
    if (vids.length > 0) {
      await prisma.tbl_event_schedule_venue.createMany({
        data: vids.map((vid) => ({ schedule_id: schedule.schedule_id, venue_id: vid })),
        skipDuplicates: true,
      });
    }
  }
}

// ─── membership / cycle helpers ───────────────────────────────────────────────

/** Get organization membership for a user (most recent active). */
export async function getOrganizationMembership(userId: string) {
  return prisma.tbl_organization_members.findFirst({
    where: { user_id: userId, status: 'Active' },
    orderBy: { joined_at: 'desc' },
    select: { organization_id: true, cycle_number: true },
  });
}

/** Get the most recent cycle for an org. */
export async function getCurrentCycleForOrganization(organizationId: number) {
  return prisma.tbl_renewal_cycle.findFirst({
    where: { organization_id: organizationId },
    orderBy: { cycle_number: 'desc' },
    select: { cycle_number: true },
  });
}

export interface ScheduleInput {
  date: string;       // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time: string;   // HH:MM:SS
  venue_ids?: number[] | null;
  note?: string | null;
}

export interface CreateEventInput {
  user_id: string;
  title: string;
  description: string;
  venue_type: string;
  venue?: string | null;
  start_date: string;       // derived from schedules min date, or explicit for online
  end_date?: string | null; // derived from schedules max date, or explicit for online
  schedules?: ScheduleInput[] | null;
  organization_id?: number | null;
  cycle_number?: number | null;
  event_type?: string;
  status?: string;
  type?: string;
  is_open_to?: string;
  fee?: number | null;
  capacity?: number | null;
  image?: string | null;
  collaborators?: number[] | null;
  venue_ids?: number[] | null; // kept for tbl_event_venue supplement (manager-controlled)
}

/** Create an event record plus optional collaborator and schedule rows. Returns the created event. */
export async function createEventRecord(data: CreateEventInput) {
  const startDate = new Date(data.start_date);
  const endDate = new Date(data.end_date ?? data.start_date);

  const event = await prisma.tbl_event.create({
    data: {
      user_id: data.user_id,
      title: data.title,
      description: data.description,
      venue_type: toVenueType(data.venue_type),
      venue: data.venue ?? null,
      start_date: startDate,
      end_date: endDate,
      organization_id: data.organization_id ?? null,
      cycle_number: data.cycle_number ?? null,
      event_type: toEventType(data.event_type ?? 'Organization'),
      status: toEventStatus(data.status ?? 'Pending'),
      type: toFeeType(data.type ?? 'Free'),
      is_open_to: toOpenTo(data.is_open_to ?? 'Open_to_all'),
      fee: data.fee ?? null,
      capacity: data.capacity ?? null,
      image: data.image ?? null,
    },
    select: { event_id: true, title: true, status: true },
  });

  if (data.collaborators && data.collaborators.length > 0) {
    await prisma.tbl_event_collaborator.createMany({
      data: data.collaborators.map((org_id) => ({
        event_id: event.event_id,
        organization_id: org_id,
      })),
      skipDuplicates: true,
    });
  }

  // tbl_event_venue (supplement — manager-controlled overview)
  const allVenueIds = collectVenueIds(data);
  if (allVenueIds.length > 0) {
    await prisma.tbl_event_venue.createMany({
      data: allVenueIds.map((vid) => ({ event_id: event.event_id, venue_id: vid })),
      skipDuplicates: true,
    });
  }

  // Per-day schedules
  if (data.schedules && data.schedules.length > 0) {
    await createEventSchedules(event.event_id, data.schedules);
  }

  return event;
}

export interface CreateApplicationInput {
  organization_id: number;
  cycle_number: number;
  applicant_user_id: string;
  event: CreateEventInput;
  requirements: { requirement_id: number; file_path: string | null }[];
  collaborators?: number[] | null;
}

/** Create an event application (student org event): creates tbl_event + tbl_event_application rows. */
export async function createEventApplicationRecord(input: CreateApplicationInput) {
  // Guard: reject duplicate submissions (Pending or Revision application already exists)
  const existing = await prisma.tbl_event_application.findFirst({
    where: {
      organization_id: input.organization_id,
      cycle_number: input.cycle_number,
      status: { in: ['Pending', 'Revision'] },
    },
    select: { event_application_id: true, status: true },
  });
  if (existing) {
    const err = new Error(
      `An event application is already ${existing.status} for this organization and cycle. ` +
      `Please wait for the current application to be resolved before submitting a new one.`,
    );
    (err as any).code = 'DUPLICATE_APPLICATION';
    throw err;
  }

  const startDate = new Date(input.event.start_date);
  const endDate = new Date(input.event.end_date ?? input.event.start_date);

  // Create the underlying event
  const event = await prisma.tbl_event.create({
    data: {
      user_id: input.applicant_user_id,
      title: input.event.title,
      description: input.event.description,
      venue_type: toVenueType(input.event.venue_type),
      venue: input.event.venue ?? null,
      start_date: startDate,
      end_date: endDate,
      organization_id: input.organization_id,
      cycle_number: input.cycle_number,
      event_type: event_type.Organization,
      status: event_status.Pending,
      type: toFeeType(input.event.type ?? 'Free'),
      is_open_to: toOpenTo(input.event.is_open_to ?? 'Open_to_all'),
      fee: input.event.fee ?? null,
      capacity: input.event.capacity ?? null,
      image: input.event.image ?? null,
    },
    select: { event_id: true },
  });

  // Add collaborators
  if (input.collaborators && input.collaborators.length > 0) {
    await prisma.tbl_event_collaborator.createMany({
      data: input.collaborators.map((org_id) => ({
        event_id: event.event_id,
        organization_id: org_id,
      })),
      skipDuplicates: true,
    });
  }

  // Link venues to tbl_event_venue supplement
  const appVenueIds = collectVenueIds(input.event);
  if (appVenueIds.length > 0) {
    await prisma.tbl_event_venue.createMany({
      data: appVenueIds.map((vid) => ({ event_id: event.event_id, venue_id: vid })),
      skipDuplicates: true,
    });
  }

  // Per-day schedules
  if (input.event.schedules && input.event.schedules.length > 0) {
    await createEventSchedules(event.event_id, input.event.schedules);
  }

  // Create the application record
  const application = await prisma.tbl_event_application.create({
    data: {
      organization_id: input.organization_id,
      cycle_number: input.cycle_number,
      applicant_user_id: input.applicant_user_id,
      proposed_event_id: event.event_id,
      status: 'Pending',
    },
    select: { event_application_id: true, status: true, proposed_event_id: true, organization_id: true },
  });

  // Create requirement submission stubs
  if (input.requirements.length > 0) {
    await prisma.tbl_event_requirement_submissions.createMany({
      data: input.requirements
        .filter((r) => r.file_path !== null)
        .map((r) => ({
          event_id: event.event_id,
          event_application_id: application.event_application_id,
          requirement_id: r.requirement_id,
          organization_id: input.organization_id,
          cycle_number: input.cycle_number,
          file_path: r.file_path!,
          submitted_by: input.applicant_user_id,
        })),
      skipDuplicates: true,
    });
  }

  return {
    event_application_id: application.event_application_id,
    status: application.status,
    proposed_event_id: application.proposed_event_id,
    organization_id: application.organization_id,
    event_id: event.event_id,
  };
}

// ---------------------------------------------------------------------------
// Event Feedback / Evaluation Config + Certificate Template
// ---------------------------------------------------------------------------

function timeToWire(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(11, 19);
}

function toTimeDate(time: string | null | undefined): Date | null {
  if (!time) return null;
  return new Date(`1970-01-01T${time}Z`);
}

export async function getAllEvaluationQuestionsTree() {
  const groups = await prisma.tbl_evaluation_question_group.findMany({
    where: { is_active: true },
    select: {
      group_id: true,
      group_title: true,
      group_description: true,
      tbl_evaluation_question: {
        select: {
          question_id: true,
          question_text: true,
          question_type: true,
        },
        orderBy: { question_id: 'asc' },
      },
    },
    orderBy: { group_id: 'asc' },
  });

  return [
    {
      evaluation_form: groups.map((g) => ({
        group_id: g.group_id,
        group_title: g.group_title,
        group_description: g.group_description,
        questions: g.tbl_evaluation_question.map((q) => ({
          question_id: q.question_id,
          question_text: q.question_text,
          question_type: q.question_type,
        })),
      })),
    },
  ];
}

export async function getEventEvaluationConfigByEventId(eventId: number) {
  const [settings, enabled, cert] = await Promise.all([
    prisma.tbl_event_evaluation_settings.findUnique({
      where: { event_id: eventId },
      select: {
        start_date: true,
        start_time: true,
        end_date: true,
        end_time: true,
      },
    }),
    prisma.tbl_event_evaluation_config.findMany({
      where: { event_id: eventId },
      select: {
        group_id: true,
        tbl_evaluation_question_group: {
          select: { group_title: true },
        },
      },
      orderBy: { group_id: 'asc' },
    }),
    prisma.tbl_certificate_template.findUnique({
      where: { event_id: eventId },
      select: { template_path: true },
    }),
  ]);

  if (!settings && enabled.length === 0 && !cert) return null;

  return {
    settings: {
      evaluation_start_date: settings?.start_date ?? null,
      evaluation_start_time: timeToWire(settings?.start_time),
      evaluation_end_date: settings?.end_date ?? null,
      evaluation_end_time: timeToWire(settings?.end_time),
      certificate_template_path: cert?.template_path ?? null,
    },
    enabledGroups: enabled.map((e) => ({
      group_id: e.group_id,
      group_title: e.tbl_evaluation_question_group.group_title,
    })),
    certificateTemplate: cert ? { template_path: cert.template_path } : null,
  };
}

export async function getEventEvaluationResponsesByGroup(eventId: number) {
  const event = await prisma.tbl_event.findUnique({
    where: { event_id: eventId },
    select: { event_id: true },
  });
  if (!event) {
    throw Object.assign(new Error('Event not found.'), { code: 'NOT_FOUND' });
  }

  const evaluations = await prisma.tbl_evaluation.findMany({
    where: { event_id: eventId },
    select: {
      tbl_evaluation_response: {
        select: {
          response_id: true,
          question_id: true,
          response_value: true,
        },
      },
    },
  });

  const responsesByQuestion = new Map<number, { response_id: number; response_value: string }[]>();
  for (const ev of evaluations) {
    for (const r of ev.tbl_evaluation_response) {
      const list = responsesByQuestion.get(r.question_id) ?? [];
      list.push({ response_id: r.response_id, response_value: r.response_value });
      responsesByQuestion.set(r.question_id, list);
    }
  }

  const questionIds = Array.from(responsesByQuestion.keys());
  if (questionIds.length === 0) return [];

  const questions = await prisma.tbl_evaluation_question.findMany({
    where: { question_id: { in: questionIds } },
    select: {
      question_id: true,
      question_text: true,
      question_type: true,
      group_id: true,
      tbl_evaluation_question_group: {
        select: {
          group_title: true,
        },
      },
    },
    orderBy: [{ group_id: 'asc' }, { question_id: 'asc' }],
  });

  const groups = new Map<number, {
    group_id: number;
    group_title: string;
    questions: Array<{
      question_id: number;
      question_text: string;
      question_type: string;
      responses: { response_id: number; response_value: string }[];
    }>;
  }>();

  for (const q of questions) {
    const existing = groups.get(q.group_id) ?? {
      group_id: q.group_id,
      group_title: q.tbl_evaluation_question_group.group_title,
      questions: [],
    };

    existing.questions.push({
      question_id: q.question_id,
      question_text: q.question_text,
      question_type: String(q.question_type),
      responses: responsesByQuestion.get(q.question_id) ?? [],
    });
    groups.set(q.group_id, existing);
  }

  return Array.from(groups.values());
}

export async function updateEventEvaluationConfigByEventId(input: {
  eventId: number;
  groupIds: number[];
  evaluationEndDate?: string | null;
  evaluationEndTime?: string | null;
}) {
  const event = await prisma.tbl_event.findUnique({
    where: { event_id: input.eventId },
    select: {
      start_date: true,
      tbl_event_schedule: {
        select: { start_time: true },
        orderBy: [{ date: 'asc' }, { start_time: 'asc' }],
        take: 1,
      },
    },
  });
  if (!event) {
    throw Object.assign(new Error('Event not found.'), { code: 'NOT_FOUND' });
  }

  const startTime = event.tbl_event_schedule?.[0]?.start_time ?? new Date('1970-01-01T08:00:00Z');

  await prisma.$transaction(async (tx) => {
    await tx.tbl_event_evaluation_settings.upsert({
      where: { event_id: input.eventId },
      update: {
        end_date: input.evaluationEndDate ? new Date(input.evaluationEndDate) : null,
        end_time: toTimeDate(input.evaluationEndTime),
        is_active: true,
      },
      create: {
        event_id: input.eventId,
        start_date: event.start_date,
        start_time: startTime,
        end_date: input.evaluationEndDate ? new Date(input.evaluationEndDate) : null,
        end_time: toTimeDate(input.evaluationEndTime),
        is_active: true,
      },
    });

    await tx.tbl_event_evaluation_config.deleteMany({
      where: { event_id: input.eventId },
    });

    const uniq = Array.from(new Set(input.groupIds.filter((g) => Number.isInteger(g))));
    if (uniq.length > 0) {
      await tx.tbl_event_evaluation_config.createMany({
        data: uniq.map((gid) => ({ event_id: input.eventId, group_id: gid })),
        skipDuplicates: true,
      });
    }
  });
}

export async function upsertCertificateTemplate(input: {
  eventId: number;
  templatePath: string;
  uploadedBy: string;
}) {
  return prisma.tbl_certificate_template.upsert({
    where: { event_id: input.eventId },
    update: {
      template_path: input.templatePath,
      uploaded_by: input.uploadedBy,
    },
    create: {
      event_id: input.eventId,
      template_path: input.templatePath,
      uploaded_by: input.uploadedBy,
    },
    select: {
      template_id: true,
      event_id: true,
      template_path: true,
    },
  });
}

export async function getCertificateTemplateByEventId(eventId: number) {
  return prisma.tbl_certificate_template.findUnique({
    where: { event_id: eventId },
    select: {
      template_id: true,
      event_id: true,
      template_path: true,
    },
  });
}

export async function deleteCertificateTemplateByEventId(eventId: number) {
  const existing = await prisma.tbl_certificate_template.findUnique({
    where: { event_id: eventId },
    select: { template_path: true },
  });
  if (!existing) return null;

  await prisma.tbl_certificate_template.delete({ where: { event_id: eventId } });
  return existing.template_path;
}
export async function archiveSDAOEvent(eventId: number, userEmail: string | null, reason: string | null): Promise<void> {
  await prisma.tbl_event.update({
    where: { event_id: eventId },
    data: { status: 'Archived' as any },
  });
}

export async function unarchiveSDAOEvent(eventId: number, userEmail: string | null, reason: string | null): Promise<void> {
  await prisma.tbl_event.update({
    where: { event_id: eventId },
    data: { status: 'Approved' as any }, // SDAO events revert to Approved typically
  });
}
