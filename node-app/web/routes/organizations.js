const express = require('express');
const router = express.Router();
const organizationsController = require('../../web/controllers/organizationsController');
const middleware = require('../../middlewares/middleWare');

router.get(
    '/organizations',
    middleware.validateAzureJWT,
    organizationsController.getOrganizations
);
router.get('/organizations-by-status', middleware.validateAzureJWT, middleware.hasPermission("VIEW_ORGANIZATION"), organizationsController.getOrganizationsByStatus);
router.post('/organizations', middleware.validateAzureJWT, organizationsController.createOrganizationApplication);
router.get('/organizations', middleware.validateAzureJWT, organizationsController.getOrganizations);
router.get('/organization-details', middleware.validateAzureJWT, organizationsController.getOrganizationDetails);
router.get('/organizations_officer', middleware.validateAzureJWT, organizationsController.getOrganizationOfficers);
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
router.get('/checkOrgRenewalStatus', middleware.validateAzureJWT, organizationsController.checkOrgRenewalStatus);
router.get('/getSpecificApplication', middleware.validateAzureJWT, organizationsController.getSpecificApplication);
router.get('/org-applications', middleware.validateAzureJWT, organizationsController.getOrganizationApplications);
router.post('/approve-application', middleware.validateAzureJWT, organizationsController.approveApplication);
router.post('/reject-application', middleware.validateAzureJWT, organizationsController.rejectApplication);
router.get('/getOrganizationRequirement', middleware.validateAzureJWT, organizationsController.getOrganizationRequirement);
router.get('/getOrganizationLogo', middleware.validateAzureJWT, organizationsController.getOrganizationLogo);
router.get('/getOrganizationLogoApplication', middleware.validateAzureJWT, organizationsController.getOrganizationLogoApplication);
router.get('/check-org-name', middleware.validateAzureJWT, organizationsController.checkOrganizationName);
router.post('/check-org-emails', middleware.validateAzureJWT, organizationsController.checkOrganizationEmails);
router.post('/archive-organization', middleware.validateAzureJWT, middleware.hasPermission("ARCHIVE_ORGANIZATION"), organizationsController.archiveOrganization);
router.post('/unarchive-organization', middleware.validateAzureJWT, middleware.hasPermission("ARCHIVE_ORGANIZATION"), organizationsController.unarchiveOrganization);
router.get('/getApplication_Approval_Timeline', middleware.validateAzureJWT, organizationsController.GetApprovalTimeline);

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
    '/organization-members',
    middleware.validateAzureJWT,
    middleware.hasPermission("VIEW_COMMITTEE"),
    organizationsController.getOrganizationMembers
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

router.get('/get-programs', middleware.validateAzureJWT, organizationsController.getProgram);

router.get(
    '/executive-ranks',
    middleware.validateAzureJWT,
    organizationsController.getAllExecutiveRanks
);

// Enhanced application period management routes
router.post(
    '/application-period',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_REQUIREMENTS"),
    organizationsController.addApplicationPeriod
);

router.put(
    '/application-period',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_REQUIREMENTS"),
    organizationsController.updateApplicationPeriod
);

router.post(
    '/initiate-approval',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_APPLICATIONS"),
    organizationsController.initiateApprovalProcess
);

router.get(
    '/organization-logos',
    middleware.validateAzureJWT,
    organizationsController.getApprovedOrganizationLogos
);

router.get(
    '/organization-dashboard-overview',
    middleware.validateAzureJWT,
    organizationsController.getOrganizationDashboardOverview
);

router.get(
    '/all-organizations',
    middleware.validateAzureJWT, // or remove if you want public access
    organizationsController.getAllOrganizations
);

router.get(
    '/all-applications-by-organization',
    middleware.validateAzureJWT,
    organizationsController.getAllApplicationsByOrganization
);

router.get(
    '/organization-committee-roles',
    middleware.validateAzureJWT,
    organizationsController.getOrganizationCommitteeRoles
);

router.get(
    '/organization-executives-roles',
    middleware.validateAzureJWT,
    organizationsController.getOrganizationExecutives
);

router.get(
    '/organization-permissions',
    middleware.validateAzureJWT,
    organizationsController.getOrganizationPermissions
);

router.get(
    '/member-permission-overrides',
    middleware.validateAzureJWT,
    organizationsController.getMemberPermissionOverrides
);

router.get(
  '/getEmailSuggestion-override',
  middleware.validateAzureJWT,
  organizationsController.getEmailSuggestionOverride
);

router.post(
    '/add-override-permission',
    middleware.validateAzureJWT,
    organizationsController.addMemberPermissionOverride
);

router.post(
    '/remove-member-permissions',
    middleware.validateAzureJWT,
    organizationsController.removeMemberPermissionOverride
);

router.put(
    '/update-member-permissions',
    middleware.validateAzureJWT,
    organizationsController.updateMemberPermissionOverride
);

router.put('/update-committee-role-permissions',
    middleware.validateAzureJWT,
    middleware.hasPermission("UPDATE_COMMITTEE"),
    organizationsController.updateCommitteePermissions
);
// Update executive role permissions
router.put(
    '/update-executive-role-permissions',
    middleware.validateAzureJWT,
    middleware.hasPermission("UPDATE_COMMITTEE"),
    organizationsController.updateExecutivePermissions
);


module.exports = router;