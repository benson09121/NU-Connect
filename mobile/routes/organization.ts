// @ts-nocheck
const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organizationController');
const {
	validateAzureJWTMobile,
	requireMobileStudentWriteAccess,
} = require('../../middlewares/middleWare');


router.get('/organizations', validateAzureJWTMobile, organizationController.getOrganizations);
router.get('/organization-fee', validateAzureJWTMobile, organizationController.getOrganizationFee);
router.get('/profile/organization', validateAzureJWTMobile, organizationController.getUserOrganization);
router.get('/organization/question', validateAzureJWTMobile, organizationController.getOrganizationQuestion);
router.post('/organization-application/submit', validateAzureJWTMobile, requireMobileStudentWriteAccess, organizationController.submitOrganizationApplication);
router.post('/organization/leave', validateAzureJWTMobile, requireMobileStudentWriteAccess, organizationController.leaveOrganization);
router.get('/organization/leave-check', validateAzureJWTMobile, organizationController.checkLeaveStatus);
router.get('/organization/logo', organizationController.getOrganizationLogo);
router.get('/organization/getTransactions', validateAzureJWTMobile, organizationController.getUserTransactions);
module.exports = router;
