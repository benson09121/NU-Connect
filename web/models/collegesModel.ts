import { prisma } from '../../config/db';
import { Prisma } from '../../lib/generated/prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollegeItem {
  college_id: number;
  name: string;
  abbreviation: string;
  status: string;
  archived_at: string | null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getAllColleges(): Promise<CollegeItem[]> {
  const colleges = await prisma.tbl_college.findMany({
    select: {
      college_id: true,
      name: true,
      abbreviation: true,
      status: true,
      archived_at: true,
    },
    orderBy: { name: 'asc' },
  });

  return colleges.map((c) => ({
    college_id: c.college_id,
    name: c.name,
    abbreviation: c.abbreviation,
    status: c.status,
    archived_at: c.archived_at?.toISOString() ?? null,
  }));
}

export async function createCollege(name: string, abbreviation: string): Promise<CollegeItem> {
  try {
    const college = await prisma.tbl_college.create({
      data: { name, abbreviation },
      select: { college_id: true, name: true, abbreviation: true, status: true, archived_at: true },
    });
    return { ...college, archived_at: college.archived_at?.toISOString() ?? null };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw Object.assign(new Error('A college with this name or abbreviation already exists.'), { code: 'DUPLICATE' });
    }
    throw err;
  }
}

export async function updateCollege(
  collegeId: number,
  name: string,
  abbreviation: string,
): Promise<void> {
  try {
    await prisma.tbl_college.update({
      where: { college_id: collegeId },
      data: { name, abbreviation },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw Object.assign(new Error('A college with this name or abbreviation already exists.'), { code: 'DUPLICATE' });
    }
    throw err;
  }
}

export async function archiveCollege(
  collegeId: number,
  reason: string,
  archivedByUserId: string,
): Promise<void> {
  await prisma.tbl_college.update({
    where: { college_id: collegeId },
    data: {
      status: 'Archived',
      archived_at: new Date(),
      archived_by: archivedByUserId,
      archived_reason: reason,
    },
  });
}

export async function unarchiveCollege(collegeId: number): Promise<void> {
  await prisma.tbl_college.update({
    where: { college_id: collegeId },
    data: {
      status: 'Active',
      archived_at: null,
      archived_by: null,
      archived_reason: null,
    },
  });
}
