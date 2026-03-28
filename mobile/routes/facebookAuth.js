const express = require('express');
const router = express.Router();
const {
    getFacebookLoginUrl,
    handleFacebookCallback,
    extendUserToken,
    checkTokenStatus
} = require('../controllers/facebookAuthController');

// Get Facebook login URL
router.get('/auth/login', getFacebookLoginUrl);

// Handle Facebook OAuth callback
router.get('/auth/callback', handleFacebookCallback);

// Extend short-lived token to long-lived token
router.post('/auth/extend-token', extendUserToken);

// Check current token status
router.get('/auth/status', checkTokenStatus);

module.exports = router;