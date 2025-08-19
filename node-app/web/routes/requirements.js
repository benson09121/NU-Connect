const express = require('express');
const router = express.Router();
const requirementController = require('../../web/controllers/requirementController');
const middleware = require('../../middlewares/middleWare');

// Generic requirements (any type, user must have at least one of the two sets)
router.get(
  '/requirements',
  middleware.validateAzureJWT,
  middleware.hasPermission([
    "MANAGE_REQUIREMENTS",
    "VIEW_APPLICATION",
    "MANAGE_APPLICATIONS",
  ]),
  requirementController.getRequirements
);

// New requirements only
router.get(
  '/requirements/new',
  middleware.validateAzureJWT,
  middleware.hasPermission([
    "APPLY_NEW_ORGANIZATION"
  ]),
  requirementController.getRequirements
);

// Renew requirements only
router.get(
  '/requirements/renew',
  middleware.validateAzureJWT,
  middleware.hasPermission([
    "APPLY_RENEWAL_ORGANIZATION"
  ]),
  requirementController.getRequirements
);

// Other existing routes unchanged...
router.get('/requirement-event-template', middleware.validateAzureJWT, requirementController.getEventRequirementTemplate);
router.get('/requirement-periods-applications', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_REQUIREMENTS"), requirementController.getAllPeriodsWithApplications);
router.get('/requirement-active-period-simple', middleware.validateAzureJWT, middleware.hasPermission(["MANAGE_REQUIREMENTS","VIEW_APPLICATION"]), requirementController.getActiveApplicationPeriodSimple);
router.get('/requirement-active-period', middleware.validateAzureJWT, middleware.hasPermission(["MANAGE_REQUIREMENTS","VIEW_APPLICATION"]), requirementController.getActiveApplicationPeriod);
router.get('/requirements/template', middleware.validateAzureJWT, middleware.hasPermission(["MANAGE_REQUIREMENTS", "APPLY_ORGANIZATION"]), requirementController.downloadTemplate);
router.post('/requirement-period', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_REQUIREMENTS"), requirementController.addApplicationPeriod);
router.post('/requirement-period/terminate', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_REQUIREMENTS"), requirementController.terminateActiveApplicationPeriod);
router.post('/requirements', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_REQUIREMENTS"), requirementController.addRequirement);
router.post('/requirements/add-event', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_REQUIREMENTS"), requirementController.addEventRequirement);
router.put('/requirements', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_REQUIREMENTS"), requirementController.updateRequirement);
router.put('/requirement-period', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_REQUIREMENTS"), requirementController.updateApplicationPeriod);
router.delete('/requirements/', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_REQUIREMENTS"), requirementController.deleteRequirement);

module.exports = router;
