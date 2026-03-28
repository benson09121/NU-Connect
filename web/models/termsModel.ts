/**
 * web/models/termsModel.ts
 *
 * Prisma data-access layer for tbl_academic_term.
 *
 * "Current" term = today falls within [start_date, end_date] (date-only comparison).
 * Duplicate check is on (term_name, academic_year) at the application level.
 */

import { prisma } from '../../config/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AcademicTerm {
  term_id: number;
  academic_year: string | null;
  term_name: string;
  start_date: Date;
  end_date: Date;
}

const SELECT_TERM = {
  term_id: true,
  academic_year: true,
  term_name: true,
  start_date: true,
  end_date: true,
} as const;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getAllTerms(): Promise<AcademicTerm[]> {
  return prisma.tbl_academic_term.findMany({
    select: SELECT_TERM,
    orderBy: { start_date: 'desc' },
  });
}

export async function getTermById(term_id: number): Promise<AcademicTerm | null> {
  return prisma.tbl_academic_term.findUnique({
    where: { term_id },
    select: SELECT_TERM,
  });
}

/** Return the term whose date range contains today, or null. */
export async function getCurrentActiveTerm(): Promise<AcademicTerm | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return prisma.tbl_academic_term.findFirst({
    where: {
      start_date: { lte: today },
      end_date: { gte: today },
    },
    select: SELECT_TERM,
    orderBy: { start_date: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createTerm(data: {
  academic_year: string;
  term_name: string;
  start_date: string;
  end_date: string;
  created_by: string;
}): Promise<AcademicTerm> {
  // Application-level duplicate check on (term_name, academic_year)
  const existing = await prisma.tbl_academic_term.findFirst({
    where: { term_name: data.term_name, academic_year: data.academic_year },
    select: { term_id: true },
  });
  if (existing) {
    throw Object.assign(
      new Error(`A ${data.term_name} for ${data.academic_year} already exists.`),
      { code: 'DUPLICATE_TERM' },
    );
  }

  return prisma.tbl_academic_term.create({
    data: {
      academic_year: data.academic_year,
      term_name: data.term_name,
      start_date: new Date(data.start_date),
      end_date: new Date(data.end_date),
      created_by: data.created_by,
    },
    select: SELECT_TERM,
  });
}

export async function updateTerm(
  term_id: number,
  data: {
    academic_year?: string;
    term_name?: string;
    start_date?: string;
    end_date?: string;
  },
): Promise<AcademicTerm> {
  const existing = await prisma.tbl_academic_term.findUnique({
    where: { term_id },
    select: { term_id: true, term_name: true, academic_year: true },
  });
  if (!existing) throw Object.assign(new Error('Term not found.'), { code: 'NOT_FOUND' });

  // Duplicate check if name or year is being changed
  const newName = data.term_name ?? existing.term_name;
  const newYear = data.academic_year ?? existing.academic_year;
  const nameOrYearChanged =
    (data.term_name !== undefined && data.term_name !== existing.term_name) ||
    (data.academic_year !== undefined && data.academic_year !== existing.academic_year);

  if (nameOrYearChanged) {
    const conflict = await prisma.tbl_academic_term.findFirst({
      where: { term_name: newName, academic_year: newYear, NOT: { term_id } },
      select: { term_id: true },
    });
    if (conflict) {
      throw Object.assign(
        new Error(`A ${newName} for ${newYear} already exists.`),
        { code: 'DUPLICATE_TERM' },
      );
    }
  }

  return prisma.tbl_academic_term.update({
    where: { term_id },
    data: {
      ...(data.academic_year !== undefined && { academic_year: data.academic_year }),
      ...(data.term_name !== undefined    && { term_name: data.term_name }),
      ...(data.start_date !== undefined   && { start_date: new Date(data.start_date) }),
      ...(data.end_date !== undefined     && { end_date: new Date(data.end_date) }),
      updated_at: new Date(),
    },
    select: SELECT_TERM,
  });
}

export async function deleteTerm(term_id: number): Promise<{ term_name: string; academic_year: string | null }> {
  const existing = await prisma.tbl_academic_term.findUnique({
    where: { term_id },
    select: { term_id: true, term_name: true, academic_year: true },
  });
  if (!existing) throw Object.assign(new Error('Term not found.'), { code: 'NOT_FOUND' });

  // Guard: refuse if payment records exist
  const paymentCount = await prisma.tbl_term_payments.count({ where: { term_id } });
  if (paymentCount > 0) {
    throw Object.assign(
      new Error('Cannot delete a term with active payment records.'),
      { code: 'HAS_PAYMENTS' },
    );
  }

  await prisma.tbl_academic_term.delete({ where: { term_id } });
  return { term_name: existing.term_name, academic_year: existing.academic_year };
}
