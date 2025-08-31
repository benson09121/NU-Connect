const { publishToChannel, subscribeToChannel } = require('./sseController');
const db = require('../../config/db');
const organizationsModel = require('../models/organizationsModel');

const CHANNEL = (cid) => `ai:chat:${cid}`;

const DEFAULT_SYSTEM_PROMPT = 
  'You are NOVA, an AI assistant for NU Connect. ' +
  'You help users analyze data about events, finances, and user engagement. ' +
  'Always respond in English. Be friendly and concise. ' +
  'Never output code unless specifically asked. ' +
  'If greeted, respond with a simple greeting like "Hello! How can I help you today?"';

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

async function getUserId(req, res) {
  const user = await organizationsModel.getUserByEmail(req.user.email);
  if (!user || !user.user_id) {
    if (res) res.status(404).json({ message: 'User not found.' });
    throw new Error('User not found');
  }
  return user.user_id;
}

async function getLastConversation(req, res) {
  try {
    const userId = await getUserId(req, res);
    let { entityType = 'general', entityId = null } = req.query;
    entityId = normalizeEntityId(entityId);

    // Get last conversation and check if it's corrupted
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
          AND (c.entity_id <=> ?)
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
    const userId = await getUserId(req, res);
    let { entityType = 'general', entityId = null, systemPrompt = null } = req.body;
    entityId = normalizeEntityId(entityId);

    // Always use a clean system prompt
    const cleanPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;

    const [r] = await db.query(
      `INSERT INTO tbl_ai_conversation (owner_id, entity_type, entity_id, system_prompt)
       VALUES (?, ?, ?, ?)`,
      [userId, entityType, entityId, cleanPrompt]
    );
    return res.json({ conversationId: r.insertId });
  } catch (e) {
    console.error(e);
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
    const userId = await getUserId(req);
    const [convRows] = await db.query(
      `SELECT owner_id FROM tbl_ai_conversation WHERE conversation_id = ? AND is_archived = 0`,
      [conversationId]
    );
    if (!convRows.length || convRows[0].owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    subscribeToChannel(sessionId, CHANNEL(conversationId));

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
    const userId = await getUserId(req, res);
    const { conversationId, content } = req.body;
    if (!conversationId || !content?.trim()) {
      return res.status(400).json({ error: 'conversationId and content are required' });
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

    // Save user message
    const [um] = await db.query(
      `INSERT INTO tbl_ai_message (conversation_id, role, user_id, content)
       VALUES (?, 'user', ?, ?)`,
      [conversationId, userId, content]
    );
    await db.query(`UPDATE tbl_ai_conversation SET updated_at = NOW() WHERE conversation_id = ?`, [conversationId]);

    const userMsg = mapMessage({
      message_id: um.insertId,
      conversation_id: conversationId,
      role: 'user',
      content,
      created_at: new Date(),
    });
    publishToChannel(CHANNEL(conversationId), { operation: 'CREATE', data: [userMsg] });

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
    publishToChannel(CHANNEL(conversationId), { operation: 'CREATE', data: [mapMessage({ ...assistantBase, content: '' })] });

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

    // Use system prompt from DB or default
    const systemPrompt = convRows[0].system_prompt || DEFAULT_SYSTEM_PROMPT;

    // Build messages array with strong system prompt
    const messages = [
      { 
        role: 'system', 
        content: systemPrompt
      }
    ];

    // Only add history if it exists and is clean
    if (history.length > 1) { // More than just the current message
      messages.push(...history.slice(0, -1).map(r => ({ role: r.role, content: r.content })));
    }

    // Add current user message
    messages.push({ role: 'user', content: content });

    // Log for debugging
    console.log('Sending to DeepSeek:', JSON.stringify(messages, null, 2));

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
        max_tokens: 800,
        top_p: 0.9,
      }),
    });

    if (!dsResp.ok || !dsResp.body) {
      const errText = await dsResp.text().catch(() => '');
      console.error('DeepSeek API error:', errText);
      await db.query(`UPDATE tbl_ai_message SET content = ? WHERE message_id = ?`, ['I apologize, but I encountered an error. Please try again.', am.insertId]);
      publishToChannel(CHANNEL(conversationId), {
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
          publishToChannel(CHANNEL(conversationId), {
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
              publishToChannel(CHANNEL(conversationId), {
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
};