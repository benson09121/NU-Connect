const express = require('express');
const router = express.Router();
const requirementController = require('../../web/controllers/requirementController');
const middleware = require('../../middlewares/middleWare');


function requirementTypePermissionGate(req, res, next) {
  const typeRaw = (req.query.type || '').toString().trim().toLowerCase();
  const perms = req.user?.permissions || [];
  const has = p => perms.includes(p);
  const hasAny = arr => arr.some(has);

  // Define logical permission groups
  const NEW_PERMS   = ['MANAGE_REQUIREMENTS','APPLY_ORGANIZATION','APPLY_NEW_ORGANIZATION'];
  const RENEW_PERMS = ['MANAGE_REQUIREMENTS','VIEW_APPLICATION','MANAGE_APPLICATIONS','APPLY_RENEWAL_ORGANIZATION'];

  if (typeRaw === 'new') {
    if (!hasAny(NEW_PERMS)) {
      return res.status(403).json({ message: 'Forbidden: missing permission for new requirements' });
    }
  } else if (typeRaw === 'renew') {
    if (!hasAny(RENEW_PERMS)) {
      return res.status(403).json({ message: 'Forbidden: missing permission for renewal requirements' });
    }
  } else {
    if (!hasAny([...NEW_PERMS, ...RENEW_PERMS])) {
      return res.status(403).json({ message: 'Forbidden: missing permission to view requirements' });
    }
  }

  next();
}

router.get(
  '/requirements',
  middleware.validateAzureJWT,
  requirementTypePermissionGate,
  requirementController.getRequirements
);

router.get(
  '/requirements/new',
  middleware.validateAzureJWT,
  requirementTypePermissionGate,
  (req,res,next)=>{
    req.query.type = 'new';
    next();
  },
  requirementController.getRequirements
);

router.get(
  '/requirements/renew',
  middleware.validateAzureJWT,
  requirementTypePermissionGate,
  (req,res,next)=>{
    req.query.type = 'renew';
    next();
  },
  requirementController.getRequirements
);

router.get('/requirement-event-template', middleware.validateAzureJWT, requirementController.getEventRequirementTemplate);
router.get('/requirement-periods-applications', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_REQUIREMENTS"), requirementController.getAllPeriodsWithApplications);
router.get('/requirement-active-period-simple', middleware.validateAzureJWT, middleware.hasPermission(["MANAGE_REQUIREMENTS","VIEW_APPLICATION"]), requirementController.getActiveApplicationPeriodSimple);
router.get('/requirement-active-period', middleware.validateAzureJWT, middleware.hasPermission(["MANAGE_REQUIREMENTS", "VIEW_APPLICATION"]), requirementController.getActiveApplicationPeriod);
router.get('/requirements/template', middleware.validateAzureJWT, middleware.hasPermission(["MANAGE_REQUIREMENTS", "APPLY_ORGANIZATION"]), requirementController.downloadTemplate);
router.post('/requirement-period', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_REQUIREMENTS"), requirementController.addApplicationPeriod);
router.post('/requirement-period/terminate', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_REQUIREMENTS"), requirementController.terminateActiveApplicationPeriod);
router.post('/requirements',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_REQUIREMENTS"),
    requirementController.addRequirement
);
router.post('/requirements/add-event', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_REQUIREMENTS"), requirementController.addEventRequirement);
router.put('/requirements',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_REQUIREMENTS"),
    requirementController.updateRequirement
);
router.put('/requirement-period', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_REQUIREMENTS"), requirementController.updateApplicationPeriod);
router.delete('/requirements/', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_REQUIREMENTS"), requirementController.deleteRequirement);

module.exports = router;

