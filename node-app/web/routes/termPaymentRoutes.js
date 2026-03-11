// ===========================
// TERM PAYMENT ROUTES
// ===========================

const express = require('express');
const router = express.Router();
const TermPaymentController = require('../controllers/termPaymentController');
const SimplifiedTermPaymentController = require('../controllers/simplifiedTermPaymentController');

// Middleware - Authentication required for all routes
const { validateAzureJWT, hasPermission } = require('../../middlewares/middleWare');

// Apply Azure authentication middleware to all routes
router.use(validateAzureJWT);

// ===================
// TERM MANAGEMENT ROUTES
// ===================

/**
 * @route   GET /api/web/term-payments/terms/current
 * @desc    Get current active term
 * @access  Private (All authenticated users)
 */
// /terms/current is now handled by TypeScript termsRoutes.ts
// router.get('/terms/current', TermPaymentController.getCurrentActiveTerm);

/**
 * @route   GET /api/web/term-payments/terms
 * @desc    Get all terms
 * @access  Private (All authenticated users)
 */
// /terms is now handled by TypeScript termsRoutes.ts
// router.get('/terms', TermPaymentController.getAllTerms);

/**
 * @route   POST /api/web/term-payments/terms
 * @desc    Create new term
 * @access  Private (Admin only) - TEMPORARILY DISABLED PERMISSION CHECK
 */
// /terms POST is now handled by TypeScript termsRoutes.ts
// router.post('/terms', TermPaymentController.createTerm);

/**
 * @route   PUT /api/web/term-payments/terms/:termId
 * @desc    Update term
 * @access  Private (Admin only) - TEMPORARILY DISABLED PERMISSION CHECK
 */
// /terms/:termId PUT is now handled by TypeScript termsRoutes.ts
// router.put('/terms/:termId', TermPaymentController.updateTerm);

/**
 * @route   DELETE /api/web/term-payments/terms/:termId
 * @desc    Delete term
 * @access  Private (Admin only) - TEMPORARILY DISABLED PERMISSION CHECK
 */
// /terms/:termId DELETE is now handled by TypeScript termsRoutes.ts
// router.delete('/terms/:termId', TermPaymentController.deleteTerm);

// ===================
// PAYMENT MANAGEMENT ROUTES
// ===================

/**
 * @route   POST /api/web/term-payments/payments
 * @desc    Create term payment
 * @access  Private (Organization admin or system admin)
 */
router.post('/payments', TermPaymentController.createTermPayment);

/**
 * @route   PUT /api/web/term-payments/payments/:paymentId/process
 * @desc    Process payment transaction
 * @access  Private (Organization admin or system admin)
 */
router.put('/payments/:paymentId/process', TermPaymentController.processPaymentTransaction);

/**
 * @route   GET /api/web/term-payments/payments/:paymentId
 * @desc    Get payment by ID
 * @access  Private (Payment owner, organization admin, or system admin)
 */
router.get('/payments/:paymentId', TermPaymentController.getPaymentById);

/**
 * @route   GET /api/web/term-payments/users/:userId/payments
 * @desc    Get payments for user
 * @access  Private (User themselves, organization admin, or system admin)
 */
router.get('/users/:userId/payments', TermPaymentController.getUserPayments);

/**
 * @route   GET /api/term-payments/organizations/:organizationId/payments
 * @desc    Get payments for organization
 * @access  Private (TEMPORARILY NO PERMISSION CHECK FOR TESTING)
 */
router.get('/organizations/:organizationId/payments', TermPaymentController.getOrganizationPayments);

/**
 * @route   PUT /api/term-payments/payments/:paymentId/status
 * @desc    Update payment status manually
 * @access  Private (Organization admin or system admin)
 */
router.put('/payments/:paymentId/status', TermPaymentController.updatePaymentStatus);

/**
 * @route   DELETE /api/term-payments/payments/:paymentId
 * @desc    Delete payment
 * @access  Private (Admin only)
 */
router.delete('/payments/:paymentId', hasPermission("MANAGE_PAYMENTS"), TermPaymentController.deletePayment);

/**
 * @route   GET /api/term-payments/payments/:paymentId/transaction
 * @desc    Get transaction details for a payment
 * @access  Private (Payment owner, organization admin, or system admin)
 */
router.get('/payments/:paymentId/transaction', TermPaymentController.getPaymentTransactionDetails);

/**
 * @route   POST /api/term-payments/payments/direct-with-transaction
 * @desc    Create direct payment with transaction (for SDAO approvals)
 * @access  Private (Organization admin or system admin)
 */
router.post('/payments/direct-with-transaction', hasPermission("MANAGE_ORGANIZATION_PAYMENTS"), TermPaymentController.createDirectPaymentWithTransaction);

// ===================
// ORGANIZATION CONFIGURATION ROUTES
// ===================

/**
 * @route   POST /api/term-payments/organizations/:organizationId/config
 * @desc    Set organization term configuration
 * @access  Private (Organization admin or system admin)
 */
router.post('/organizations/:organizationId/config', hasPermission("MANAGE_ORGANIZATION_PAYMENTS"), TermPaymentController.setOrganizationTermConfig);

/**
 * @route   GET /api/term-payments/organizations/:organizationId/config
 * @desc    Get organization term configuration
 * @access  Private (Organization admin or system admin)
 */
router.get('/organizations/:organizationId/config', hasPermission("MANAGE_ORGANIZATION_PAYMENTS"), TermPaymentController.getOrganizationTermConfig);

/**
 * @route   POST /api/term-payments/organizations/:organizationId/generate-payments
 * @desc    Generate payments for organization
 * @access  Private (Organization admin or system admin)
 */
router.post('/organizations/:organizationId/generate-payments', hasPermission("MANAGE_ORGANIZATION_PAYMENTS"), TermPaymentController.generatePaymentsForOrganization);

// ===================
// ANALYTICS ROUTES
// ===================

/**
 * @route   GET /api/term-payments/organizations/:organizationId/analytics
 * @desc    Get organization payment analytics
 * @access  Private (Organization admin or system admin)
 */
router.get('/organizations/:organizationId/analytics', hasPermission("MANAGE_ORGANIZATION_PAYMENTS"), TermPaymentController.getOrganizationPaymentAnalytics);

/**
 * @route   GET /api/term-payments/system/analytics
 * @desc    Get system payment analytics
 * @access  Private (Admin only)
 */
router.get('/system/analytics', hasPermission("MANAGE_PAYMENTS"), TermPaymentController.getSystemPaymentAnalytics);

/**
 * @route   GET /api/term-payments/trends
 * @desc    Get payment trends
 * @access  Private (Organization admin or system admin)
 */
router.get('/trends', TermPaymentController.getPaymentTrends);

// ===================
// UTILITY ROUTES
// ===================

/**
 * @route   POST /api/term-payments/utils/update-overdue
 * @desc    Update overdue payments
 * @access  Private (Admin only)
 */
router.post('/utils/update-overdue', hasPermission("MANAGE_PAYMENTS"), TermPaymentController.updateOverduePayments);

/**
 * @route   GET /api/term-payments/settings
 * @desc    Get payment settings
 * @access  Private (Admin only)
 */
router.get('/settings', hasPermission("MANAGE_PAYMENTS"), TermPaymentController.getPaymentSettings);

/**
 * @route   PUT /api/term-payments/settings/:settingKey
 * @desc    Update payment setting
 * @access  Private (Admin only)
 */
router.put('/settings/:settingKey', hasPermission("MANAGE_PAYMENTS"), TermPaymentController.updatePaymentSetting);

// ===================
// MOBILE-SPECIFIC ROUTES
// ===================

/**
 * @route   GET /api/term-payments/mobile/my-pending-payments
 * @desc    Get user's pending payments (Mobile)
 * @access  Private (User themselves)
 */
router.get('/mobile/my-pending-payments', TermPaymentController.getUserPendingPayments);

/**
 * @route   GET /api/term-payments/mobile/my-payment-summary
 * @desc    Get user's payment summary (Mobile)
 * @access  Private (User themselves)
 */
router.get('/mobile/my-payment-summary', TermPaymentController.getUserPaymentSummary);

// ===================
// VALIDATION MIDDLEWARE
// ===================

// Additional validation middleware for specific routes
const validatePaymentCreation = (req, res, next) => {
    const { organization_id, cycle_number, user_id, term_id, amount_due, due_date } = req.body;
    
    if (!organization_id || !cycle_number || !user_id || !term_id || !amount_due || !due_date) {
        return res.status(400).json({
            success: false,
            message: 'Missing required fields for payment creation'
        });
    }
    
    // Validate amount_due is positive number
    if (isNaN(amount_due) || parseFloat(amount_due) <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Amount due must be a positive number'
        });
    }
    
    // Validate due_date format
    const dueDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dueDateRegex.test(due_date)) {
        return res.status(400).json({
            success: false,
            message: 'Due date must be in YYYY-MM-DD format'
        });
    }
    
    next();
};

// Apply validation middleware to payment creation route
router.post('/payments', validatePaymentCreation);

// ===================
// ORGANIZATION MANAGEMENT ROUTES
// ===================

/**
 * @route   GET /api/term-payments/submissions/:organizationId
 * @desc    Get term payment submissions for organization (for presidents)
 * @access  Private (Azure authentication required, no permission check)
 */
router.get('/submissions/:organizationId', SimplifiedTermPaymentController.getOrganizationPaymentSubmissions);

/**
 * @route   PUT /api/term-payments/:paymentId/status
 * @desc    Update term payment status (approve/reject)
 * @access  Private (Azure authentication required, no permission check)
 */
router.put('/:paymentId/status', SimplifiedTermPaymentController.updatePaymentStatus);

// ===================
// ERROR HANDLING MIDDLEWARE
// ===================

// Catch all errors for term payment routes
router.use((error, req, res, next) => {
    console.error('Term Payment Route Error:', error);
    
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        return res.status(400).json({
            success: false,
            message: 'Referenced record not found (invalid organization, user, or term ID)'
        });
    }
    
    if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
            success: false,
            message: 'Duplicate entry - payment record already exists'
        });
    }
    
    res.status(500).json({
        success: false,
        message: 'Internal server error in term payment system',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

module.exports = router;
