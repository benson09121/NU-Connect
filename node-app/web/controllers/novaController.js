/* eslint-disable no-console */
const { publishToChannel, subscribeToChannel } = require('./sseController');
const db = require('../../config/db');
const organizationsModel = require('../models/organizationsModel');
const eventModel = require('../models/eventModel');

// 🔁 DeepSeek config (replaces OpenRouter)
const {
  selectDeepseekModelForContext,
  getDefaultDeepseekModel,
} = require('../../config/deepseek');

if (!process.env.DEEPSEEK_API_KEY) {
  console.error('Missing DEEPSEEK_API_KEY. Set it in your environment.');
}

// Channel is email-scoped to follow a single user across orgs
const CHANNEL = (email, cid) => `ai:chat:email:${email}:${cid}`;

/** Polished, business tone */
const DEFAULT_SYSTEM_PROMPT =
  'You are NOVA, a professional AI analytics assistant for NU Connect.\n' +
  'Write in clear, polished business English. Use complete sentences. Be concise and actionable.\n' +
  'You specialize ONLY in organizational analytics: events, finances, member engagement, and rankings.\n' +
  'If asked something outside that scope, redirect politely to analytics topics.\n' +
  'Analysis checklist:\n' +
  '• Confirm the data you’re using (pageData first, then any extra DB context)\n' +
  '• Use specific numbers, organization names, and trends\n' +
  '• Summarize findings, then give 2–4 concrete recommendations\n' +
  'Formatting:\n' +
  '• Use short headings where helpful\n' +
  '• Use ₱ for Philippine Peso and round for readability\n';

/** Make sure final text doesn’t end mid-sentence */
function finalizeAssistantText(text) {
  if (!text) return '';
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  if (!/[.!?…]\s*$/.test(text)) text += '.';
  return text;
}

/** Keep your original (long) prompt builder; we’ll send a concise runtime context separately. */
function buildContextAwareSystemPrompt(context) {
  let prompt = DEFAULT_SYSTEM_PROMPT;
  if (!context) return prompt;

  prompt += '\n\n--- CURRENT CONTEXT ---\n';

  if (context.userRole === 'SDAO') {
    prompt +=
      'User is an SDAO (Student Development and Activities Office) administrator with access to ALL organization data.\n';
    prompt +=
      'Provide comprehensive analytics across all approved organizations in the system.\n';
    prompt +=
      'Focus on system-wide trends, comparisons, and overall performance metrics.\n';
    prompt +=
      'When asked about organizations, include data from ALL organizations in the system.\n';
  }

  if (context.currentOrganization === 'all') {
    prompt += 'User is viewing analytics for ALL organizations in the system.\n';
  } else if (context.currentOrganization && context.organizationInfo) {
    prompt += `User is viewing analytics for: ${context.organizationInfo.name}\n`;
    prompt += `Organization Status: ${context.organizationInfo.status}\n`;
    if (context.organizationInfo.category) {
      prompt += `Organization Category: ${context.organizationInfo.category}\n`;
    }
  }

  if (context.userOrganizations && context.userOrganizations.length > 1) {
    prompt += `User has access to ${context.userOrganizations.length} organizations: ${context.userOrganizations
      .map(
        (org) =>
          org.name ||
          org.organization_name ||
          org.organization_id
      )
      .join(', ')}\n`;
  }

  if (context.activeTab) {
    switch (context.activeTab) {
      case 'event':
        prompt +=
          'User is currently on the EVENTS tab - focus on event analytics, attendance, registrations, and event performance.\n';
        break;
      case 'transaction':
        prompt +=
          'User is currently on the FINANCIALS tab - focus on financial analytics, transactions, income, expenses, and budget insights.\n';
        break;
      case 'user':
        prompt +=
          'User is currently on the USER ENGAGEMENT tab - focus on user activity, engagement metrics, and participation analytics.\n';
        break;
      case 'leaderboard':
        prompt +=
          'User is currently on the LEADERBOARD tab - focus on rankings, performance comparisons, and competitive analytics.\n';
        break;
    }
  }

  if (context.userRole) {
    prompt += `User Role: ${context.userRole} - tailor recommendations based on their permission level and responsibilities.\n`;
  }

  if (context.pageData && Object.keys(context.pageData).length > 0) {
    prompt +=
      'IMPORTANT: Detailed analytics data is available in the context messages below. You have access to:\n';
    if (context.pageData.events && context.pageData.events.length > 0) {
      prompt += `- EVENTS: Detailed analytics for ${context.pageData.events.length} organization(s)\n`;
    }
    if (context.pageData.transactions && context.pageData.transactions.length > 0) {
      prompt += `- FINANCIAL: Complete financial analytics for ${context.pageData.transactions.length} organization(s)\n`;
    }
    if (context.pageData.users && context.pageData.users.length > 0) {
      prompt += `- USER ENGAGEMENT: Member engagement data for ${context.pageData.users.length} organization(s)\n`;
    }
    if (context.pageData.totalRevenue)
      prompt += `- Total Revenue: ₱${context.pageData.totalRevenue}\n`;
    if (context.pageData.totalExpenses)
      prompt += `- Total Expenses: ₱${context.pageData.totalExpenses}\n`;
    if (context.pageData.totalEvents)
      prompt += `- Total Events: ${context.pageData.totalEvents}\n`;
    if (context.pageData.totalParticipants)
      prompt += `- Total Participants: ${context.pageData.totalParticipants}\n`;
  }

  if (context.queryType) {
    if (context.queryType === 'multi_org') {
      prompt += '\n--- MULTI-ORGANIZATION RESPONSE MODE ---\n';
      prompt +=
        'Show data from ALL organizations the user has access to, separated by organization.\n';
      prompt += 'Use this format:\n';
      prompt += '## Overall Summary\n[Brief overview across all organizations]\n\n';
      prompt += '## Organization Breakdown\n';
      if (context.userOrganizations) {
        context.userOrganizations.forEach((org) => {
          prompt += `### ${
            org.name ||
            org.organization_name ||
            'Organization ' + org.organization_id
          }\n`;
          prompt += '- [Specific metrics and insights]\n- [Key performance indicators]\n\n';
        });
      }
      prompt +=
        '## Key Insights\n- [Cross-organizational trends]\n- [Notable patterns or concerns]\n- [Recommendations]\n';
    } else {
      prompt += '\n--- CURRENT VIEW RESPONSE MODE ---\n';
      prompt += 'Focus on the specific data the user is currently viewing.\n';
    }
  }

  prompt += '\n--- INSTRUCTIONS ---\n';
  prompt += 'When responding:\n';
  prompt +=
    '1. Reference the specific organization or "all organizations" as appropriate\n';
  prompt +=
    "2. Focus your analysis on the current tab's data and metrics\n";
  prompt += '3. Provide actionable insights based on the visible data\n';
  prompt +=
    "4. Suggest improvements or next steps relevant to the user's role\n";
  prompt +=
    '5. If asked about status, trends, or recommendations, base your response on the current context\n';
  prompt +=
    '6. Be specific about numbers and metrics when available in the context\n';
  prompt +=
    '7. If asked about "organizations" or "my organizations", list the organizations the user has access to\n';
  prompt +=
    '8. IMPORTANT: Use the detailed analytics data provided in context messages, not just summary totals\n';
  prompt +=
    '9. When asked about events, refer to the specific event performance data, attendance trends, and feedback rates\n';

  return prompt;
}

function detectMultiOrgIntent(message, context) {
  if (context.userRole === 'SDAO') {
    const specificViewKeywords = [
      'this event',
      'this transaction',
      'current page',
      "what I'm looking at",
      'this organization',
      'current view',
      'this data',
      'this tab',
      'current org',
      "what's shown here",
      'selected organization',
    ];
    const broadKeywords = [
      'overall',
      'summary',
      'all organizations',
      'system-wide',
      'across',
      'total',
      'combined',
      'everything',
      'complete picture',
      'full view',
    ];
    const m = message.toLowerCase();
    if (specificViewKeywords.some((k) => m.includes(k))) return false;
    return broadKeywords.some((k) => m.includes(k));
  }
  const multiOrgKeywords = [
    'overall',
    'total',
    'across',
    'all organizations',
    'combined',
    'our status',
    'our performance',
    'financial situation',
    'how are we',
    'current status',
    'organization comparison',
    'summary',
    'all orgs',
    'everything',
    'complete picture',
    'full view',
    'aggregate',
  ];
  const organizationListKeywords = [
    'my organizations',
    'see my organizations',
    'organizations',
    'what organizations',
    'which organizations',
    'list organizations',
    'show organizations',
    'organizations I have',
    'organizations I can access',
    'available organizations',
  ];
  const currentViewKeywords = [
    'this event',
    'this transaction',
    'current page',
    "what I'm looking at",
    'this organization',
    'current view',
    'this data',
    'this tab',
    'current org',
    "what's shown here",
  ];
  const m = message.toLowerCase();
  if (currentViewKeywords.some((k) => m.includes(k))) return false;
  if (organizationListKeywords.some((k) => m.includes(k))) return true;
  if (multiOrgKeywords.some((k) => m.includes(k))) return true;
  if (context.instructions?.dataScope?.includes('all organizations')) return true;
  const userOrgCount =
    context.userOrganizations?.length || context.dataScope?.organizationCount || 0;
  return userOrgCount > 1;
}

/** ---------- Data fetching helpers (unchanged) ---------- **/
async function getAllOrganizationsData(activeTab, userRole) {
  if (userRole !== 'SDAO') return {};
  if (activeTab === 'finance') activeTab = 'transaction';
  try {
    const [allOrgs] = await db.query(`
      SELECT organization_id, name 
      FROM tbl_organization 
      WHERE status = 'Approved' 
      ORDER BY name
    `);
    const orgIds = allOrgs.map((org) => org.organization_id);
    switch (activeTab) {
      case 'event':
        return await getActivitiesForOrganizations(orgIds, userRole);
      case 'transaction':
        return await getFinanceForOrganizations(orgIds, userRole);
      case 'user':
        return await getMemberEngagementForOrganizations(orgIds, userRole);
      case 'leaderboard':
        return await getLeaderboardForOrganizations(orgIds, userRole);
      default:
        return await getAllDataForOrganizations(orgIds, userRole);
    }
  } catch (error) {
    console.error('Error fetching all organizations data for SDAO:', error);
    return {};
  }
}

async function getMultiOrgData(userOrganizations, activeTab, userRole) {
  if (!userOrganizations || userOrganizations.length === 0) return {};
  if (activeTab === 'finance') activeTab = 'transaction';
  const orgIds = userOrganizations.map((org) => org.organization_id || org.id);
  switch (activeTab) {
    case 'event':
      return await getActivitiesForOrganizations(orgIds, userRole);
    case 'transaction':
      return await getFinanceForOrganizations(orgIds, userRole);
    case 'user':
      return await getMemberEngagementForOrganizations(orgIds, userRole);
    case 'leaderboard':
      return await getLeaderboardForOrganizations(orgIds, userRole);
    default:
      return await getAllDataForOrganizations(orgIds, userRole);
  }
}

async function getActivitiesForOrganizations(orgIds) {
  const data = {};
  try {
    for (const orgId of orgIds) {
      const [events] = await db.query(
        `
        SELECT e.*, o.name as organization_name,
               COUNT(ea.user_id) as registration_count
        FROM tbl_event e
        LEFT JOIN tbl_organization o ON e.organization_id = o.organization_id
        LEFT JOIN tbl_event_attendance ea ON e.event_id = ea.event_id
        WHERE e.organization_id = ?
        GROUP BY e.event_id
        ORDER BY e.start_date DESC
        LIMIT 50
      `,
        [orgId]
      );
      const totalRegistrations = events.reduce(
        (s, e) => s + (parseInt(e.registration_count) || 0),
        0
      );
      const upcomingEvents = events.filter(
        (e) => new Date(e.start_date) > new Date()
      ).length;
      data[orgId] = {
        organizationName: events[0]?.organization_name || `Organization ${orgId}`,
        events,
        summary: {
          totalEvents: events.length,
          totalRegistrations,
          upcomingEvents,
          completedEvents: events.length - upcomingEvents,
        },
      };
    }
  } catch (error) {
    console.error('Error fetching activities for organizations:', error);
  }
  return data;
}

async function getFinanceForOrganizations(orgIds) {
  const data = {};
  try {
    for (const orgId of orgIds) {
      const [transactions] = await db.query(
        `
        SELECT t.*, o.name as organization_name, tt.label as transaction_type_label
        FROM tbl_transaction t
        LEFT JOIN tbl_transaction_membership tm ON t.transaction_id = tm.transaction_id
        LEFT JOIN tbl_transaction_event te ON t.transaction_id = te.transaction_id
        LEFT JOIN tbl_organization o ON tm.organization_id = o.organization_id OR te.event_id IN (
          SELECT event_id FROM tbl_event WHERE organization_id = o.organization_id
        )
        LEFT JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
        WHERE (tm.organization_id = ? OR te.event_id IN (
          SELECT event_id FROM tbl_event WHERE organization_id = ?
        ))
        ORDER BY t.transaction_date DESC
        LIMIT 100
      `,
        [orgId, orgId]
      );

      const revenue = transactions
        .filter((t) => t.transaction_type_label === 'Income')
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
      const expenses = transactions
        .filter((t) => t.transaction_type_label === 'Expense')
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

      data[orgId] = {
        organizationName:
          transactions[0]?.organization_name || `Organization ${orgId}`,
        transactions,
        summary: {
          totalRevenue: revenue,
          totalExpenses: expenses,
          netProfit: revenue - expenses,
          transactionCount: transactions.length,
        },
      };
    }
  } catch (error) {
    console.error('Error fetching finance for organizations:', error);
  }
  return data;
}

async function getMemberEngagementForOrganizations(orgIds) {
  const data = {};
  try {
    for (const orgId of orgIds) {
      const [members] = await db.query(
        `
        SELECT om.*, u.f_name, u.l_name, u.email, o.name as organization_name
        FROM tbl_organization_members om
        LEFT JOIN tbl_user u ON om.user_id = u.user_id
        LEFT JOIN tbl_organization o ON om.organization_id = o.organization_id
        WHERE om.organization_id = ?
        ORDER BY om.created_at DESC
      `,
        [orgId]
      );
      const [eventParticipation] = await db.query(
        `
        SELECT COUNT(DISTINCT ea.user_id) as active_participants
        FROM tbl_event_attendance ea
        JOIN tbl_event e ON ea.event_id = e.event_id
        WHERE e.organization_id = ? AND ea.status IN ('Registered', 'Attended')
      `,
        [orgId]
      );
      data[orgId] = {
        organizationName: members[0]?.organization_name || `Organization ${orgId}`,
        members,
        summary: {
          totalMembers: members.length,
          activeParticipants: eventParticipation[0]?.active_participants || 0,
          executives: members.filter((m) => m.member_type === 'Executive').length,
          committees: members.filter((m) => m.member_type === 'Committee').length,
          regularMembers: members.filter((m) => m.member_type === 'Member').length,
        },
      };
    }
  } catch (error) {
    console.error('Error fetching member engagement for organizations:', error);
  }
  return data;
}

async function getLeaderboardForOrganizations(orgIds) {
  const data = {};
  try {
    const [orgRankings] = await db.query(
      `
      SELECT o.organization_id, o.name, 
             COUNT(DISTINCT e.event_id) as total_events,
             COUNT(DISTINCT ea.user_id) as total_participants,
             COALESCE(SUM(t.amount), 0) as total_revenue
      FROM tbl_organization o
      LEFT JOIN tbl_event e ON o.organization_id = e.organization_id
      LEFT JOIN tbl_event_attendance ea ON e.event_id = ea.event_id
      LEFT JOIN tbl_transaction_membership tm ON o.organization_id = tm.organization_id
      LEFT JOIN tbl_transaction t ON tm.transaction_id = t.transaction_id
      WHERE o.organization_id IN (${orgIds.map(() => '?').join(',')})
      GROUP BY o.organization_id, o.name
      ORDER BY total_participants DESC, total_events DESC
    `,
      orgIds
    );

    for (let i = 0; i < orgRankings.length; i++) {
      const org = orgRankings[i];
      data[org.organization_id] = {
        organizationName: org.name,
        ranking: i + 1,
        totalRanked: orgRankings.length,
        metrics: {
          totalEvents: org.total_events,
          totalParticipants: org.total_participants,
          totalRevenue: parseFloat(org.total_revenue || 0),
        },
      };
    }
  } catch (error) {
    console.error('Error fetching leaderboard for organizations:', error);
  }
  return data;
}

async function getAllDataForOrganizations(orgIds, userRole) {
  const [activities, finance, engagement, leaderboard] = await Promise.all([
    getActivitiesForOrganizations(orgIds, userRole),
    getFinanceForOrganizations(orgIds, userRole),
    getMemberEngagementForOrganizations(orgIds, userRole),
    getLeaderboardForOrganizations(orgIds, userRole),
  ]);
  return { activities, finance, engagement, leaderboard };
}

function validateContext(context) {
  if (!context) return { valid: true };
  const errors = [];
  if (
    context.currentOrganization !== undefined &&
    context.currentOrganization !== 'all' &&
    typeof context.currentOrganization !== 'string' &&
    typeof context.currentOrganization !== 'number'
  ) {
    errors.push('currentOrganization must be "all", a string, or a number');
  }
  const validTabs = ['event', 'transaction', 'user', 'leaderboard'];
  if (context.activeTab && !validTabs.includes(context.activeTab)) {
    errors.push(`activeTab must be one of: ${validTabs.join(', ')}`);
  }
  if (context.userRole && typeof context.userRole !== 'string') {
    errors.push('userRole must be a string');
  }
  if (context.organizationInfo && typeof context.organizationInfo !== 'object') {
    errors.push('organizationInfo must be an object');
  }
  if (context.pageData && typeof context.pageData !== 'object') {
    errors.push('pageData must be an object');
  }
  return { valid: errors.length === 0, errors };
}

const mapMessage = (row) => ({
  id: row.message_id,
  conversation_id: row.conversation_id,
  role: row.role,
  content: row.content || '',
  created_at: row.created_at,
});

function normalizeEntityId(raw) {
  if (raw === '' || raw === 'null' || raw === 'undefined' || raw === undefined)
    return null;
  const n = Number(raw);
  return Number.isNaN(n) ? raw : n;
}

async function getUserId(email, res) {
  console.log('getUserId called with email:', email);
  const user = await eventModel.getUserByEmail(email);
  console.log('eventModel.getUserByEmail returned:', user);

  if (!user) {
    console.error('No user found for email:', email);
    if (res) return res.status(404).json({ message: 'User not found for the provided email.' });
    throw new Error('User not found for the provided email.');
  }
  if (!user.user_id) {
    console.error('User found but no user_id field:', user);
    if (res) return res.status(404).json({ message: 'User found but missing user_id field.' });
    throw new Error('User found but missing user_id field.');
  }
  console.log('Returning user_id:', user.user_id);
  return user.user_id;
}

async function getUserOrganizations(userId) {
  try {
    const [organizations] = await db.query(
      `
      SELECT DISTINCT o.organization_id, o.name, o.status, ov.category
      FROM tbl_organization o
      JOIN tbl_organization_version ov ON ov.org_version_id = o.current_org_version_id
      WHERE o.organization_id IN (
        SELECT organization_id FROM tbl_organization WHERE adviser_id = ?
        UNION
        SELECT organization_id FROM tbl_organization_members WHERE user_id = ?
      )
      AND o.status = 'Approved'
      ORDER BY o.name
    `,
      [userId, userId]
    );
    return organizations;
  } catch (error) {
    console.error('Error fetching user organizations:', error);
    return [];
  }
}

/** Short, essential context message sent alongside the system prompt */
function buildConciseContextMessage(enhancedContext, isMultiOrgQuery) {
  const pd = enhancedContext?.pageData || {};
  const counts = {
    events: Array.isArray(pd.events) ? pd.events.length : 0,
    transactions: Array.isArray(pd.transactions) ? pd.transactions.length : 0,
    users: Array.isArray(pd.users) ? pd.users.length : 0,
    leaderboards: Array.isArray(pd.leaderboards) ? pd.leaderboards.length : 0,
  };
  const totalBits = [];
  if (typeof pd.totalRevenue === 'number')
    totalBits.push(`Total Revenue: ₱${Math.round(pd.totalRevenue)}`);
  if (typeof pd.totalExpenses === 'number')
    totalBits.push(`Total Expenses: ₱${Math.round(pd.totalExpenses)}`);
  if (typeof pd.totalEvents === 'number') totalBits.push(`Total Events: ${pd.totalEvents}`);
  if (typeof pd.totalParticipants === 'number')
    totalBits.push(`Total Participants: ${pd.totalParticipants}`);

  const orgNames = enhancedContext?.userOrganizations
    ?.slice(0, 5)
    .map((o) => o.name || o.organization_name || `Org ${o.organization_id || ''}`)
    .filter(Boolean);

  const lines = [];
  lines.push('Analytics data context:');
  if (orgNames?.length)
    lines.push(
      `- Organizations (sample): ${orgNames.join(', ')}${
        enhancedContext.userOrganizations.length > 5 ? '…' : ''
      }`
    );
  if (enhancedContext?.currentOrganization && enhancedContext?.organizationInfo?.name) {
    lines.push(`- Current Organization: ${enhancedContext.organizationInfo.name}`);
  } else if (enhancedContext?.currentOrganization === 'all') {
    lines.push('- Current Organization: All organizations');
  }
  if (enhancedContext?.activeTab) {
    const tabLabel =
      { event: 'Events', transaction: 'Financials', user: 'User Engagement', leaderboard: 'Leaderboard' }[
        enhancedContext.activeTab
      ] || enhancedContext.activeTab;
    lines.push(`- Active Tab: ${tabLabel}`);
  }
  lines.push(
    `- Data Snapshot: events[${counts.events}], transactions[${counts.transactions}], users[${counts.users}], leaderboards[${counts.leaderboards}]`
  );
  if (totalBits.length) lines.push(`- Summary Totals: ${totalBits.join(' | ')}`);
  if (pd._dbMultiOrg) lines.push(`- Extra DB Context: available for cross-org comparison`);
  lines.push('');
  lines.push('Guidelines:');
  lines.push('1) Use pageData first (current view).');
  lines.push(`2) ${isMultiOrgQuery ? 'Compare across orgs briefly' : 'Focus on the current org/tab'}.`);
  lines.push('3) Cite specific numbers & trends; keep it concise.');
  lines.push('4) End with 2–4 actionable recommendations.');
  return lines.join('\n');
}

/** Extract text from many streaming formats safely (OpenAI-compatible) */
function extractDeltaText(json) {
  const choice = json?.choices?.[0];
  if (!choice) return '';

  // OpenAI-like
  if (typeof choice?.delta === 'string') return choice.delta;
  if (typeof choice?.delta?.content === 'string') return choice.delta.content;

  // Some providers send array content pieces
  if (Array.isArray(choice?.delta?.content)) {
    return choice.delta.content
      .map((p) => (typeof p === 'string' ? p : p?.text ?? ''))
      .join('');
  }

  // Text-only models
  if (typeof choice?.text === 'string') return choice.text;

  // Some send full message chunks
  if (typeof choice?.message?.content === 'string') return choice.message.content;

  // As a last resort, try a generic content field
  if (typeof json?.content === 'string') return json.content;

  return '';
}

async function getLastConversation(req, res) {
  try {
    const email = req.user.email;
    const userId = await getUserId(email, res);
    let { entityType = 'general' } = req.query;

    const entityId = 0;

    const [rows] = await db.query(
      `SELECT c.conversation_id, 
              (SELECT COUNT(*) FROM tbl_ai_message m 
               WHERE m.conversation_id = c.conversation_id 
               AND (m.content LIKE '%nums =%' OR m.content LIKE '%两数之和%' OR m.content LIKE '%def run_formula%')
              ) as has_corrupted_content
         FROM tbl_ai_conversation c
        WHERE c.owner_id = ?
          AND c.is_archived = 0
          AND c.entity_type = ?
          AND c.entity_id = ?
        ORDER BY c.updated_at DESC
        LIMIT 1`,
      [userId, entityType, entityId]
    );

    if (rows.length) {
      if (rows[0].has_corrupted_content > 0) {
        await db.query(`UPDATE tbl_ai_conversation SET is_archived = 1 WHERE conversation_id = ?`, [
          rows[0].conversation_id,
        ]);
        return res.status(404).json({});
      }
      return res.json({ conversationId: rows[0].conversation_id });
    }
    return res.status(404).json({});
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to fetch last conversation' });
  }
}

async function createConversation(req, res) {
  try {
    const email = req.user.email;
    let userId;
    try {
      userId = await getUserId(email);
    } catch (error) {
      return res.status(404).json({ message: 'User not found for the provided email.' });
    }

    let { entityType = 'general', systemPrompt = null, context = null } = req.body;
    const entityId = 0;
    const contextPrompt = context ? buildContextAwareSystemPrompt(context) : DEFAULT_SYSTEM_PROMPT;

    const [r] = await db.query(
      `INSERT INTO tbl_ai_conversation (owner_id, entity_type, entity_id, system_prompt)
       VALUES (?, ?, ?, ?)`,
      [userId, entityType, entityId, contextPrompt]
    );
    return res.json({ conversationId: r.insertId });
  } catch (e) {
    console.error('Create conversation error:', e);
    return res.status(500).json({ error: 'Failed to create conversation' });
  }
}

async function registerChannel(req, res) {
  try {
    const { conversationId, sessionId } = req.query;
    if (!conversationId || !sessionId) {
      return res.status(400).json({ error: 'conversationId and sessionId are required' });
    }

    const email = req.user.email;
    const userId = await getUserId(email);
    const [convRows] = await db.query(
      `SELECT owner_id FROM tbl_ai_conversation WHERE conversation_id = ? AND is_archived = 0`,
      [conversationId]
    );
    if (!convRows.length || convRows[0].owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    subscribeToChannel(sessionId, CHANNEL(email, conversationId));

    const [rows] = await db.query(
      `SELECT message_id, conversation_id, role, content, created_at
         FROM tbl_ai_message
        WHERE conversation_id = ?
          AND content NOT LIKE '%nums =%'
          AND content NOT LIKE '%两数之和%'
          AND content NOT LIKE '%def run_formula%'
        ORDER BY created_at ASC, message_id ASC`,
      [conversationId]
    );
    return res.json(rows.map(mapMessage));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to register channel' });
  }
}

async function sendMessage(req, res) {
  try {
    const email = req.user.email;
    const userId = await getUserId(email, res);
    const { conversationId, content, context = null } = req.body;
    if (!conversationId || !content?.trim()) {
      return res.status(400).json({ error: 'conversationId and content are required' });
    }

    if (context) {
      const validation = validateContext(context);
      if (!validation.valid) {
        return res.status(400).json({ error: 'Invalid context format', details: validation.errors });
      }
    }

    const [convRows] = await db.query(
      `SELECT owner_id, system_prompt FROM tbl_ai_conversation 
       WHERE conversation_id = ? AND is_archived = 0`,
      [conversationId]
    );
    if (!convRows.length || convRows[0].owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let userOrgs;
    if (context?.userRole === 'SDAO') {
      try {
        const [allOrgs] = await db.query(
          `
          SELECT o.organization_id, o.name, o.status, ov.category
          FROM tbl_organization o
          JOIN tbl_organization_version ov ON ov.org_version_id = o.current_org_version_id
          WHERE o.status = 'Approved' 
          ORDER BY o.name
        `
        );
        userOrgs = allOrgs;
      } catch (error) {
        console.error('Error fetching all organizations for SDAO:', error);
        userOrgs = [];
      }
    } else {
      userOrgs =
        context?.userOrganizations?.length > 0
          ? context.userOrganizations
          : context?.dataScope?.availableOrganizations?.map((org) => ({
              organization_id: org.value,
              name: org.label,
            })) || [];
    }

    const isMultiOrgQuery = context
      ? detectMultiOrgIntent(content, { ...context, userOrganizations: userOrgs })
      : false;

    const pageData = context?.pageData && typeof context.pageData === 'object' ? context.pageData : {};
    let responseData = { ...pageData };

    let dbAugment = {};
    if (context?.userRole === 'SDAO') {
      dbAugment = await getAllOrganizationsData(context.activeTab, context.userRole);
    } else if (isMultiOrgQuery && userOrgs.length > 0) {
      dbAugment = await getMultiOrgData(userOrgs, context.activeTab, context.userRole);
    }
    if (dbAugment && Object.keys(dbAugment).length > 0) {
      responseData = { ...responseData, _dbMultiOrg: dbAugment };
    }

    const enhancedContext = {
      ...context,
      userOrganizations: userOrgs,
      queryType: isMultiOrgQuery ? 'multi_org' : 'current_view',
      responseData,
    };

    const [um] = await db.query(
      `INSERT INTO tbl_ai_message (conversation_id, role, user_id, content, meta)
       VALUES (?, 'user', ?, ?, ?)`,
      [
        conversationId,
        userId,
        content,
        JSON.stringify({
          context: enhancedContext,
          query_type: isMultiOrgQuery ? 'multi_org' : 'current_view',
          organizations: userOrgs?.map((org) => org.organization_id || org.value) || [],
        }),
      ]
    );
    await db.query(`UPDATE tbl_ai_conversation SET updated_at = NOW() WHERE conversation_id = ?`, [
      conversationId,
    ]);

    const userMsg = mapMessage({
      message_id: um.insertId,
      conversation_id: conversationId,
      role: 'user',
      content,
      created_at: new Date(),
    });
    publishToChannel(CHANNEL(email, conversationId), { operation: 'CREATE', data: [userMsg] });

    // Set placeholder assistant row immediately
    const deepseekDefault = getDefaultDeepseekModel();
    const [am] = await db.query(
      `INSERT INTO tbl_ai_message (conversation_id, role, content, model)
       VALUES (?, 'assistant', '', ?)`,
      [conversationId, `deepseek/${deepseekDefault.model}`]
    );

    const assistantBase = {
      message_id: am.insertId,
      conversation_id: conversationId,
      role: 'assistant',
      created_at: new Date(),
    };
    publishToChannel(CHANNEL(email, conversationId), {
      operation: 'CREATE',
      data: [mapMessage({ ...assistantBase, content: '' })],
    });

    const [history] = await db.query(
      `SELECT role, content
         FROM tbl_ai_message
        WHERE conversation_id = ?
          AND content NOT LIKE '%nums =%'
          AND content NOT LIKE '%两数之和%'
          AND content NOT LIKE '%def run_formula%'
        ORDER BY created_at DESC, message_id DESC
        LIMIT 10`,
      [conversationId]
    );
    history.reverse();

    let systemPrompt = convRows[0].system_prompt || DEFAULT_SYSTEM_PROMPT;
    if (enhancedContext) {
      systemPrompt = buildContextAwareSystemPrompt(enhancedContext);
      await db.query(`UPDATE tbl_ai_conversation SET system_prompt = ? WHERE conversation_id = ?`, [
        systemPrompt,
        conversationId,
      ]);
    }

    const messages = [{ role: 'system', content: systemPrompt }];

    // concise context
    const conciseContext = buildConciseContextMessage(enhancedContext, isMultiOrgQuery);
    messages.push({ role: 'system', content: conciseContext });

    if (history.length > 1) {
      messages.push(...history.slice(0, -1).map((r) => ({ role: r.role, content: r.content })));
    }
    messages.push({ role: 'user', content });

    // Pick DeepSeek model config
    const modelConfig = selectDeepseekModelForContext(enhancedContext);
    const requestBody = {
      model: modelConfig.model,
      messages,
      stream: true,
      temperature: modelConfig.temperature ?? 0.2,
      max_tokens: modelConfig.max_tokens ?? 1600,
      top_p: modelConfig.top_p ?? 1,
    };

    // Respond immediately (stream will be pushed over SSE channel)
    res.status(202).json({ ok: true });

    // Call DeepSeek (OpenAI-compatible) with streaming
    const deepseekResp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
        // (no Referer/Title headers required)
      },
      body: JSON.stringify(requestBody),
    });

    if (!deepseekResp.ok || !deepseekResp.body) {
      const errText = await deepseekResp.text().catch(() => '');
      console.error('DeepSeek API error:', errText);
      await db.query(`UPDATE tbl_ai_message SET content = ? WHERE message_id = ?`, [
        'I apologize, but I encountered an error. Please try again.',
        am.insertId,
      ]);
      publishToChannel(CHANNEL(email, conversationId), {
        operation: 'UPDATE',
        data: [
          mapMessage({
            ...assistantBase,
            content: 'I apologize, but I encountered an error. Please try again.',
          }),
        ],
      });
      return;
    }

    /** ----------- ROBUST SSE PARSER (keeps your original fix) ----------- */
    const reader = deepseekResp.body.getReader();
    const decoder = new TextDecoder();
    let assistantText = '';
    let lastPublish = 0;
    let buffer = ''; // carryover for partial frames

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line \n\n
      const events = buffer.split('\n\n');
      buffer = events.pop() || ''; // keep the last (possibly partial) frame

      for (const evt of events) {
        const lines = evt.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // Skip non-data lines (e.g., event:, id:)
          if (!trimmed.startsWith('data:')) continue;

          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') {
            // Finalize and save
            if (
              assistantText.includes('nums =') ||
              assistantText.includes('两数之和') ||
              assistantText.includes('def run_formula')
            ) {
              assistantText =
                'I encountered a formatting error. Please ask your analytics question again.';
            }
            assistantText = finalizeAssistantText(assistantText);

            await db.query(`UPDATE tbl_ai_message SET content = ? WHERE message_id = ?`, [
              assistantText,
              am.insertId,
            ]);
            await db.query(`UPDATE tbl_ai_conversation SET updated_at = NOW() WHERE conversation_id = ?`, [
              conversationId,
            ]);
            publishToChannel(CHANNEL(email, conversationId), {
              operation: 'UPDATE',
              data: [mapMessage({ ...assistantBase, content: assistantText })],
            });
            return;
          }

          // Some providers may send keepalives or empty data
          if (!dataStr || dataStr === '{}') continue;

          try {
            const json = JSON.parse(dataStr);
            const delta = extractDeltaText(json);
            if (typeof delta === 'string' && delta.length) {
              assistantText += delta;
              const now = Date.now();
              if (now - lastPublish > 60) {
                lastPublish = now;
                publishToChannel(CHANNEL(email, conversationId), {
                  operation: 'UPDATE',
                  data: [mapMessage({ ...assistantBase, content: assistantText })],
                });
              }
            }
          } catch {
            // Ignore malformed keepalives/etc.
          }
        }
      }
    }

    // If the stream ended without a [DONE], still push what we got
    assistantText = finalizeAssistantText(assistantText);
    await db.query(`UPDATE tbl_ai_message SET content = ? WHERE message_id = ?`, [
      assistantText,
      am.insertId,
    ]);
    publishToChannel(CHANNEL(email, conversationId), {
      operation: 'UPDATE',
      data: [mapMessage({ ...assistantBase, content: assistantText })],
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to send/stream message' });
  }
}

module.exports = {
  getLastConversation,
  createConversation,
  registerChannel,
  sendMessage,
  getUserOrganizations: async (req, res) => {
    try {
      const email = req.user.email;
      const userId = await getUserId(email, res);
      const organizations = await getUserOrganizations(userId);
      res.json({ organizations });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Failed to fetch user organizations' });
    }
  },
};
