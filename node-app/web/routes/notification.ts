/**
 * web/routes/notification.ts
 *
 * Routes for the Notification system.
 *
 * Mounted at /api/web/notifications in server.ts.
 *
 * All routes require Azure AD JWT authentication.
 */

import { Router } from 'express';
import { validateAzureJWT } from '../../middlewares/middleWare';
import {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  createNotifications,
} from '../controllers/notificationController';

const router = Router();

// =====================================================================
// NOTIFICATION ROUTES
// =====================================================================

/**
 * @route   GET /api/web/notifications
 * @desc    Get current user's notifications (paginated)
 * @query   page, limit, is_read, type
 */
router.get('/', validateAzureJWT, getNotifications);

/**
 * @route   GET /api/web/notifications/unread-count
 * @desc    Get unread notification count (for bell badge)
 */
router.get('/unread-count', validateAzureJWT, getUnreadCount);

/**
 * @route   PUT /api/web/notifications/read-all
 * @desc    Mark all user's notifications as read
 * @note    Must be before /:id/read to avoid route conflict
 */
router.put('/read-all', validateAzureJWT, markAllRead);

/**
 * @route   PUT /api/web/notifications/:id/read
 * @desc    Mark a single notification as read
 * @param   id - notification_recipient_id
 */
router.put('/:id/read', validateAzureJWT, markRead);

/**
 * @route   POST /api/web/notifications
 * @desc    Create notification(s) — server-side / admin use
 * @body    { recipient_ids, sender_id?, sender_name?, title, message, type?, entity_type?, entity_id?, redirect_url? }
 */
router.post('/', validateAzureJWT, createNotifications);

export default router;
