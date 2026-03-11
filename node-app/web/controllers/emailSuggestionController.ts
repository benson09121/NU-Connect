import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';

interface EmailSuggestion {
  email: string;
  f_name: string | null;
  l_name: string | null;
  program_name: string | null;
  is_executive: boolean | bigint;
  is_committee: boolean | bigint;
  score: number;
}

interface EmailSuggestionAll {
  email: string;
  f_name: string | null;
  l_name: string | null;
  program_name: string | null;
  score: number;
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

    const pattern = `%${email_pattern.toLowerCase()}%`;
    const term = email_pattern.toLowerCase();

    const results = await prisma.$queryRaw<EmailSuggestion[]>(Prisma.sql`
      SELECT
        u.email,
        u.f_name,
        u.l_name,
        p.abbreviation AS program_name,
        EXISTS (
          SELECT 1 FROM tbl_organization_members om
          WHERE om.user_id = u.user_id
            AND om.org_version_id = ${org_version_id}
            AND om.member_type = 'Executive'
            AND om.status != 'Archive'
        )::boolean AS is_executive,
        EXISTS (
          SELECT 1 FROM tbl_committee_members cm
          JOIN tbl_committee c ON c.committee_id = cm.committee_id
          JOIN tbl_organization_version ov ON ov.organization_id = c.organization_id
          WHERE cm.user_id = u.user_id
            AND ov.org_version_id = ${org_version_id}
        )::boolean AS is_committee,
        GREATEST(
          similarity(LOWER(u.email), ${term}),
          similarity(LOWER(COALESCE(u.f_name, '')) || ' ' || LOWER(COALESCE(u.l_name, '')), ${term})
        ) AS score
      FROM tbl_user u
      LEFT JOIN tbl_program p ON p.program_id = u.program_id
      WHERE
        (LOWER(u.email) ILIKE ${pattern}
          OR LOWER(COALESCE(u.f_name, '')) || ' ' || LOWER(COALESCE(u.l_name, '')) ILIKE ${pattern})
        AND u.status = 'Active'
      ORDER BY score DESC
      LIMIT 10
    `);

    res.json({
      suggestions: results.map((r) => ({
        email: r.email,
        f_name: r.f_name,
        l_name: r.l_name,
        program_name: r.program_name,
        is_executive: Boolean(r.is_executive),
        is_committee: Boolean(r.is_committee),
        orgId: org_id,
        orgVersionId: org_version_id,
      })),
    });
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

    const pattern = `%${email_pattern.toLowerCase()}%`;
    const term = email_pattern.toLowerCase();

    const results = await prisma.$queryRaw<EmailSuggestionAll[]>(Prisma.sql`
      SELECT
        u.email,
        u.f_name,
        u.l_name,
        p.abbreviation AS program_name,
        GREATEST(
          similarity(LOWER(u.email), ${term}),
          similarity(LOWER(COALESCE(u.f_name, '')) || ' ' || LOWER(COALESCE(u.l_name, '')), ${term})
        ) AS score
      FROM tbl_user u
      LEFT JOIN tbl_program p ON p.program_id = u.program_id
      WHERE
        (LOWER(u.email) ILIKE ${pattern}
          OR LOWER(COALESCE(u.f_name, '')) || ' ' || LOWER(COALESCE(u.l_name, '')) ILIKE ${pattern})
        AND u.status = 'Active'
      ORDER BY score DESC
      LIMIT 10
    `);

    res.json({
      suggestions: results.map((r) => ({
        email: r.email,
        f_name: r.f_name,
        l_name: r.l_name,
        program_name: r.program_name,
      })),
    });
  } catch (error) {
    console.error('Error getting all user email suggestions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
