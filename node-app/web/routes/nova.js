const express = require('express');
const router = express.Router();
const middleware = require('../../middlewares/middleWare');
const nova = require('../controllers/novaController');

router.get('/nova/conversations/last', middleware.validateAzureJWT, nova.getLastConversation);
router.post('/nova/conversations', middleware.validateAzureJWT, nova.createConversation);
router.get('/nova/chat/register', middleware.validateAzureJWT, nova.registerChannel);
router.post('/nova/chat/send', middleware.validateAzureJWT, nova.sendMessage);

module.exports = router;