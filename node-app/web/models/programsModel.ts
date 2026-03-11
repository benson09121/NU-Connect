import { prisma } from '../../config/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProgramItem {
  program_id: number;
  program_name: string | null;
  abbreviation: string | null;
  college_id: number;
  college_name: string | null;
  status: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isDuplicate(err: unknown): boolean {
  return (err as { code?: string }).code === 'P2002';
}

// ---------------------------------------------------------------------------
// Programs CRUD
// ---------------------------------------------------------------------------

export async function getAllPrograms(): Promise<ProgramItem[]> {
  const programs = await prisma.tbl_program.findMany({
    include: {
      tbl_college: { select: { name: true } },
    },
    orderBy: [{ tbl_college: { name: 'asc' } }, { name: 'asc' }],
  });

  return programs.map((p) => ({
    program_id: p.program_id,
    program_name: p.name ?? null,
    abbreviation: p.abbreviation ?? null,
    college_id: p.college_id,
    college_name: p.tbl_college?.name ?? null,
    status: p.status,
  }));
}

export async function createProgram(
  collegeId: number,
  name: string,
  abbreviation: string,
): Promise<{ program_id: number }> {
  try {
    const p = await prisma.tbl_program.create({
      data: { college_id: collegeId, name, abbreviation },
    });
    return { program_id: p.program_id };
  } catch (err: unknown) {
    if (isDuplicate(err)) {
      throw Object.assign(new Error('Program name or abbreviation already exists.'), { code: 'DUPLICATE' });
    }
    throw err;
  }
}

export async function updateProgram(
  programId: number,
  collegeId: number,
  name: string,
  abbreviation: string,
): Promise<void> {
  try {
    await prisma.tbl_program.update({
      where: { program_id: programId },
      data: { college_id: collegeId, name, abbreviation },
    });
  } catch (err: unknown) {
    if (isDuplicate(err)) {
      throw Object.assign(new Error('Program name or abbreviation already exists.'), { code: 'DUPLICATE' });
    }
    throw err;
  }
}

export async function archiveProgram(
  programId: number,
  archivedByUserId: string,
  reason?: string,
): Promise<void> {
  await prisma.tbl_program.update({
    where: { program_id: programId },
    data: {
      status: 'Archived',
      archived_at: new Date(),
      archived_by: archivedByUserId,
      archived_reason: reason ?? null,
    },
  });
}

export async function unarchiveProgram(programId: number): Promise<void> {
  await prisma.tbl_program.update({
    where: { program_id: programId },
    data: {
      status: 'Active',
      archived_at: null,
      archived_by: null,
      archived_reason: null,
    },
  });
}
