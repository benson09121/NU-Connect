const express = require('express');
const router = express.Router();
const organizationsController = require('../../web/controllers/organizationsController');
const middleware = require('../../middlewares/middleWare');

router.get('/organizations', middleware.validateAzureJWT, middleware.hasPermission("VIEW_ORGANIZATION"), organizationsController.getOrganizations);
router.get('/organizations-by-status', middleware.validateAzureJWT, middleware.hasPermission("VIEW_ORGANIZATION"), organizationsController.getOrganizationsByStatus);
router.post('/organizations', middleware.validateAzureJWT, organizationsController.createOrganizationApplication);
router.get('/organizations', middleware.validateAzureJWT, organizationsController.getOrganizations);
router.get('/organization-details', middleware.validateAzureJWT, organizationsController.getOrganizationDetails);
router.get('/organization-dashboard', middleware.validateAzureJWT, organizationsController.getOrganizationDashboardStats);
router.get(
    '/organization-event-applications',
    middleware.validateAzureJWT,
    organizationsController.getOrganizationEventApplications
);
router.get(
    '/event-requirement-submissions-by-organization',
    middleware.validateAzureJWT,
    organizationsController.getEventRequirementSubmissionsByOrganization
);

router.get('/getSpecificApplication', middleware.validateAzureJWT, organizationsController.getSpecificApplication);
router.get('/org-applications', middleware.validateAzureJWT, organizationsController.getOrganizationApplications);
router.post('/approve-application', middleware.validateAzureJWT, organizationsController.approveApplication);
router.post('/reject-application', middleware.validateAzureJWT, organizationsController.rejectApplication);
router.get('/getOrganizationRequirement', middleware.validateAzureJWT, organizationsController.getOrganizationRequirement);
router.get('/getOrganizationLogo', middleware.validateAzureJWT, organizationsController.getOrganizationLogo);
router.get('/check-org-name', middleware.validateAzureJWT, organizationsController.checkOrganizationName);
router.post('/check-org-emails', middleware.validateAzureJWT, organizationsController.checkOrganizationEmails);
router.post('/archive-organization', middleware.validateAzureJWT, middleware.hasPermission("ARCHIVE_ORGANIZATION"), organizationsController.archiveOrganization);
router.post('/unarchive-organization', middleware.validateAzureJWT, middleware.hasPermission("ARCHIVE_ORGANIZATION"), organizationsController.unarchiveOrganization);

router.post(
    '/add-executive-member',
    middleware.validateAzureJWT,
    middleware.hasPermission("CREATE_COMMITTEE"),
    organizationsController.createExecutiveMember
);
router.put(
    '/update-executive-member',
    middleware.validateAzureJWT,
    middleware.hasPermission("UPDATE_COMMITTEE"),
    organizationsController.updateExecutiveMember
);
router.post(
    '/archive-executive-member',
    middleware.validateAzureJWT,
    middleware.hasPermission("DELETE_COMMITTEE"),
    organizationsController.archiveExecutiveMember
);

router.get(
    '/organization-committees',
    middleware.validateAzureJWT,
    middleware.hasPermission("VIEW_COMMITTEE"),
    organizationsController.getOrganizationCommittees
);
router.post(
    '/create-committee',
    middleware.validateAzureJWT,
    middleware.hasPermission("CREATE_COMMITTEE"),
    organizationsController.createCommittee
);
router.put(
    '/update-committee',
    middleware.validateAzureJWT,
    middleware.hasPermission("UPDATE_COMMITTEE"),
    organizationsController.updateCommittee
);
router.post(
    '/archive-committee',
    middleware.validateAzureJWT,
    middleware.hasPermission("DELETE_COMMITTEE"),
    organizationsController.archiveCommittee
);

router.get(
    '/all-committee-members',
    middleware.validateAzureJWT,
    middleware.hasPermission("VIEW_COMMITTEE"),
    organizationsController.getAllCommitteeMembers
);
router.post(
    '/add-committee-member',
    middleware.validateAzureJWT,
    middleware.hasPermission("CREATE_COMMITTEE"),
    organizationsController.addCommitteeMember
);
router.put(
    '/update-committee-member',
    middleware.validateAzureJWT,
    middleware.hasPermission("UPDATE_COMMITTEE"),
    organizationsController.updateCommitteeMember
);
router.post(
    '/archive-committee-member',
    middleware.validateAzureJWT,
    middleware.hasPermission("DELETE_COMMITTEE"),
    organizationsController.archiveCommitteeMember
);

router.get(
    '/pending-organization-members',
    middleware.validateAzureJWT,
    middleware.hasPermission("VIEW_ORGANIZATION"),
    organizationsController.getPendingOrganizationMembers
);
router.post(
    '/approve-membership-application',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_APPLICATIONS"),
    organizationsController.approveMembershipApplication
);
router.post(
    '/reject-membership-application',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_APPLICATIONS"),
    organizationsController.rejectMembershipApplication
);

router.post(
    '/add-organization-member',
    middleware.validateAzureJWT,
    middleware.hasPermission("CREATE_COMMITTEE"),
    organizationsController.addOrganizationMember
);
router.put(
    '/edit-organization-member',
    middleware.validateAzureJWT,
    middleware.hasPermission("UPDATE_COMMITTEE"),
    organizationsController.editOrganizationMember
);
router.post(
    '/archive-organization-member',
    middleware.validateAzureJWT,
    middleware.hasPermission("DELETE_COMMITTEE"),
    organizationsController.archiveOrganizationMember
);

module.exports = router