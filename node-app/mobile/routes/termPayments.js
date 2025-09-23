// ===========================
// MOBILE TERM PAYMENT ROUTES
// ===========================

const express = require('express');
const router = express.Router();
const middleware = require('../../middlewares/middleWare');
const MobileTermPaymentController = require('../controllers/termPaymentController');

// ===================
// ESSENTIAL MOBILE ENDPOINTS
// ===================

/**
 * @route   GET /api/mobile/term-payments/check-payment-status/:organizationId
 * @desc    Check if user needs to pay for current academic term and get payment status
 * @access  Private
 */
router.get('/term-payments/check-payment-status/:organizationId', 
    (req, res, next) => {
        console.log('DEBUG ROUTE: check-payment-status route HIT!');
        console.log('DEBUG ROUTE: Request params:', req.params);
        console.log('DEBUG ROUTE: Request headers:', req.headers);
        console.log('DEBUG ROUTE: Request URL:', req.url);
        console.log('DEBUG ROUTE: Request method:', req.method);
        next();
    },
    middleware.authMiddleware, 
    MobileTermPaymentController.checkPaymentStatus
);

/**
 * @route   POST /api/mobile/term-payments/create-payment
 * @desc    Create term payment when user submits payment proof (with file upload)
 * @access  Private
 */
router.post('/term-payments/create-payment', 
    middleware.authMiddleware, 
    MobileTermPaymentController.createTermPayment
);

module.exports = router;