import { Request, Response } from 'express';
import {
  ForbiddenScopeError,
  getActivities,
  getLeaderboards,
  getLeaderboardsByCategory,
  getMemberEngagement,
  getOrganizationAnalytics,
  getOrganizationFinance,
  resolveScopeDiagnostics,
} from '../models/analyticsModel';

type Fetcher = (
  userId: string,
  orgId: number | null,
  preResolvedOrgIds: number[] | null,
) => Promise<unknown>;

function shouldAttachAnalyticsDebugHeaders(req: Request): boolean {
  if (process.env.ANALYTICS_DEBUG_HEADERS === 'true') return true;
  const q = String(req.query.analytics_debug ?? '').toLowerCase();
  return q === '1' || q === 'true';
}

function attachAnalyticsDebugHeaders(req: Request, res: Response, diagnostics: {
  roleName: string;
  scopeMode: string;
  resolvedOrganizationIds: number[];
}): void {
  if (!shouldAttachAnalyticsDebugHeaders(req)) return;

  res.setHeader('X-Analytics-Role', String(diagnostics.roleName || 'Unknown'));
  res.setHeader('X-Analytics-Scope-Mode', String(diagnostics.scopeMode || 'role-scoped'));
  res.setHeader('X-Analytics-Resolved-Org-Count', String(diagnostics.resolvedOrganizationIds?.length || 0));
}

function parseOrganizationId(rawValue: unknown): number | null {
  if (rawValue === undefined || rawValue === null || rawValue === '') return null;
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) return NaN;
  return parsed;
}

function getAuthUserId(req: Request): string | null {
  return req.user?.user_id || null;
}

function handleAnalyticsError(res: Response, error: unknown): void {
  if (error instanceof ForbiddenScopeError || (error as any)?.code === 'FORBIDDEN') {
    res.status(403).json({
      message: 'Forbidden',
      code: 'FORBIDDEN',
      details: 'organization_id is outside your access scope',
    });
    return;
  }

  if ((error as any)?.code === 'UNAUTHORIZED') {
    res.status(401).json({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
    return;
  }

  res.status(500).json({
    message: (error as any)?.message || 'Internal server error',
    code: 'INTERNAL_SERVER_ERROR',
  });
}

async function withScope(req: Request, res: Response, fetcher: Fetcher): Promise<void> {
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
    return;
  }

  const orgId = parseOrganizationId(req.query.organization_id);
  if (Number.isNaN(orgId)) {
    res.status(400).json({
      message: 'Invalid query format',
      code: 'BAD_REQUEST',
      details: 'organization_id must be a positive integer',
    });
    return;
  }

  try {
    const diagnostics = await resolveScopeDiagnostics(userId, orgId);
    attachAnalyticsDebugHeaders(req, res, diagnostics);

    const payload = await fetcher(userId, orgId, diagnostics.resolvedOrganizationIds);
    if (Array.isArray(payload)) {
      res.status(200).json(payload);
      return;
    }
    res.status(200).json(payload || []);
  } catch (error) {
    handleAnalyticsError(res, error);
  }
}

export async function getLeaderboardsHandler(req: Request, res: Response): Promise<void> {
  await withScope(req, res, getLeaderboards);
}

export async function getLeaderboardsByCategoryHandler(req: Request, res: Response): Promise<void> {
  await withScope(req, res, getLeaderboardsByCategory);
}

export async function getOrganizationAnalyticsHandler(req: Request, res: Response): Promise<void> {
  await withScope(req, res, getOrganizationAnalytics);
}

export async function getActivitiesHandler(req: Request, res: Response): Promise<void> {
  await withScope(req, res, getActivities);
}

export async function getOrganizationFinanceHandler(req: Request, res: Response): Promise<void> {
  await withScope(req, res, getOrganizationFinance);
}

export async function getMemberEngagementHandler(req: Request, res: Response): Promise<void> {
  await withScope(req, res, getMemberEngagement);
}

export default {
  getLeaderboardsHandler,
  getLeaderboardsByCategoryHandler,
  getOrganizationAnalyticsHandler,
  getActivitiesHandler,
  getOrganizationFinanceHandler,
  getMemberEngagementHandler,
};
