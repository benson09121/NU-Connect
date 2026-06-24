// @ts-nocheck
// ===========================
// MOBILE SEMESTRAL PAYMENT ROUTES
// ===========================

const express = require('express');
const router = express.Router();
const MobileSemestralPaymentController = require('../controllers/semestralPaymentController');

// ===========================
// MOBILE SEMESTRAL PAYMENT ENDPOINTS
// ===========================

// GET /api/mobile/semestral-payments/semester/current - Get current active semester
router.get('/semestral-payments/semester/current', MobileSemestralPaymentController.getCurrentActiveSemester);

// GET /api/mobile/semestral-payments/user - Get user's semestral payments
router.get('/semestral-payments/user', MobileSemestralPaymentController.getUserSemestralPayments);

// GET /api/mobile/semestral-payments/organization/:organization_id/payment-options - Get organization payment options
router.get('/semestral-payments/organization/:organization_id/payment-options', MobileSemestralPaymentController.getOrganizationPaymentOptions);

// POST /api/mobile/semestral-payments/create - Create semestral payment for application
router.post('/semestral-payments/create', MobileSemestralPaymentController.createSemestralPaymentForApplication);

// GET /api/mobile/semestral-payments/payment/:payment_id/status - Get payment status
router.get('/semestral-payments/payment/:payment_id/status', MobileSemestralPaymentController.getPaymentStatus);

// GET /api/mobile/semestral-payments/user/:user_id/overdue - Get user's overdue payments
router.get('/semestral-payments/user/:user_id/overdue', MobileSemestralPaymentController.getUserOverduePayments);

// GET /api/mobile/semestral-payments/user/:user_id/summary - Get user's payment summary
router.get('/semestral-payments/user/:user_id/summary', MobileSemestralPaymentController.getUserPaymentSummary);

module.exports = router;
