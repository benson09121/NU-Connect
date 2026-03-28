import { Router } from 'express';
import { validateAzureJWT } from '../../middlewares/middleWare';
import {
  createConversationHandler,
  getConversationMessagesHandler,
  getLastConversationHandler,
  getUserOrganizationsHandler,
  registerChannelHandler,
  sendMessageHandler,
} from '../controllers/novaController';

const router = Router();

router.get('/nova/user/organizations', validateAzureJWT, getUserOrganizationsHandler);
router.get('/nova/conversations/last', validateAzureJWT, getLastConversationHandler);
router.get('/nova/conversations/:conversationId/messages', validateAzureJWT, getConversationMessagesHandler);
router.post('/nova/conversations', validateAzureJWT, createConversationHandler);
router.get('/nova/chat/register', validateAzureJWT, registerChannelHandler);
router.post('/nova/chat/send', validateAzureJWT, sendMessageHandler);

export default router;
