const express = require('express');
const router = express.Router();
const emailSuggestionController = require('../controllers/emailSuggestionController');
const middleware = require('../../middlewares/middleWare');

router.get('/email-suggestions', 
    middleware.validateAzureJWT, 
    emailSuggestionController.getEmailSuggestions
);

router.get('/email-suggestions-all',
    middleware.validateAzureJWT, 
    emailSuggestionController.getAllUserEmailSuggestions
);

router.post('/refresh-cache/:org_name', 
    middleware.validateAzureJWT, 
    emailSuggestionController.refreshOrganizationCache
);

module.exports = router;