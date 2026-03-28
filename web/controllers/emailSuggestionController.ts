import { Request, Response } from 'express';
import { member_type, status_active_pending_archive } from '../../lib/generated/prisma/client';
import { prisma } from '../../config/db';

/** Score a user record against the search term for client-side ranking.
 *  Replaces PostgreSQL pg_trgm similarity() which cannot run in Prisma ORM. */
function scoreMatch(email: string, fname: string | null, lname: string | null, term: string): number {
  const e = email.toLowerCase();
  const name = `${(fname ?? '').toLowerCase()} ${(lname ?? '').toLowerCase()}`.trim();
  if (e.startsWith(term)) return 1.0;
  if (e.includes(term)) return 0.8;
  if (name.startsWith(term)) return 0.7;
  if (name.includes(term)) return 0.5;
  return 0.3;
}

export async function getEmailSuggestions(req: Request, res: Response): Promise<void> {
  try {
    const org_id = parseInt(req.query.org_id as string, 10);
    const org_version_id = parseInt(req.query.org_version_id as string, 10);
    const email_pattern = ((req.query.email_pattern as string) || '').trim();

    if (!org_id || !org_version_id) {
      res.status(400).json({ error: 'org_id and org_version_id are required' });
      return;
    }

    if (!email_pattern || email_pattern.length < 2) {
      res.status(400).json({ error: 'email_pattern must be at least 2 characters' });
      return;
    }

    const term = email_pattern.toLowerCase();

    const users = await prisma.tbl_user.findMany({
      where: {
        status: status_active_pending_archive.Active,
        OR: [
          { email: { contains: email_pattern, mode: 'insensitive' } },
          { f_name: { contains: email_pattern, mode: 'insensitive' } },
          { l_name: { contains: email_pattern, mode: 'insensitive' } },
        ],
      },
      select: {
        email: true,
        f_name: true,
        l_name: true,
        tbl_program_tbl_user_program_idTotbl_program: { select: { abbreviation: true } },
        tbl_organization_members: {
          where: {
            org_version_id,
            member_type: member_type.Executive,
            status: { not: status_active_pending_archive.Archive },
          },
          select: { member_id: true },
          take: 1,
        },
        tbl_committee_members: {
          where: { tbl_committee: { organization_id: org_id } },
          select: { committee_member_id: true },
          take: 1,
        },
      },
      take: 100,
    });

    const suggestions = users
      .map((u) => ({
        email: u.email,
        f_name: u.f_name,
        l_name: u.l_name,
        program_name: u.tbl_program_tbl_user_program_idTotbl_program?.abbreviation ?? null,
        is_executive: u.tbl_organization_members.length > 0,
        is_committee: u.tbl_committee_members.length > 0,
        orgId: org_id,
        orgVersionId: org_version_id,
        _score: scoreMatch(u.email, u.f_name, u.l_name, term),
      }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 10)
      .map(({ _score, ...rest }) => rest);

    res.json({ suggestions });
  } catch (error) {
    console.error('Error getting email suggestions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getAllUserEmailSuggestions(req: Request, res: Response): Promise<void> {
  try {
    const email_pattern = ((req.query.email_pattern as string) || '').trim();

    if (!email_pattern || email_pattern.length < 2) {
      res.status(400).json({ error: 'email_pattern must be at least 2 characters' });
      return;
    }

    const term = email_pattern.toLowerCase();

    const users = await prisma.tbl_user.findMany({
      where: {
        status: status_active_pending_archive.Active,
        OR: [
          { email: { contains: email_pattern, mode: 'insensitive' } },
          { f_name: { contains: email_pattern, mode: 'insensitive' } },
          { l_name: { contains: email_pattern, mode: 'insensitive' } },
        ],
      },
      select: {
        email: true,
        f_name: true,
        l_name: true,
        tbl_program_tbl_user_program_idTotbl_program: { select: { abbreviation: true } },
      },
      take: 100,
    });

    const suggestions = users
      .map((u) => ({
        email: u.email,
        f_name: u.f_name,
        l_name: u.l_name,
        program_name: u.tbl_program_tbl_user_program_idTotbl_program?.abbreviation ?? null,
        _score: scoreMatch(u.email, u.f_name, u.l_name, term),
      }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 10)
      .map(({ _score, ...rest }) => rest);

    res.json({ suggestions });
  } catch (error) {
    console.error('Error getting all user email suggestions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
