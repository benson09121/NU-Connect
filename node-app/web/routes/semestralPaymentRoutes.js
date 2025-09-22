// ===========================
// SEMESTRAL PAYMENT ROUTES
// ===========================

const express = require('express');
const router = express.Router();
const { 
    SemesterController, 
    SemestralPaymentController, 
    OrganizationSemesterConfigController 
} = require('../controllers/semestralPaymentController');
const OrganizationSemestralExtensions = require('../controllers/organizationSemestralExtensions');

// Middleware for authentication (assuming it exists)
// const { authenticateToken } = require('../middleware/auth');
// router.use(authenticateToken);

// ===========================
// 1. SEMESTER MANAGEMENT ROUTES
// ===========================

// GET /api/web/semestral-payments/semesters/current - Get current active semester
router.get('/semesters/current', SemesterController.getCurrentActiveSemester);

// GET /api/web/semestral-payments/semesters - Get all semesters
router.get('/semesters', SemesterController.getAllSemesters);

// POST /api/web/semestral-payments/semesters - Create new semester
router.post('/semesters', SemesterController.createSemester);

// PUT /api/web/semestral-payments/semesters/activate - Set active semester
router.put('/semesters/activate', SemesterController.setActiveSemester);

// ===========================
// 2. SEMESTRAL PAYMENT ROUTES
// ===========================

// POST /api/web/semestral-payments/create - Create a semestral payment
router.post('/create', SemestralPaymentController.createSemestralPayment);

// POST /api/web/semestral-payments/process - Process a semestral payment transaction
router.post('/process', SemestralPaymentController.processSemestralPaymentTransaction);

// POST /api/web/semestral-payments/generate - Generate semestral payments for organization
router.post('/generate', SemestralPaymentController.generateSemestralPaymentsForOrganization);

// GET /api/web/semestral-payments/user - Get user's semestral payments
router.get('/user', SemestralPaymentController.getUserSemestralPayments);

// GET /api/web/semestral-payments/organization/summary - Get organization payment summary
router.get('/organization/summary', SemestralPaymentController.getOrganizationSemestralPaymentSummary);

// PUT /api/web/semestral-payments/update-member-status - Update member status based on payments
router.put('/update-member-status', SemestralPaymentController.updateMemberStatusBySemestralPayments);

// GET /api/web/semestral-payments/overdue - Get overdue payments
router.get('/overdue', SemestralPaymentController.getOverduePayments);

// ===========================
// 3. ORGANIZATION SEMESTER CONFIGURATION ROUTES
// ===========================

// POST /api/web/semestral-payments/config - Create organization semester configuration
router.post('/config', OrganizationSemesterConfigController.createOrganizationSemesterConfig);

// GET /api/web/semestral-payments/config - Get organization semester configurations
router.get('/config', OrganizationSemesterConfigController.getOrganizationSemesterConfigs);

// PUT /api/web/semestral-payments/config/:config_id - Update organization semester configuration
router.put('/config/:config_id', OrganizationSemesterConfigController.updateOrganizationSemesterConfig);

// DELETE /api/web/semestral-payments/config/:config_id - Delete organization semester configuration
router.delete('/config/:config_id', OrganizationSemesterConfigController.deleteOrganizationSemesterConfig);

// ===========================
// 4. ORGANIZATION SEMESTRAL EXTENSIONS ROUTES
// ===========================

// PUT /api/web/semestral-payments/organization/:organization_id/config - Update organization semestral configuration
router.put('/organization/:organization_id/config', OrganizationSemestralExtensions.updateOrganizationSemestralConfig);

// GET /api/web/semestral-payments/organization/:organization_id/details - Get organization with semestral configuration
router.get('/organization/:organization_id/details', OrganizationSemestralExtensions.getOrganizationWithSemestralConfig);

// POST /api/web/semestral-payments/organization/:organization_id/generate-all - Generate payments for all members
router.post('/organization/:organization_id/generate-all', OrganizationSemestralExtensions.generateAllSemestralPayments);

// GET /api/web/semestral-payments/organization/:organization_id/analytics - Get organization payment analytics
router.get('/organization/:organization_id/analytics', OrganizationSemestralExtensions.getOrganizationPaymentAnalytics);

module.exports = router;