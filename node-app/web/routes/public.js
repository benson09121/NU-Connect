const express = require('express');
const router = express.Router();
const organizationsController = require('../controllers/organizationsController');
const accountController = require('../controllers/accountController');

router.get('/programs', organizationsController.getProgram);

router.get('/roles', accountController.getRoles);

router.post('/user-application', accountController.addUserApplication);

router.get('/pending-users-applications', accountController.getAllPendingUsersAndApplications);

router.get('/accounts', accountController.getAccounts);

module.exports = router;