const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');
const middleware = require('../../middlewares/middleWare');

router.get('/manage/accounts', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_ACCOUNT"), accountController.getAccounts);
router.get('/manage/pending-users-applications', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_ACCOUNT"), accountController.getAllPendingUsersAndApplications);

router.get('/manage/programs', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_ACCOUNT"), accountController.getPrograms);
router.get('/manage/roles', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_ACCOUNT"), accountController.getRoles);

router.post('/manage/accounts', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_ACCOUNT"), accountController.addAccount);
router.put('/manage/accounts', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_ACCOUNT"), accountController.updateAccount);

router.delete('/manage/accounts/:email', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_ACCOUNT"), accountController.deleteAccount);
router.put('/manage/accounts/unarchive/:user_id', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_ACCOUNT"), accountController.unarchiveAccount);

router.post('/manage/user-application/approve', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_ACCOUNT"), accountController.approveUserApplication);
router.post('/manage/user-application/reject', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_ACCOUNT"), accountController.rejectUserApplication);

// Email functions
router.post('/manage/resend-invitation', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_ACCOUNT"), accountController.resendInvitationEmail);
router.post('/manage/send-test-email', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_ACCOUNT"), accountController.sendTestEmail);
router.post('/manage/diagnose-email-delivery', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_ACCOUNT"), accountController.diagnoseEmailDelivery);

// User activation functions
router.get('/manage/user-activation-status/:email', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_ACCOUNT"), accountController.getUserActivationStatus);
router.get('/manage/pending-users', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_ACCOUNT"), accountController.getPendingUsers);
router.post('/manage/activate-user', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_ACCOUNT"), accountController.manuallyActivateUser);

// Public route for user applications (no auth required)
router.post('/apply', accountController.addUserApplication);

module.exports = router;