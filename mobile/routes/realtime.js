const express = require('express');
const router = express.Router();
const { prisma } = require('../../config/db');
const { validateAzureJWTMobile } = require('../../middlewares/middleWare');

function defaultPagesByRole(roleName) {
  const base = ['notifications', 'events', 'organizations'];
  if (!roleName) return base;
  if (roleName === 'SDAO') return [...base, 'dashboard', 'analytics', 'approvals'];
  if (roleName === 'Program Chair' || roleName === 'Dean' || roleName === 'Adviser' || roleName === 'Faculty') {
    return [...base, 'dashboard'];
  }
  return [...base, 'dashboard'];
}

router.get('/realtime/bootstrap', validateAzureJWTMobile, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    const email = req.user?.email;

    if (!userId || !email) {
      return res.status(401).json({
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    }

    const [user, memberships] = await Promise.all([
      prisma.tbl_user.findUnique({
        where: { user_id: userId },
        select: {
          user_id: true,
          email: true,
          tbl_role: { select: { role_name: true } },
        },
      }),
      prisma.tbl_organization_members.findMany({
        where: { user_id: userId, status: 'Active' },
        select: { organization_id: true },
        distinct: ['organization_id'],
      }),
    ]);

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
        code: 'NOT_FOUND',
      });
    }

    const roleName = user.tbl_role?.role_name || 'Student';
    const organizationIds = memberships.map((m) => m.organization_id);

    return res.status(200).json({
      socket: {
        url: process.env.SOCKET_URL || null,
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        auth_mode: 'bearer_token',
        subscribe_event: 'page:subscribe',
        unsubscribe_event: 'page:unsubscribe',
        heartbeat_event: 'ping',
      },
      user: {
        user_id: user.user_id,
        email: user.email,
        role_name: roleName,
      },
      access: {
        organization_ids: organizationIds,
        default_pages: defaultPagesByRole(roleName),
      },
      notes: {
        page_subscription_payload: { page: 'events', orgId: null },
        org_scoped_payload_example: { page: 'org-detail', orgId: organizationIds[0] || null },
        events_contract: {
          subscribe_pages: ['events', 'notifications', 'org-detail'],
          emits: [
            'events:registration:changed',
            'events:attendees:changed',
            'events:my-tickets:changed',
            'notification:new',
            'notification:unread-count',
            'notification:marked-read',
          ],
        },
      },
    });
  } catch (error) {
    console.error('[mobile.realtime.bootstrap] error:', error);
    return res.status(500).json({
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
});

module.exports = router;
