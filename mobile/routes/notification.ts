import { Router } from 'express';
import * as notificationController from '../../mobile/controllers/notificationController';
import { validateAzureJWTMobile } from '../../middlewares/middleWare';

const router = Router();

router.get('/notifications', validateAzureJWTMobile, notificationController.getNotifications);
router.get('/notifications/mark-read', validateAzureJWTMobile, notificationController.markNotificationsAsRead);
router.post('/notifications/mark-read', validateAzureJWTMobile, notificationController.markNotificationsAsRead);
router.post('/notifications/:id/mark-read', validateAzureJWTMobile, notificationController.markSingleNotificationAsRead);
router.get('/notifications/new-count', validateAzureJWTMobile, notificationController.getNewNotifications);
export default router;
