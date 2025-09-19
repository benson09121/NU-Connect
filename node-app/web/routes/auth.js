const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const middleware = require('../../middlewares/middleWare');


router.get('/login', middleware.validateAzureJWT, authController.login);
router.get('/users', middleware.validateAzureJWT, authController.login);
// router.get('/permissions', middleware.validateAzureJWT, authController.getPermissions);
router.post('/register', authController.register);

module.exports = router;
