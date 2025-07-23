const express = require('express');
const router = express.Router();
const organizationsController = require('../controllers/organizationsController');
const accountController = require('../controllers/accountController');

// Public endpoint for programs (uses organizationsController.getProgram)
router.get('/programs', organizationsController.getProgram);

// Public endpoint for roles
router.get('/roles', accountController.getRoles);

router.post('/user-application', accountController.addUserApplication);

module.exports = router;