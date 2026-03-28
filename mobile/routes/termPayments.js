// ===========================
// MOBILE TERM PAYMENT ROUTES
// ===========================

const express = require('express');
const router = express.Router();
const {
    validateAzureJWTMobile,
    requireMobileStudentWriteAccess,
} = require('../../middlewares/middleWare');
const MobileTermPaymentController = require('../controllers/termPaymentController');

// ===================
// ESSENTIAL MOBILE ENDPOINTS
// ===================

/**
 * @route   GET /api/mobile/term-payments/check-payment-status/:organizationId/:organizationVersionId
 * @desc    Check if user needs to pay for current academic term and get payment status with enhanced parameters
 * @query   application_date (ISO string), current_term_id (int), include_history (bool), future_terms_count (int)
 * @access  Private
 */
router.get('/term-payments/check-payment-status/:organizationId/:organizationVersionId?', 
    (req, res, next) => {
        console.log('DEBUG ROUTE: Enhanced check-payment-status route HIT!');
        console.log('DEBUG ROUTE: Request params:', req.params);
        console.log('DEBUG ROUTE: Request query:', req.query);
        console.log('DEBUG ROUTE: Request headers:', req.headers);
        console.log('DEBUG ROUTE: Request URL:', req.url);
        console.log('DEBUG ROUTE: Request method:', req.method);
        next();
    },
    validateAzureJWTMobile, 
    MobileTermPaymentController.checkPaymentStatus
);

/**
 * @route   POST /api/mobile/term-payments/create-payment
 * @desc    Create term payment when user submits payment proof (with file upload)
 * @access  Private
 */
router.post('/term-payments/create-payment', 
    validateAzureJWTMobile,
    requireMobileStudentWriteAccess,
    MobileTermPaymentController.createTermPayment
);

module.exports = router;