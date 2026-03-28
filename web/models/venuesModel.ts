/**
 * web/models/venuesModel.ts
 *
 * Prisma queries for the Venue management feature.
 *
 * Key design:
 *  - tbl_venue  — master list of physical rooms/locations
 *  - tbl_event_venue — junction: one event can occupy many venues simultaneously
 *  - tbl_event.venue (text) is REPURPOSED as the online meeting URL for Online events
 *
 * Availability check:
 *  A venue is "occupied" when another active event overlaps both the date range
 *  AND the time window.  Online events have no venue_id so they never conflict.
 */

import { prisma } from '../../config/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VenueRow {
  venue_id: number;
  name: string;
  description: string | null;
  capacity: number | null;
  status: string;
  created_at: Date | null;
}

export interface VenueWithAvailability extends VenueRow {
  is_available: boolean;
  occupied_by: { event_id: number; title: string; start_date: string; end_date: string; start_time: string; end_time: string }[];
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** List all active (non-archived) venues. */
export async function getAllVenues(): Promise<VenueRow[]> {
  return prisma.tbl_venue.findMany({
    where: { archived_at: null },
    select: { venue_id: true, name: true, description: true, capacity: true, status: true, created_at: true },
    orderBy: { name: 'asc' },
  });
}

/**
 * List all active venues annotated with availability for a given date/time window.
 * If no date/time is provided, all venues are returned as available.
 *
 * A venue is "occupied" if there is any active event that:
 *   - overlaps the date range  (event.start_date <= end_date AND event.end_date >= start_date)
 *   - overlaps the time window (event.start_time < end_time AND event.end_time > start_time)
 *   - has status IN ('Pending', 'Active', 'Approved', 'Ongoing')
 *   - is linked to the venue via tbl_event_venue
 *   - (optionally) has a different event_id than exclude_event_id
 */
export async function getVenuesWithAvailability(
  start_date?: string | null,
  end_date?: string | null,
  start_time?: string | null,
  end_time?: string | null,
  exclude_event_id?: number | null,
): Promise<VenueWithAvailability[]> {
  const venues = await prisma.tbl_venue.findMany({
    where: { archived_at: null },
    select: {
      venue_id: true,
      name: true,
      description: true,
      capacity: true,
      status: true,
      created_at: true,
      // Per-slot bookings via schedule junction
      tbl_event_schedule_venue: {
        select: {
          tbl_event_schedule: {
            select: {
              date: true,
              start_time: true,
              end_time: true,
              tbl_event: {
                select: { event_id: true, title: true, status: true },
              },
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  return venues.map((v) => {
    const conflictingEvents: VenueWithAvailability['occupied_by'] = [];

    if (start_date && start_time && end_time) {
      const sdStart = new Date(start_date);
      const sdEnd = new Date(end_date ?? start_date);
      const stStart = new Date(`1970-01-01T${start_time}Z`).getTime();
      const stEnd = new Date(`1970-01-01T${end_time}Z`).getTime();

      const activeStatuses = ['Pending', 'Active', 'Approved', 'Ongoing'];

      for (const esv of v.tbl_event_schedule_venue) {
        const sched = esv.tbl_event_schedule;
        const e = sched.tbl_event;
        if (!activeStatuses.includes(e.status as string)) continue;
        if (exclude_event_id && e.event_id === exclude_event_id) continue;

        // Schedule date must fall within the requested date window
        if (sched.date < sdStart || sched.date > sdEnd) continue;

        // Time overlap
        const eTimeStart = sched.start_time.getTime();
        const eTimeEnd = sched.end_time.getTime();
        if (eTimeStart >= stEnd || eTimeEnd <= stStart) continue;

        conflictingEvents.push({
          event_id: e.event_id,
          title: e.title,
          start_date: sched.date.toISOString().slice(0, 10),
          end_date: sched.date.toISOString().slice(0, 10),
          start_time: sched.start_time.toISOString().slice(11, 19),
          end_time: sched.end_time.toISOString().slice(11, 19),
        });
      }
    }

    return {
      venue_id: v.venue_id,
      name: v.name,
      description: v.description,
      capacity: v.capacity,
      status: v.status,
      created_at: v.created_at,
      is_available: conflictingEvents.length === 0,
      occupied_by: conflictingEvents,
    };
  });
}

/** Get a single venue by ID. */
export async function getVenueById(venue_id: number) {
  return prisma.tbl_venue.findUnique({
    where: { venue_id },
    select: { venue_id: true, name: true, description: true, capacity: true, status: true, archived_at: true, created_at: true },
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create a new venue. Throws if name already exists (Prisma unique constraint). */
export async function createVenue(data: {
  name: string;
  description?: string | null;
  capacity?: number | null;
  created_by: string;
}) {
  return prisma.tbl_venue.create({
    data: {
      name: data.name.trim(),
      description: data.description ?? null,
      capacity: data.capacity ?? null,
      created_by: data.created_by,
    },
    select: { venue_id: true, name: true, description: true, capacity: true, status: true, created_at: true },
  });
}

/** Update venue name/description/capacity. Throws if new name conflicts. */
export async function updateVenue(data: {
  venue_id: number;
  name?: string;
  description?: string | null;
  capacity?: number | null;
}) {
  const existing = await prisma.tbl_venue.findUnique({ where: { venue_id: data.venue_id } });
  if (!existing) {
    const err = new Error(`Venue #${data.venue_id} not found.`);
    (err as any).code = 'NOT_FOUND';
    throw err;
  }
  if (existing.archived_at) {
    const err = new Error(`Venue #${data.venue_id} is archived and cannot be updated.`);
    (err as any).code = 'ARCHIVED';
    throw err;
  }

  return prisma.tbl_venue.update({
    where: { venue_id: data.venue_id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
    },
    select: { venue_id: true, name: true, description: true, capacity: true, status: true },
  });
}

/** Archive a venue (soft-delete). */
export async function archiveVenue(data: {
  venue_id: number;
  archived_by: string;
  archived_reason: string;
}) {
  const existing = await prisma.tbl_venue.findUnique({ where: { venue_id: data.venue_id } });
  if (!existing) {
    const err = new Error(`Venue #${data.venue_id} not found.`);
    (err as any).code = 'NOT_FOUND';
    throw err;
  }
  if (existing.archived_at) {
    const err = new Error(`Venue #${data.venue_id} is already archived.`);
    (err as any).code = 'ALREADY_ARCHIVED';
    throw err;
  }

  return prisma.tbl_venue.update({
    where: { venue_id: data.venue_id },
    data: {
      status: 'Archived',
      archived_at: new Date(),
      archived_by: data.archived_by,
      archived_reason: data.archived_reason,
    },
    select: { venue_id: true, name: true },
  });
}

/** Restore an archived venue. */
export async function unarchiveVenue(venue_id: number) {
  const existing = await prisma.tbl_venue.findUnique({ where: { venue_id } });
  if (!existing) {
    const err = new Error(`Venue #${venue_id} not found.`);
    (err as any).code = 'NOT_FOUND';
    throw err;
  }
  if (!existing.archived_at) {
    const err = new Error(`Venue #${venue_id} is not archived.`);
    (err as any).code = 'NOT_ARCHIVED';
    throw err;
  }

  return prisma.tbl_venue.update({
    where: { venue_id },
    data: { status: 'Active', archived_at: null, archived_by: null, archived_reason: null },
    select: { venue_id: true, name: true },
  });
}
