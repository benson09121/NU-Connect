const express = require('express');
const router = express.Router();
const middleware = require('../../middlewares/middleWare');
const qrController = require('../controllers/qrVerificationController');

// Note: Rate limiting removed due to missing express-rate-limit dependency
// Can be added back later if needed

// ===================
// PROTECTED ROUTES (require authentication)
// ===================

/**
 * @route   POST /api/web/transactions/generate-qr-token
 * @desc    Generate encrypted QR verification token for a transaction
 * @access  Private (requires MANAGE_TRANSACTIONS or VIEW_TRANSACTIONS permission)
 * @body    { transaction_id: number, expires_in_days?: number }
 */
router.post('/transactions/generate-qr-token',
    middleware.validateAzureJWT,
    middleware.hasPermission(['MANAGE_TRANSACTIONS', 'VIEW_TRANSACTIONS']),
    qrController.generateQRToken
);

/**
 * @route   POST /api/web/transactions/revoke-qr-token
 * @desc    Revoke a QR verification token
 * @access  Private (requires MANAGE_TRANSACTIONS permission)
 * @body    { transaction_id: number, reason?: string }
 */
router.post('/transactions/revoke-qr-token',
    middleware.validateAzureJWT,
    middleware.hasPermission(['MANAGE_TRANSACTIONS']),
    qrController.revokeQRToken
);

/**
 * @route   POST /api/web/admin/qr-tokens/cleanup
 * @desc    Clean up expired QR tokens (admin only)
 * @access  Private (requires MANAGE_TRANSACTIONS permission)
 */
router.post('/admin/qr-tokens/cleanup',
    middleware.validateAzureJWT,
    middleware.hasPermission(['MANAGE_TRANSACTIONS']),
    qrController.cleanupExpiredTokens
);

// ===================
// PUBLIC ROUTES (no authentication required)
// ===================

/**
 * @route   POST /api/web/verify/transaction
 * @desc    Verify a transaction QR code token
 * @access  Public (no authentication required)
 * @body    { token: string }
 * @headers X-Forwarded-For, User-Agent (for audit logging)
 */
router.post('/verify/transaction',
    qrController.verifyTransaction
);

/**
 * @route   GET /api/web/verify/transaction/public/:tokenId
 * @desc    Get public verification information for a token
 * @access  Public (no authentication required)
 * @params  tokenId - JWT token ID (jti claim)
 */
router.get('/verify/transaction/public/:tokenId',
    qrController.getPublicVerificationData
);

/**
 * @route   GET /api/web/qr-verification/health
 * @desc    Health check endpoint for QR verification system
 * @access  Public
 */
router.get('/qr-verification/health', qrController.healthCheck);

module.exports = router;