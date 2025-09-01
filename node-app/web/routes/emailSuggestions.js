const express = require('express');
const router = express.Router();
const emailSuggestionsController = require('../controllers/emailSuggestionController'); // ensure filename matches
const middleware = require('../../middlewares/middleWare');

router.get(
  '/email-suggestions',
  middleware.validateAzureJWT,
  emailSuggestionsController.getEmailSuggestions
);

router.get(
  '/email-suggestions-all',
  middleware.validateAzureJWT,
  emailSuggestionsController.getAllUserEmailSuggestions
);

router.post(
  '/refresh-cache/:org_id/:org_version_id',
  middleware.validateAzureJWT,
  emailSuggestionsController.refreshOrganizationCache
);

module.exports = router;