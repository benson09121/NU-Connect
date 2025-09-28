const express = require('express');
const router = express.Router();
const organizationsController = require('../controllers/organizationsController');
const accountController = require('../controllers/accountController');
const qrVerificationController = require('../controllers/qrVerificationController');
const publicAuthMiddleware = require('../../middlewares/publicAuthMiddleware');

// Apply public authentication middleware to all routes
router.use(publicAuthMiddleware);

router.get('/programs', organizationsController.getProgram);

router.get('/roles', accountController.getRoles);

router.post('/user-application', accountController.addUserApplication);

router.get('/pending-users-applications', accountController.getAllPendingUsersAndApplications);

router.get('/accounts', accountController.getAccounts);

// QR Verification public route
router.get('/verify/transaction/:tokenId', qrVerificationController.getPublicVerificationData);

module.exports = router;