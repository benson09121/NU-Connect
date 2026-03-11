import { prisma } from '../../config/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isDuplicate(err: unknown): boolean {
  return (err as { code?: string }).code === 'P2002';
}

// ---------------------------------------------------------------------------
// Section mutations
// ---------------------------------------------------------------------------

export async function createSection(
  sectionName: string,
  programId: number,
): Promise<{ section_id: number }> {
  try {
    const s = await prisma.tbl_section.create({
      data: { section_name: sectionName.trim(), program_id: programId, is_active: true },
    });
    return { section_id: s.section_id };
  } catch (err: unknown) {
    if (isDuplicate(err)) {
      throw Object.assign(
        new Error('A section with this name already exists in the selected program.'),
        { code: 'DUPLICATE' },
      );
    }
    throw err;
  }
}

export async function updateSection(
  sectionId: number,
  sectionName: string,
  programId: number,
): Promise<void> {
  try {
    await prisma.tbl_section.update({
      where: { section_id: sectionId },
      data: {
        section_name: sectionName.trim(),
        program_id: programId,
        updated_at: new Date(),
      },
    });
  } catch (err: unknown) {
    if (isDuplicate(err)) {
      throw Object.assign(
        new Error('A section with this name already exists in the selected program.'),
        { code: 'DUPLICATE' },
      );
    }
    throw err;
  }
}

export async function archiveSection(sectionId: number): Promise<void> {
  await prisma.tbl_section.update({
    where: { section_id: sectionId },
    data: { is_active: false, updated_at: new Date() },
  });
}

export async function unarchiveSection(sectionId: number): Promise<void> {
  await prisma.tbl_section.update({
    where: { section_id: sectionId },
    data: { is_active: true, updated_at: new Date() },
  });
}
