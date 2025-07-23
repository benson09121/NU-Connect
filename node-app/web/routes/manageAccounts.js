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


module.exports = router;

