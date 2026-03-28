import { Request, Response } from 'express';
import { prisma } from '../../config/db';
import { getDefaultDeepseekModel } from '../../config/deepseek';
import { broadcastToUser } from '../../services/websocketService';
import {
  getActivities,
  getLeaderboards,
  getMemberEngagement,
  getOrganizationFinance,
} from '../models/analyticsModel';

const DEFAULT_SYSTEM_PROMPT =
  'You are NOVA, a professional AI analytics assistant for NU Connect. Use page context and analytics summaries as source of truth before giving recommendations. Focus on events, activities, finance, member engagement, and organization performance.';

function buildContextAwareSystemPrompt(context: any, snapshot: any): string {
  const role = String(context?.user?.role ?? context?.userRole ?? 'Unknown');
  const tab = String(context?.view?.active_tab ?? context?.activeTab ?? 'overview');
  const selectedOrg = String(context?.view?.selected_org_name ?? context?.view?.selected_org ?? context?.selected_org_name ?? context?.selected_org ?? 'current');
  const queryMode = String(snapshot?.query_mode ?? 'current_view');

  return [
    DEFAULT_SYSTEM_PROMPT,
    '',
    'Behavior Rules:',
    '- Prioritize current view analytics first, then broader organization comparisons when requested.',
    '- Use exact numbers from provided snapshot and mention organization names explicitly.',
    '- Always include 2-4 concrete recommendations based on events, finance, and engagement.',
    '- If user asks outside analytics scope, politely redirect back to organizational analytics.',
    '',
    'Runtime Context:',
    `- User Role: ${role}`,
    `- Active Tab: ${tab}`,
    `- Selected Organization: ${selectedOrg}`,
    `- Query Mode: ${queryMode}`,
  ].join('\n');
}

function channelFor(email: string, conversationId: string): string {
  return `ai:chat:email:${email}:${conversationId}`;
}

function toConversationId(value: unknown): bigint | null {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  if (!/^\d+$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

function normalizeEntityType(v: unknown): 'general' | 'user' | 'organization' | 'event' | 'application' | 'approval' | 'system' {
  const val = String(v ?? 'general').toLowerCase();
  const allowed = new Set(['general', 'user', 'organization', 'event', 'application', 'approval', 'system']);
  return allowed.has(val) ? (val as any) : 'general';
}

function toEntityId(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

function parseOrgId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function detectMultiOrgIntent(message: string, context: any): boolean {
  const text = String(message || '').toLowerCase();

  const specificViewKeywords = [
    'this event',
    'this transaction',
    'current page',
    'this organization',
    'current view',
    'this tab',
  ];
  if (specificViewKeywords.some((k) => text.includes(k))) return false;

  const broadKeywords = [
    'overall',
    'summary',
    'all organizations',
    'across organizations',
    'combined',
    'comparison',
    'which organization',
    'top organization',
  ];
  if (broadKeywords.some((k) => text.includes(k))) return true;

  const selectedOrg = context?.view?.selected_org ?? context?.selected_org;
  if (selectedOrg === 'all') return true;

  const orgCount = Number(context?.scope?.organization_count ?? context?.userOrganizations?.length ?? 0);
  return orgCount > 1;
}

function clampText(raw: string, maxLen = 8000): string {
  const text = String(raw || '');
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}\n... [truncated]`;
}

async function buildAnalyticsSnapshot(userId: string, content: string, context: any) {
  const roleName = String(context?.user?.role ?? context?.userRole ?? '').trim();
  const requestedOrg = parseOrgId(context?.view?.selected_org ?? context?.selected_org ?? context?.currentOrganization);

  let orgIds: number[] = [];
  if (roleName === 'SDAO') {
    const allApproved = await prisma.tbl_organization.findMany({
      where: { status: 'Approved' },
      select: { organization_id: true },
      orderBy: { name: 'asc' },
    });
    orgIds = allApproved.map((o) => o.organization_id);
  } else {
    const accessible = await buildUserOrganizations(userId);
    orgIds = accessible.map((o) => o.organization_id);
  }

  if (orgIds.length === 0) {
    return {
      query_mode: 'none',
      organization_ids: [],
      organizations: [],
      summary: {},
    };
  }

  const isMultiOrg = detectMultiOrgIntent(content, context);
  const effectiveOrgIds = requestedOrg && orgIds.includes(requestedOrg)
    ? [requestedOrg]
    : (isMultiOrg ? orgIds : [orgIds[0]]);

  const [activities, finance, engagement, leaderboards] = await Promise.all([
    getActivities(userId, null, effectiveOrgIds),
    getOrganizationFinance(userId, null, effectiveOrgIds),
    getMemberEngagement(userId, null, effectiveOrgIds),
    getLeaderboards(userId, null, effectiveOrgIds),
  ]);

  const activitiesByOrg = new Map(activities.map((row) => [row.organization_id, row]));
  const financeByOrg = new Map(finance.map((row) => [row.organization_id, row]));
  const engagementByOrg = new Map(engagement.map((row) => [row.organization_id, row]));
  const leaderboardByOrg = new Map(leaderboards.map((row) => [row.organization_id, row]));

  const organizations = effectiveOrgIds.map((orgId) => {
    const a = activitiesByOrg.get(orgId);
    const f = financeByOrg.get(orgId);
    const e = engagementByOrg.get(orgId);
    const l = leaderboardByOrg.get(orgId);

    return {
      organization_id: orgId,
      organization_name:
        a?.organization_name ||
        f?.organization_name ||
        e?.organization_name ||
        l?.organization_name ||
        `Organization ${orgId}`,
      events: {
        completed_events: a?.completed_events ?? 0,
        upcoming_events: a?.upcoming_events ?? 0,
        attendance_total: (a?.attendance_trend || []).reduce((sum, item) => sum + Number(item.attended || 0), 0),
      },
      finance: {
        income_this_month: f?.income_this_month ?? 0,
        expense_this_month: f?.expense_this_month ?? 0,
        net_this_month: Number((f?.income_this_month ?? 0) - (f?.expense_this_month ?? 0)),
      },
      member_engagement: {
        registered_members: e?.registered_members ?? 0,
        active_members: e?.active_members ?? 0,
      },
      leaderboard: {
        rank: l?.rank ?? null,
        total_points: l?.total_points ?? 0,
      },
    };
  });

  const summary = {
    organization_count: organizations.length,
    events_total: organizations.reduce((sum, org) => sum + org.events.completed_events + org.events.upcoming_events, 0),
    revenue_total: organizations.reduce((sum, org) => sum + org.finance.income_this_month, 0),
    expenses_total: organizations.reduce((sum, org) => sum + org.finance.expense_this_month, 0),
    members_total: organizations.reduce((sum, org) => sum + org.member_engagement.registered_members, 0),
  };

  return {
    query_mode: isMultiOrg ? 'multi_org' : 'current_view',
    organization_ids: effectiveOrgIds,
    organizations,
    summary,
  };
}

async function getAuthenticatedUser(req: Request): Promise<{ user_id: string; email: string } | null> {
  const email = req.user?.email;
  if (!email) return null;

  const user = await prisma.tbl_user.findUnique({
    where: { email },
    select: { user_id: true, email: true },
  });
  return user ?? null;
}

function forbiddenConversation(res: Response): void {
  res.status(403).json({
    message: 'Forbidden',
    code: 'FORBIDDEN',
    details: 'You do not have access to this conversation',
  });
}

async function validateConversationOwnership(conversationId: bigint, userId: string) {
  const conv = await prisma.tbl_ai_conversation.findFirst({
    where: {
      conversation_id: conversationId,
      owner_id: userId,
      is_archived: false,
    },
    select: {
      conversation_id: true,
      owner_id: true,
      system_prompt: true,
    },
  });
  return conv;
}

async function buildUserOrganizations(userId: string) {
  const [advised, memberships] = await Promise.all([
    prisma.tbl_organization.findMany({
      where: { adviser_id: userId, status: 'Approved' },
      select: { organization_id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.tbl_organization_members.findMany({
      where: { user_id: userId, status: 'Active' },
      select: { organization_id: true },
      distinct: ['organization_id'],
    }),
  ]);

  const memberOrgIds = memberships.map((m) => m.organization_id);
  const memberOrgs = memberOrgIds.length
    ? await prisma.tbl_organization.findMany({
        where: { organization_id: { in: memberOrgIds }, status: 'Approved' },
        select: { organization_id: true, name: true },
      })
    : [];

  const map = new Map<number, { organization_id: number; organization_name: string; name: string }>();
  [...advised, ...memberOrgs].forEach((org) => {
    map.set(org.organization_id, {
      organization_id: org.organization_id,
      organization_name: org.name,
      name: org.name,
    });
  });

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getUserOrganizationsHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const organizations = await buildUserOrganizations(user.user_id);
    res.status(200).json({ organizations: Array.isArray(organizations) ? organizations : [] });
  } catch (error: any) {
    console.error('[nova.user.organizations] error:', error);
    res.status(500).json({ message: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }
}

export async function getLastConversationHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    if (!req.query.entityType) {
      res.status(400).json({ message: 'Invalid query format', code: 'BAD_REQUEST', details: 'entityType is required' });
      return;
    }

    const entityType = normalizeEntityType(req.query.entityType);
    const entityId = toEntityId(req.query.entityId);

    const row = await prisma.tbl_ai_conversation.findFirst({
      where: {
        owner_id: user.user_id,
        is_archived: false,
        entity_type: entityType,
        ...(entityId !== null ? { entity_id: entityId } : {}),
      },
      orderBy: [{ updated_at: 'desc' }, { conversation_id: 'desc' }],
      select: { conversation_id: true },
    });

    res.status(200).json({ conversationId: row ? String(row.conversation_id) : null });
  } catch (error: any) {
    console.error('[nova.conversations.last] error:', error);
    res.status(500).json({ message: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }
}

export async function createConversationHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const entityType = normalizeEntityType(req.body?.entityType);
    const entityId = toEntityId(req.body?.entityId);
    const forceNew = Boolean(req.body?.forceNew);
    const systemPrompt = typeof req.body?.systemPrompt === 'string' && req.body.systemPrompt.trim()
      ? req.body.systemPrompt.trim()
      : DEFAULT_SYSTEM_PROMPT;

    const context = req.body?.context;
    if (context !== undefined && (typeof context !== 'object' || context === null || Array.isArray(context))) {
      res.status(400).json({ message: 'Invalid request body', code: 'BAD_REQUEST', details: 'context must be a JSON object' });
      return;
    }

    const scopeWhere = {
      owner_id: user.user_id,
      is_archived: false,
      entity_type: entityType,
      ...(entityId !== null ? { entity_id: entityId } : {}),
    };

    const existing = await prisma.tbl_ai_conversation.findFirst({
      where: scopeWhere,
      orderBy: [{ updated_at: 'desc' }, { conversation_id: 'desc' }],
      select: { conversation_id: true },
    });

    // Reuse by default so frontend bootstrap calls do not create duplicate chats.
    if (existing && !forceNew) {
      res.status(200).json({ conversationId: String(existing.conversation_id) });
      return;
    }

    // Even when forceNew=true, dedupe retries if latest conversation is still empty.
    if (existing && forceNew) {
      const userMessageCount = await prisma.tbl_ai_message.count({
        where: {
          conversation_id: existing.conversation_id,
          role: 'user' as any,
        },
      });

      if (userMessageCount === 0) {
        res.status(200).json({ conversationId: String(existing.conversation_id) });
        return;
      }
    }

    const created = await prisma.tbl_ai_conversation.create({
      data: {
        owner_id: user.user_id,
        entity_type: entityType,
        entity_id: entityId,
        system_prompt: systemPrompt,
        model: getDefaultDeepseekModel().model,
      },
      select: { conversation_id: true },
    });

    if (context) {
      await prisma.tbl_ai_message.create({
        data: {
          conversation_id: created.conversation_id,
          role: 'system' as any,
          content: 'NOVA JSON context initialized',
          meta: { context },
          message_scope: 'current_view' as any,
        },
      });
    }

    res.status(200).json({ conversationId: String(created.conversation_id) });
  } catch (error: any) {
    console.error('[nova.conversations.create] error:', error);
    res.status(500).json({ message: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }
}

export async function registerChannelHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const conversationId = toConversationId(req.query.conversationId);
    const sessionId = String(req.query.sessionId ?? '').trim();
    if (!conversationId) {
      res.status(400).json({ message: 'Invalid query format', code: 'BAD_REQUEST', details: 'conversationId is required' });
      return;
    }

    const conv = await prisma.tbl_ai_conversation.findUnique({
      where: { conversation_id: conversationId },
      select: { conversation_id: true, owner_id: true, is_archived: true },
    });

    if (!conv || conv.is_archived) {
      res.status(404).json({ message: 'Conversation not found', code: 'NOT_FOUND' });
      return;
    }

    if (conv.owner_id !== user.user_id) {
      forbiddenConversation(res);
      return;
    }

    const channel = channelFor(user.email, String(conversationId));

    res.status(200).json({
      ok: true,
      conversationId: String(conversationId),
      sessionId: sessionId || null,
      registered: true,
      mode: 'websocket',
      channel,
    });
  } catch (error: any) {
    console.error('[nova.chat.register] error:', error);
    res.status(500).json({ message: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }
}

function mapMessage(row: { message_id: bigint; conversation_id: bigint; role: string; content: string; created_at: Date | null }) {
  return {
    message_id: String(row.message_id),
    conversation_id: String(row.conversation_id),
    role: row.role,
    content: row.content ?? '',
    created_at: row.created_at,
  };
}

function parseNonNegativeInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

export async function getConversationMessagesHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const conversationId = toConversationId(req.params.conversationId);
    if (!conversationId) {
      res.status(400).json({
        message: 'Invalid path params',
        code: 'BAD_REQUEST',
        details: 'conversationId must be a numeric id',
      });
      return;
    }

    const limitRaw = parseNonNegativeInt(req.query.limit, 10);
    const offset = parseNonNegativeInt(req.query.offset, 0);
    const limit = Math.min(Math.max(limitRaw, 1), 100);

    const conv = await prisma.tbl_ai_conversation.findUnique({
      where: { conversation_id: conversationId },
      select: { conversation_id: true, owner_id: true, is_archived: true },
    });

    if (!conv || conv.is_archived) {
      res.status(404).json({ message: 'Conversation not found', code: 'NOT_FOUND' });
      return;
    }

    if (conv.owner_id !== user.user_id) {
      forbiddenConversation(res);
      return;
    }

    const [total, rows] = await Promise.all([
      prisma.tbl_ai_message.count({
        where: { conversation_id: conversationId },
      }),
      prisma.tbl_ai_message.findMany({
        where: { conversation_id: conversationId },
        orderBy: [{ created_at: 'asc' }, { message_id: 'asc' }],
        skip: offset,
        take: limit,
        select: {
          message_id: true,
          role: true,
          content: true,
          created_at: true,
        },
      }),
    ]);

    const messages = rows.map((row) => ({
      id: String(row.message_id),
      role: row.role,
      content: row.content ?? '',
      created_at: row.created_at,
    }));

    res.status(200).json({
      messages,
      pagination: {
        limit,
        offset,
        hasMore: offset + rows.length < total,
        total,
      },
    });
  } catch (error: any) {
    console.error('[nova.conversations.messages] error:', error);
    res.status(500).json({ message: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }
}

export async function sendMessageHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const conversationId = toConversationId(req.body?.conversationId);
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    const context = req.body?.context;

    if (!conversationId || !content) {
      res.status(400).json({ message: 'Invalid request body', code: 'BAD_REQUEST', details: 'conversationId and content are required' });
      return;
    }

    if (context !== undefined && (typeof context !== 'object' || context === null || Array.isArray(context))) {
      res.status(400).json({ message: 'Invalid request body', code: 'BAD_REQUEST', details: 'context must be a JSON object' });
      return;
    }

    const convRaw = await prisma.tbl_ai_conversation.findUnique({
      where: { conversation_id: conversationId },
      select: { conversation_id: true, owner_id: true, system_prompt: true, is_archived: true },
    });

    if (!convRaw || convRaw.is_archived) {
      res.status(404).json({ message: 'Conversation not found', code: 'NOT_FOUND' });
      return;
    }

    if (convRaw.owner_id !== user.user_id) {
      forbiddenConversation(res);
      return;
    }

    const conv = convRaw;

    if (!process.env.DEEPSEEK_API_KEY) {
      res.status(500).json({
        message: 'DeepSeek is not configured',
        code: 'DEEPSEEK_NOT_CONFIGURED',
      });
      return;
    }

    const recentHistory = await prisma.tbl_ai_message.findMany({
      where: {
        conversation_id: conversationId,
      },
      orderBy: [{ created_at: 'desc' }, { message_id: 'desc' }],
      take: 10,
      select: {
        role: true,
        content: true,
      },
    });

    const analyticsSnapshot = await buildAnalyticsSnapshot(user.user_id, content, context ?? {});
    const behaviorPrompt = buildContextAwareSystemPrompt(context ?? {}, analyticsSnapshot);

    const userMsg = await prisma.tbl_ai_message.create({
      data: {
        conversation_id: conversationId,
        role: 'user' as any,
        user_id: user.user_id,
        content,
        meta: {
          context: context ?? {},
          analytics_snapshot: analyticsSnapshot,
          behavior_prompt: behaviorPrompt,
        },
        message_scope: (analyticsSnapshot?.query_mode === 'multi_org' ? 'global' : 'current_view') as any,
      },
      select: {
        message_id: true,
        conversation_id: true,
        role: true,
        content: true,
        created_at: true,
      },
    });

    await prisma.tbl_ai_conversation.update({
      where: { conversation_id: conversationId },
      data: {
        system_prompt: behaviorPrompt,
        updated_at: new Date(),
      },
    });

    const modelCfg = getDefaultDeepseekModel();

    const contextBlock = clampText(
      JSON.stringify(
        {
          request_context: context ?? {},
          analytics_snapshot: analyticsSnapshot,
        },
        null,
        2,
      ),
      12000,
    );

    const messages = [
      { role: 'system', content: behaviorPrompt || conv.system_prompt || DEFAULT_SYSTEM_PROMPT },
      {
        role: 'system',
        content:
          'Use this analytics snapshot to summarize each organization when relevant. Prioritize explicit numbers and organization names.\n\n' +
          contextBlock,
      },
      ...recentHistory
        .reverse()
        .filter((m) => typeof m.content === 'string' && m.content.trim())
        .map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content },
    ];

    let assistantContent = '';
    try {
      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelCfg.model,
          messages,
          stream: false,
          temperature: modelCfg.temperature,
          max_tokens: modelCfg.max_tokens,
          top_p: modelCfg.top_p,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        console.error('[nova.chat.send] deepseek non-200:', text);
        res.status(500).json({
          message: 'Failed to generate DeepSeek response',
          code: 'DEEPSEEK_REQUEST_FAILED',
        });
        return;
      }

      const json: any = await resp.json();
      const aiText = json?.choices?.[0]?.message?.content;
      if (typeof aiText === 'string' && aiText.trim()) {
        assistantContent = aiText.trim();
      }

      if (!assistantContent) {
        res.status(500).json({
          message: 'DeepSeek returned an empty response',
          code: 'DEEPSEEK_EMPTY_RESPONSE',
        });
        return;
      }
    } catch (aiError) {
      console.error('[nova.chat.send] deepseek call failed:', aiError);
      res.status(500).json({
        message: 'Failed to generate DeepSeek response',
        code: 'DEEPSEEK_REQUEST_FAILED',
      });
      return;
    }

    const assistantMsg = await prisma.tbl_ai_message.create({
      data: {
        conversation_id: conversationId,
        role: 'assistant' as any,
        content: assistantContent,
        model: `deepseek/${modelCfg.model}`,
        meta: {
          analytics_snapshot: analyticsSnapshot,
          query_mode: analyticsSnapshot?.query_mode ?? 'current_view',
        },
        message_scope: (analyticsSnapshot?.query_mode === 'multi_org' ? 'global' : 'current_view') as any,
      },
      select: {
        message_id: true,
        conversation_id: true,
        role: true,
        content: true,
        created_at: true,
      },
    });

    await prisma.tbl_ai_conversation.update({
      where: { conversation_id: conversationId },
      data: { updated_at: new Date() },
    });

    const channel = channelFor(user.email, String(conversationId));
    broadcastToUser(user.email, 'nova:messages-created', {
      channel,
      operation: 'CREATE',
      data: [mapMessage(userMsg), mapMessage(assistantMsg)],
    });

    res.status(200).json({
      conversationId: String(conversationId),
      assistant: {
        message_id: String(assistantMsg.message_id),
        role: assistantMsg.role,
        content: assistantMsg.content,
        created_at: assistantMsg.created_at,
      },
    });
  } catch (error: any) {
    console.error('[nova.chat.send] error:', error);
    res.status(500).json({ message: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }
}
