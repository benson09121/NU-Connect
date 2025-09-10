const { publishToChannel, subscribeToChannel } = require('./sseController');
const db = require('../../config/db');
const organizationsModel = require('../models/organizationsModel');
const eventModel = require('../models/eventModel');

// Update channel function to be email-scoped instead of userId-scoped
const CHANNEL = (email, cid) => `ai:chat:email:${email}:${cid}`;

const DEFAULT_SYSTEM_PROMPT = 
  'You are NOVA, an AI assistant for NU Connect. ' +
  'You help users analyze data about events, finances, and user engagement. ' +
  'Always respond in English. Be friendly and concise. ' +
  'Never output code. ' +
  'If greeted, respond with a simple greeting like "Hello! How can I help you today?"' + 
  'And if asked about code, explain that you cannot assist with that.' +
  'Only accept it if it is in the scope of analytics.' + 
  'If outputing in financial use Philippine Peso (₱).' ;

function buildContextAwareSystemPrompt(context) {
  let prompt = DEFAULT_SYSTEM_PROMPT;
  
  if (!context) return prompt;
  
  prompt += '\n\n--- CURRENT CONTEXT ---\n';
  
  // SDAO-specific context
  if (context.userRole === 'SDAO') {
    prompt += 'User is an SDAO (Student Development and Activities Office) administrator with access to ALL organization data.\n';
    prompt += 'Provide comprehensive analytics across all approved organizations in the system.\n';
    prompt += 'Focus on system-wide trends, comparisons, and overall performance metrics.\n';
    prompt += 'When asked about organizations, include data from ALL organizations in the system.\n';
  }
  
  // Organization context
  if (context.currentOrganization === 'all') {
    prompt += 'User is viewing analytics for ALL organizations in the system.\n';
  } else if (context.currentOrganization && context.organizationInfo) {
    prompt += `User is viewing analytics for: ${context.organizationInfo.name}\n`;
    prompt += `Organization Status: ${context.organizationInfo.status}\n`;
    if (context.organizationInfo.category) {
      prompt += `Organization Category: ${context.organizationInfo.category}\n`;
    }
  }
  
  // Multi-organization context
  if (context.userOrganizations && context.userOrganizations.length > 1) {
    prompt += `User has access to ${context.userOrganizations.length} organizations: ${context.userOrganizations.map(org => org.name || org.organization_name || org.organization_id).join(', ')}\n`;
  }
  
  // Tab/View context
  if (context.activeTab) {
    switch (context.activeTab) {
      case 'event':
        prompt += 'User is currently on the EVENTS tab - focus on event analytics, attendance, registrations, and event performance.\n';
        break;
      case 'transaction':
        prompt += 'User is currently on the FINANCIALS tab - focus on financial analytics, transactions, income, expenses, and budget insights.\n';
        break;
      case 'user':
        prompt += 'User is currently on the USER ENGAGEMENT tab - focus on user activity, engagement metrics, and participation analytics.\n';
        break;
      case 'leaderboard':
        prompt += 'User is currently on the LEADERBOARD tab - focus on rankings, performance comparisons, and competitive analytics.\n';
        break;
    }
  }
  
  // User role context
  if (context.userRole) {
    prompt += `User Role: ${context.userRole} - tailor recommendations based on their permission level and responsibilities.\n`;
  }
  
  // Data context
  if (context.pageData && Object.keys(context.pageData).length > 0) {
    prompt += 'IMPORTANT: Detailed analytics data is available in the context messages below. You have access to:\n';
    
    // Events data
    if (context.pageData.events && context.pageData.events.length > 0) {
      prompt += `- EVENTS: Detailed analytics for ${context.pageData.events.length} organization(s) including attendance rates, event counts, trends, and specific event performance\n`;
    }
    
    // Transaction data
    if (context.pageData.transactions && context.pageData.transactions.length > 0) {
      prompt += `- FINANCIAL: Complete financial analytics for ${context.pageData.transactions.length} organization(s) including income, expenses, funds, and trends\n`;
    }
    
    // User data
    if (context.pageData.users && context.pageData.users.length > 0) {
      prompt += `- USER ENGAGEMENT: Member engagement data for ${context.pageData.users.length} organization(s) including active/inactive members and registration trends\n`;
    }
    
    // Summary metrics
    if (context.pageData.totalRevenue) {
      prompt += `- Total Revenue: ₱${context.pageData.totalRevenue}\n`;
    }
    if (context.pageData.totalExpenses) {
      prompt += `- Total Expenses: ₱${context.pageData.totalExpenses}\n`;
    }
    if (context.pageData.totalEvents) {
      prompt += `- Total Events: ${context.pageData.totalEvents}\n`;
    }
    if (context.pageData.totalParticipants) {
      prompt += `- Total Participants: ${context.pageData.totalParticipants}\n`;
    }
  }
  
  // Query type context
  if (context.queryType) {
    if (context.queryType === 'multi_org') {
      prompt += '\n--- MULTI-ORGANIZATION RESPONSE MODE ---\n';
      prompt += 'Show data from ALL organizations the user has access to, separated by organization.\n';
      prompt += 'Use this format:\n';
      prompt += '## Overall Summary\n[Brief overview across all organizations]\n\n';
      prompt += '## Organization Breakdown\n';
      if (context.userOrganizations) {
        context.userOrganizations.forEach(org => {
          prompt += `### ${org.name || org.organization_name || 'Organization ' + org.organization_id}\n`;
          prompt += '- [Specific metrics and insights]\n- [Key performance indicators]\n\n';
        });
      }
      prompt += '## Key Insights\n- [Cross-organizational trends]\n- [Notable patterns or concerns]\n- [Recommendations]\n';
    } else {
      prompt += '\n--- CURRENT VIEW RESPONSE MODE ---\n';
      prompt += 'Focus on the specific data the user is currently viewing.\n';
    }
  }
  
  prompt += '\n--- INSTRUCTIONS ---\n';
  prompt += 'When responding:\n';
  prompt += '1. Reference the specific organization or "all organizations" as appropriate\n';
  prompt += '2. Focus your analysis on the current tab\'s data and metrics\n';
  prompt += '3. Provide actionable insights based on the visible data\n';
  prompt += '4. Suggest improvements or next steps relevant to the user\'s role\n';
  prompt += '5. If asked about status, trends, or recommendations, base your response on the current context\n';
  prompt += '6. Be specific about numbers and metrics when available in the context\n';
  prompt += '7. If asked about "organizations" or "my organizations", list the organizations the user has access to\n';
  prompt += '8. IMPORTANT: Use the detailed analytics data provided in context messages, not just summary totals\n';
  prompt += '9. When asked about events, refer to the specific event performance data, attendance trends, and feedback rates\n';
  
  return prompt;
}

// Intent detection function - Enhanced for SDAO
function detectMultiOrgIntent(message, context) {
  // SDAO users should always see multi-org data by default unless asking about specific view
  if (context.userRole === 'SDAO') {
    const specificViewKeywords = [
      'this event', 'this transaction', 'current page', 'what I\'m looking at',
      'this organization', 'current view', 'this data', 'this tab',
      'current org', 'what\'s shown here', 'selected organization'
    ];
    
    const messageLower = message.toLowerCase();
    
    // If asking about specific current view, don't use multi-org
    if (specificViewKeywords.some(keyword => messageLower.includes(keyword))) {
      return false;
    }
    
    // Otherwise, SDAO users get multi-org by default
    return true;
  }
  
  const multiOrgKeywords = [
    'overall', 'total', 'across', 'all organizations', 'combined', 
    'our status', 'our performance', 'financial situation', 'how are we',
    'current status', 'organization comparison', 'summary', 'all orgs',
    'everything', 'complete picture', 'full view', 'aggregate'
  ];
  
  const organizationListKeywords = [
    'my organizations', 'see my organizations', 'organizations', 'what organizations',
    'which organizations', 'list organizations', 'show organizations', 'organizations I have',
    'organizations I can access', 'available organizations'
  ];
  
  const currentViewKeywords = [
    'this event', 'this transaction', 'current page', 'what I\'m looking at',
    'this organization', 'current view', 'this data', 'this tab',
    'current org', 'what\'s shown here'
  ];
  
  const messageLower = message.toLowerCase();
  
  // Check for explicit current view intent
  if (currentViewKeywords.some(keyword => messageLower.includes(keyword))) {
    return false;
  }
  
  // Check for organization listing intent (should be treated as multi-org for listing)
  if (organizationListKeywords.some(keyword => messageLower.includes(keyword))) {
    return true;
  }
  
  // Check for multi-org intent
  if (multiOrgKeywords.some(keyword => messageLower.includes(keyword))) {
    return true;
  }
  
  // Check context instructions
  if (context.instructions?.dataScope?.includes('all organizations')) {
    return true;
  }
  
  // Default: if user has multiple organizations, assume multi-org for general questions
  const userOrgCount = context.userOrganizations?.length || context.dataScope?.organizationCount || 0;
  return userOrgCount > 1;
}

// SDAO-specific data fetching function
async function getAllOrganizationsData(activeTab, userRole) {
  if (userRole !== 'SDAO') return {};
  
  try {
    const [allOrgs] = await db.query(`
      SELECT organization_id, name 
      FROM tbl_organization 
      WHERE status = 'Approved' 
      ORDER BY name
    `);
    
    const orgIds = allOrgs.map(org => org.organization_id);
    
    switch(activeTab) {
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

// Multi-organization data fetching functions
async function getMultiOrgData(userOrganizations, activeTab, userRole) {
  if (!userOrganizations || userOrganizations.length === 0) {
    return {};
  }
  
  const orgIds = userOrganizations.map(org => org.organization_id || org.id);
  
  switch(activeTab) {
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

async function getActivitiesForOrganizations(orgIds, userRole) {
  const data = {};
  
  try {
    for (const orgId of orgIds) {
      const [events] = await db.query(`
        SELECT e.*, o.name as organization_name,
               COUNT(ea.user_id) as registration_count
        FROM tbl_event e
        LEFT JOIN tbl_organization o ON e.organization_id = o.organization_id
        LEFT JOIN tbl_event_attendance ea ON e.event_id = ea.event_id
        WHERE e.organization_id = ?
        GROUP BY e.event_id
        ORDER BY e.start_date DESC
        LIMIT 50
      `, [orgId]);
      
      const totalRegistrations = events.reduce((sum, event) => sum + (parseInt(event.registration_count) || 0), 0);
      const upcomingEvents = events.filter(event => new Date(event.start_date) > new Date()).length;
      
      data[orgId] = {
        organizationName: events[0]?.organization_name || `Organization ${orgId}`,
        events: events,
        summary: {
          totalEvents: events.length,
          totalRegistrations: totalRegistrations,
          upcomingEvents: upcomingEvents,
          completedEvents: events.length - upcomingEvents
        }
      };
    }
  } catch (error) {
    console.error('Error fetching activities for organizations:', error);
  }
  
  return data;
}

async function getFinanceForOrganizations(orgIds, userRole) {
  const data = {};
  
  try {
    for (const orgId of orgIds) {
      const [transactions] = await db.query(`
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
      `, [orgId, orgId]);
      
      const revenue = transactions
        .filter(t => t.transaction_type_label === 'Income')
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
      
      const expenses = transactions
        .filter(t => t.transaction_type_label === 'Expense')
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
      
      data[orgId] = {
        organizationName: transactions[0]?.organization_name || `Organization ${orgId}`,
        transactions: transactions,
        summary: {
          totalRevenue: revenue,
          totalExpenses: expenses,
          netProfit: revenue - expenses,
          transactionCount: transactions.length
        }
      };
    }
  } catch (error) {
    console.error('Error fetching finance for organizations:', error);
  }
  
  return data;
}

async function getMemberEngagementForOrganizations(orgIds, userRole) {
  const data = {};
  
  try {
    for (const orgId of orgIds) {
      const [members] = await db.query(`
        SELECT om.*, u.f_name, u.l_name, u.email, o.name as organization_name
        FROM tbl_organization_members om
        LEFT JOIN tbl_user u ON om.user_id = u.user_id
        LEFT JOIN tbl_organization o ON om.organization_id = o.organization_id
        WHERE om.organization_id = ?
        ORDER BY om.created_at DESC
      `, [orgId]);
      
      const [eventParticipation] = await db.query(`
        SELECT COUNT(DISTINCT ea.user_id) as active_participants
        FROM tbl_event_attendance ea
        JOIN tbl_event e ON ea.event_id = e.event_id
        WHERE e.organization_id = ? AND ea.status IN ('Registered', 'Attended')
      `, [orgId]);
      
      data[orgId] = {
        organizationName: members[0]?.organization_name || `Organization ${orgId}`,
        members: members,
        summary: {
          totalMembers: members.length,
          activeParticipants: eventParticipation[0]?.active_participants || 0,
          executives: members.filter(m => m.member_type === 'Executive').length,
          committees: members.filter(m => m.member_type === 'Committee').length,
          regularMembers: members.filter(m => m.member_type === 'Member').length
        }
      };
    }
  } catch (error) {
    console.error('Error fetching member engagement for organizations:', error);
  }
  
  return data;
}

async function getLeaderboardForOrganizations(orgIds, userRole) {
  const data = {};
  
  try {
    // Get organization rankings
    const [orgRankings] = await db.query(`
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
    `, orgIds);
    
    for (let i = 0; i < orgRankings.length; i++) {
      const org = orgRankings[i];
      data[org.organization_id] = {
        organizationName: org.name,
        ranking: i + 1,
        totalRanked: orgRankings.length,
        metrics: {
          totalEvents: org.total_events,
          totalParticipants: org.total_participants,
          totalRevenue: parseFloat(org.total_revenue || 0)
        }
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
    getLeaderboardForOrganizations(orgIds, userRole)
  ]);
  
  return {
    activities,
    finance,
    engagement,
    leaderboard
  };
}

function validateContext(context) {
  if (!context) return { valid: true };
  
  const errors = [];
  
  // Validate currentOrganization
  if (context.currentOrganization !== undefined && 
      context.currentOrganization !== 'all' && 
      typeof context.currentOrganization !== 'string' && 
      typeof context.currentOrganization !== 'number') {
    errors.push('currentOrganization must be "all", a string, or a number');
  }
  
  // Validate activeTab
  const validTabs = ['event', 'transaction', 'user', 'leaderboard'];
  if (context.activeTab && !validTabs.includes(context.activeTab)) {
    errors.push(`activeTab must be one of: ${validTabs.join(', ')}`);
  }
  
  // Validate userRole
  if (context.userRole && typeof context.userRole !== 'string') {
    errors.push('userRole must be a string');
  }
  
  // Validate organizationInfo
  if (context.organizationInfo && typeof context.organizationInfo !== 'object') {
    errors.push('organizationInfo must be an object');
  }
  
  // Validate pageData
  if (context.pageData && typeof context.pageData !== 'object') {
    errors.push('pageData must be an object');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

const mapMessage = (row) => ({
  id: row.message_id,
  conversation_id: row.conversation_id,
  role: row.role,
  content: row.content || '',
  created_at: row.created_at,
});

function normalizeEntityId(raw) {
  if (raw === '' || raw === 'null' || raw === 'undefined' || raw === undefined) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? raw : n;
}

async function getUserId(email, res) {
  console.log('getUserId called with email:', email);
  const user = await eventModel.getUserByEmail(email);
  console.log('eventModel.getUserByEmail returned:', user);
  
  if (!user) {
    console.error('No user found for email:', email);
    if (res) return res.status(404).json({ message: "User not found for the provided email." });
    throw new Error("User not found for the provided email.");
  }
  
  if (!user.user_id) {
    console.error('User found but no user_id field:', user);
    if (res) return res.status(404).json({ message: "User found but missing user_id field." });
    throw new Error("User found but missing user_id field.");
  }
  
  console.log('Returning user_id:', user.user_id);
  return user.user_id;
}

async function getUserOrganizations(userId) {
  try {
    const [organizations] = await db.query(`
      SELECT DISTINCT o.organization_id, o.name, o.status, o.category
      FROM tbl_organization o
      WHERE o.organization_id IN (
        -- Organizations where user is an adviser
        SELECT organization_id FROM tbl_organization WHERE adviser_id = ?
        UNION
        -- Organizations where user is a member (Executive, Committee, or Member)
        SELECT organization_id FROM tbl_organization_members WHERE user_id = ?
      )
      AND o.status = 'Approved'
      ORDER BY o.name
    `, [userId, userId]);
    
    return organizations;
  } catch (error) {
    console.error('Error fetching user organizations:', error);
    return [];
  }
}

async function getLastConversation(req, res) {
  try {
    const email = req.user.email;
    const userId = await getUserId(email, res);
    let { entityType = 'general' } = req.query;
    
    // Always use entityId = 0 - owner_id identifies the user
    const entityId = 0;

    // Get last conversation for this user (user-scoped instead of organization-scoped)
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
      // If conversation has corrupted content, don't return it
      if (rows[0].has_corrupted_content > 0) {
        // Archive the corrupted conversation
        await db.query(
          `UPDATE tbl_ai_conversation SET is_archived = 1 WHERE conversation_id = ?`,
          [rows[0].conversation_id]
        );
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
    console.log('Creating conversation for email:', email);
    
    let userId;
    try {
      userId = await getUserId(email);
      console.log('Retrieved userId:', userId);
    } catch (error) {
      console.error('Error getting userId:', error);
      return res.status(404).json({ message: "User not found for the provided email." });
    }
    
    let { entityType = 'general', systemPrompt = null, context = null } = req.body;
    console.log('Original entityType:', entityType);
    
    // Always set entityId to 0 - owner_id identifies the user
    const entityId = 0;
    console.log('Set entityId to:', entityId);

    // Build context-aware system prompt
    const contextPrompt = context ? buildContextAwareSystemPrompt(context) : DEFAULT_SYSTEM_PROMPT;

    console.log('Inserting with values:', { userId, entityType, entityId });
    
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

    // Verify conversation belongs to user
    const email = req.user.email;
    const userId = await getUserId(email);
    const [convRows] = await db.query(
      `SELECT owner_id FROM tbl_ai_conversation WHERE conversation_id = ? AND is_archived = 0`,
      [conversationId]
    );
    if (!convRows.length || convRows[0].owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Subscribe to email-scoped channel
    subscribeToChannel(sessionId, CHANNEL(email, conversationId));

    // Get messages but filter out corrupted ones
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

    // Validate context if provided
    if (context) {
      const validation = validateContext(context);
      if (!validation.valid) {
        return res.status(400).json({ 
          error: 'Invalid context format', 
          details: validation.errors 
        });
      }
    }

    // Verify conversation ownership and get system prompt
    const [convRows] = await db.query(
      `SELECT owner_id, system_prompt FROM tbl_ai_conversation 
       WHERE conversation_id = ? AND is_archived = 0`,
      [conversationId]
    );
    if (!convRows.length || convRows[0].owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Enhanced user organizations logic for SDAO
    let userOrgs;
    if (context?.userRole === 'SDAO') {
      // SDAO users get ALL organizations
      try {
        const [allOrgs] = await db.query(`
          SELECT organization_id, name, status, category 
          FROM tbl_organization 
          WHERE status = 'Approved' 
          ORDER BY name
        `);
        userOrgs = allOrgs;
      } catch (error) {
        console.error('Error fetching all organizations for SDAO:', error);
        userOrgs = [];
      }
    } else {
      // Regular users get their specific organizations
      userOrgs = context?.userOrganizations?.length > 0 
        ? context.userOrganizations 
        : context?.dataScope?.availableOrganizations?.map(org => ({
            organization_id: org.value,
            name: org.label
          })) || [];
    }
    
    // Detect if this is a multi-organization query
    const isMultiOrgQuery = context ? detectMultiOrgIntent(content, { ...context, userOrganizations: userOrgs }) : false;
    
    // Get relevant data based on query type and user role
    let responseData = {};
    if (context?.userRole === 'SDAO') {
      // SDAO gets all organization data
      responseData = await getAllOrganizationsData(context.activeTab, context.userRole);
    } else if (isMultiOrgQuery && userOrgs.length > 0) {
      // Regular users get their organization data
      responseData = await getMultiOrgData(userOrgs, context.activeTab, context.userRole);
    } else if (context?.pageData) {
      responseData = context.pageData;
    }

    // Update context with query type and response data
    const enhancedContext = {
      ...context,
      userOrganizations: userOrgs, // Use the corrected organizations list
      queryType: isMultiOrgQuery ? 'multi_org' : 'current_view',
      responseData
    };

    // Save user message with context metadata
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
          organizations: userOrgs?.map(org => org.organization_id || org.value) || []
        })
      ]
    );
    await db.query(`UPDATE tbl_ai_conversation SET updated_at = NOW() WHERE conversation_id = ?`, [conversationId]);

    const userMsg = mapMessage({
      message_id: um.insertId,
      conversation_id: conversationId,
      role: 'user',
      content,
      created_at: new Date(),
    });
    publishToChannel(CHANNEL(email, conversationId), { operation: 'CREATE', data: [userMsg] });

    // Assistant placeholder
    const [am] = await db.query(
      `INSERT INTO tbl_ai_message (conversation_id, role, content, model)
       VALUES (?, 'assistant', '', 'deepseek-chat')`,
      [conversationId]
    );

    const assistantBase = {
      message_id: am.insertId,
      conversation_id: conversationId,
      role: 'assistant',
      created_at: new Date(),
    };
    publishToChannel(CHANNEL(email, conversationId), { operation: 'CREATE', data: [mapMessage({ ...assistantBase, content: '' })] });

    // Get clean history (filter out any corrupted messages)
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

    // Reverse to chronological order
    history.reverse();

    // Determine system prompt to use
    let systemPrompt = convRows[0].system_prompt || DEFAULT_SYSTEM_PROMPT;
    
    // If context is provided, update the system prompt for this message
    if (enhancedContext) {
      systemPrompt = buildContextAwareSystemPrompt(enhancedContext);
      
      // Update the conversation's system prompt for future messages
      await db.query(
        `UPDATE tbl_ai_conversation SET system_prompt = ? WHERE conversation_id = ?`,
        [systemPrompt, conversationId]
      );
    }

    // Build messages array with context-aware system prompt
    const messages = [
      { 
        role: 'system', 
        content: systemPrompt
      }
    ];

    // Add enhanced context as a separate system message if provided
    if (enhancedContext) {
      let contextMessage = 'Analytics data context:\n';
      
      // Always include organization information if available
      if (userOrgs && userOrgs.length > 0) {
        contextMessage += `--- USER ORGANIZATIONS ---\n`;
        contextMessage += `User has access to ${userOrgs.length} organization(s):\n`;
        userOrgs.forEach(org => {
          contextMessage += `• ${org.name || org.label || `Organization ${org.organization_id || org.value}`}\n`;
        });
        contextMessage += '\n';
      }
      
      if (Object.keys(responseData).length > 0) {
        if (isMultiOrgQuery || context?.userRole === 'SDAO') {
          contextMessage += '--- MULTI-ORGANIZATION DATA ---\n';
          Object.entries(responseData).forEach(([category, orgData]) => {
            if (typeof orgData === 'object' && !Array.isArray(orgData)) {
              Object.entries(orgData).forEach(([orgId, data]) => {
                contextMessage += `\n${data.organizationName || `Organization ${orgId}`}:\n`;
                if (data.summary) {
                  Object.entries(data.summary).forEach(([key, value]) => {
                    contextMessage += `  • ${key}: ${value}\n`;
                  });
                }
              });
            }
          });
        } else {
          contextMessage += '--- CURRENT VIEW DATA ---\n';
          if (enhancedContext.currentOrganization !== 'all' && enhancedContext.organizationInfo?.name) {
            contextMessage += `Organization: ${enhancedContext.organizationInfo.name}\n`;
          }
          if (enhancedContext.activeTab) {
            const tabNames = {
              event: 'Events Analytics',
              transaction: 'Financial Analytics', 
              user: 'User Engagement',
              leaderboard: 'Leaderboard'
            };
            contextMessage += `Active Tab: ${tabNames[enhancedContext.activeTab] || enhancedContext.activeTab}\n`;
          }
          
          // Include detailed pageData information
          if (enhancedContext.pageData) {
            const pageData = enhancedContext.pageData;
            
            // Events data
            if (pageData.events && pageData.events.length > 0) {
              contextMessage += `\nDETAILED EVENTS ANALYTICS:\n`;
              pageData.events.forEach((event, index) => {
                contextMessage += `\n--- ${event.organization_name || `Organization ${index + 1}`} ---\n`;
                contextMessage += `• Completed Events: ${event.completed_events || 0}\n`;
                contextMessage += `• Cancelled Events: ${event.cancelled_events || 0}\n`;
                contextMessage += `• Average Attendance Rate: ${event.avg_attendance_rate || 0}%\n`;
                contextMessage += `• Attendance Trend: ${event.attendance_rate_change || 0}% change\n`;
                contextMessage += `• Average Feedback Rate: ${event.avg_feedback_rate || 0}%\n`;
                contextMessage += `• Feedback Trend: ${event.feedback_rate_change || 0}% change\n`;
                
                // Include attendance trend data if available
                if (event.attendance_trend && Array.isArray(event.attendance_trend)) {
                  contextMessage += `• Recent Event Attendance:\n`;
                  event.attendance_trend.slice(0, 3).forEach(attend => {
                    contextMessage += `  - ${attend.event}: ${attend.attended} attended, ${attend.notAttended} didn't attend\n`;
                  });
                }
                
                // Include events per month if available
                if (event.events_per_month && Array.isArray(event.events_per_month)) {
                  contextMessage += `• Events by Month: `;
                  const monthlyEvents = event.events_per_month.map(m => `${m.month}: ${m.events}`).join(', ');
                  contextMessage += `${monthlyEvents}\n`;
                }
                
                // Include feedback data if available
                if (event.event_feedback_rate && Array.isArray(event.event_feedback_rate)) {
                  contextMessage += `• Recent Event Feedback:\n`;
                  event.event_feedback_rate.slice(0, 3).forEach(feedback => {
                    contextMessage += `  - ${feedback.event}: ${feedback.feedback}% feedback rate\n`;
                  });
                }
              });
            } else if (pageData.events && pageData.events.length === 0) {
              contextMessage += `\nEVENTS DATA: No events found for current filters\n`;
            }
            
            // Transaction/Financial data
            if (pageData.transactions && pageData.transactions.length > 0) {
              contextMessage += `\nFINANCIAL DATA:\n`;
              pageData.transactions.forEach(transaction => {
                contextMessage += `• ${transaction.organization_name}:\n`;
                contextMessage += `  - Current Funds: ₱${transaction.funds_this_month}\n`;
                contextMessage += `  - Income: ₱${transaction.income_this_month} (${transaction.income_change_status}: ${transaction.income_change_percent}%)\n`;
                contextMessage += `  - Expenses: ₱${transaction.expense_this_month} (${transaction.expense_change_status}: ${transaction.expense_change_percent}%)\n`;
                contextMessage += `  - Net: ₱${transaction.net_this_month} (${transaction.net_change_status}: ${transaction.net_change_percent}%)\n`;
              });
            }
            
            // User engagement data
            if (pageData.users && pageData.users.length > 0) {
              contextMessage += `\nUSER ENGAGEMENT DATA:\n`;
              pageData.users.forEach(user => {
                contextMessage += `• ${user.organization_name}:\n`;
                contextMessage += `  - Total Members: ${user.registered_members}\n`;
                contextMessage += `  - Active This Month: ${user.active_members_this_month}\n`;
                contextMessage += `  - New Members: ${user.new_members_this_month}\n`;
                contextMessage += `  - Activity Rate: ${((user.active_members_this_month / user.registered_members) * 100).toFixed(1)}%\n`;
              });
            }
            
            // Summary totals
            if (pageData.totalRevenue !== undefined || pageData.totalExpenses !== undefined) {
              contextMessage += `\nSUMMARY TOTALS:\n`;
              if (pageData.totalRevenue !== undefined) contextMessage += `• Total Revenue: ₱${pageData.totalRevenue}\n`;
              if (pageData.totalExpenses !== undefined) contextMessage += `• Total Expenses: ₱${pageData.totalExpenses}\n`;
              if (pageData.totalEvents !== undefined) contextMessage += `• Total Events: ${pageData.totalEvents}\n`;
              if (pageData.totalParticipants !== undefined) contextMessage += `• Total Participants: ${pageData.totalParticipants}\n`;
            }
          }
          
          // Fallback to basic responseData if pageData is not available
          Object.entries(responseData).forEach(([key, value]) => {
            if (typeof value === 'number') {
              contextMessage += `${key}: ${value}\n`;
            } else if (Array.isArray(value)) {
              contextMessage += `${key}: ${value.length} items\n`;
            }
          });
        }
      }
      
      messages.push({
        role: 'system',
        content: contextMessage
      });
    }

    // Only add history if it exists and is clean
    if (history.length > 1) { // More than just the current message
      messages.push(...history.slice(0, -1).map(r => ({ role: r.role, content: r.content })));
    }

    // Add current user message
    messages.push({ role: 'user', content: content });

    // Log for debugging
    console.log('Sending to DeepSeek with enhanced context:', JSON.stringify({
      userRole: context?.userRole,
      queryType: isMultiOrgQuery ? 'multi_org' : 'current_view',
      organizationCount: userOrgs?.length || 0,
      hasResponseData: Object.keys(responseData).length > 0
    }, null, 2));

    // Respond early
    res.status(202).json({ ok: true });

    // Stream from DeepSeek
    const dsResp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 1200, // Increased for multi-org responses
        top_p: 0.9,
      }),
    });

    if (!dsResp.ok || !dsResp.body) {
      const errText = await dsResp.text().catch(() => '');
      console.error('DeepSeek API error:', errText);
      await db.query(`UPDATE tbl_ai_message SET content = ? WHERE message_id = ?`, ['I apologize, but I encountered an error. Please try again.', am.insertId]);
      publishToChannel(CHANNEL(email, conversationId), {
        operation: 'UPDATE',
        data: [mapMessage({ ...assistantBase, content: 'I apologize, but I encountered an error. Please try again.' })],
      });
      return;
    }

    const reader = dsResp.body.getReader();
    const decoder = new TextDecoder();
    let assistantText = '';
    let lastPublish = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });

      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          // Final validation - if response contains code/chinese, replace it
          if (assistantText.includes('nums =') || assistantText.includes('两数之和') || assistantText.includes('def run_formula')) {
            assistantText = "I apologize, but I seem to have encountered an error. How can I help you with your analytics questions today?";
          }
          
          await db.query(`UPDATE tbl_ai_message SET content = ? WHERE message_id = ?`, [assistantText, am.insertId]);
          await db.query(`UPDATE tbl_ai_conversation SET updated_at = NOW() WHERE conversation_id = ?`, [conversationId]);
          publishToChannel(CHANNEL(email, conversationId), {
            operation: 'UPDATE',
            data: [mapMessage({ ...assistantBase, content: assistantText })],
          });
          return;
        }
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta) {
            assistantText += delta;
            const now = Date.now();
            if (now - lastPublish > 50) {
              lastPublish = now;
              publishToChannel(CHANNEL(email, conversationId), {
                operation: 'UPDATE',
                data: [mapMessage({ ...assistantBase, content: assistantText })],
              });
            }
          }
        } catch {
          // ignore
        }
      }
    }
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
  }
};