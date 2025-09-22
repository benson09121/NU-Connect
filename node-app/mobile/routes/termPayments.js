// ===========================
// MOBILE TERM PAYMENT ROUTES
// ===========================

const express = require('express');
const router = express.Router();
const middleware = require('../../middlewares/middleWare');
const TermPaymentController = require('../../web/controllers/termPaymentController');

// ===================
// MOBILE ENDPOINTS
// ===================

/**
 * @route   GET /api/mobile/term-payments/user/:userId/organization/:organizationId
 * @desc    Get user's term payments for a specific organization
 * @access  Private
 */
router.get('/term-payments/user/:userId/organization/:organizationId', 
    middleware.authMiddleware, 
    async (req, res) => {
        try {
            const { userId, organizationId } = req.params;
            
            // Validate that the requesting user can access this data
            if (req.user.user_id !== userId && req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }

            const payments = await TermPaymentController.getUserTermPayments(userId, organizationId);
            
            res.json({
                success: true,
                data: payments
            });
        } catch (error) {
            console.error('Error fetching user term payments:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch term payments',
                error: error.message
            });
        }
    }
);

/**
 * @route   POST /api/mobile/term-payments/upload-proof
 * @desc    Upload payment proof for mobile app
 * @access  Private
 */
router.post('/term-payments/upload-proof', 
    middleware.authMiddleware, 
    async (req, res) => {
        try {
            const { paymentId, notes } = req.body;
            const userId = req.user.user_id;
            
            if (!req.files || !req.files.receipt) {
                return res.status(400).json({
                    success: false,
                    message: 'Payment receipt file is required'
                });
            }

            const receipt = req.files.receipt;
            
            // Validate file type
            const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
            if (!allowedTypes.includes(receipt.mimetype)) {
                return res.status(400).json({
                    success: false,
                    message: 'Only JPEG, PNG, and PDF files are allowed'
                });
            }

            // Validate file size (5MB limit)
            if (receipt.size > 5 * 1024 * 1024) {
                return res.status(400).json({
                    success: false,
                    message: 'File size must be less than 5MB'
                });
            }

            // Generate unique filename
            const timestamp = Date.now();
            const extension = receipt.name.split('.').pop();
            const filename = `payment_receipt_${paymentId}_${timestamp}.${extension}`;
            const uploadPath = `./public/uploads/payment_receipts/${filename}`;

            // Save file
            await receipt.mv(uploadPath);

            // Update payment record
            const result = await TermPaymentController.updatePaymentWithReceipt(
                paymentId, 
                filename, 
                notes, 
                userId
            );

            res.json({
                success: true,
                message: 'Payment receipt uploaded successfully',
                data: {
                    receiptUrl: `/uploads/payment_receipts/${filename}`,
                    status: 'Under Review'
                }
            });
        } catch (error) {
            console.error('Error uploading payment proof:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to upload payment proof',
                error: error.message
            });
        }
    }
);

/**
 * @route   GET /api/mobile/term-payments/current-term
 * @desc    Get current active term information
 * @access  Private
 */
router.get('/term-payments/current-term', 
    middleware.authMiddleware, 
    TermPaymentController.getCurrentActiveTerm
);

/**
 * @route   POST /api/mobile/term-payments/initiate-gateway-payment
 * @desc    Initiate payment gateway transaction
 * @access  Private
 */
router.post('/term-payments/initiate-gateway-payment', 
    middleware.authMiddleware, 
    async (req, res) => {
        try {
            const { paymentId, paymentMethod } = req.body;
            const userId = req.user.user_id;
            
            // Validate payment belongs to user
            const payment = await TermPaymentController.getPaymentById(paymentId);
            if (payment.user_id !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }

            // For now, simulate payment gateway integration
            // In production, integrate with actual payment providers
            const transactionReference = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Update payment status to processing
            await TermPaymentController.updatePaymentStatus(
                paymentId,
                'Processing',
                paymentMethod,
                transactionReference,
                userId
            );

            res.json({
                success: true,
                message: 'Payment initiated successfully',
                data: {
                    transactionReference,
                    status: 'Processing',
                    paymentMethod,
                    // In production, include payment gateway URL
                    paymentUrl: `https://payment-gateway.example.com/pay/${transactionReference}`
                }
            });
        } catch (error) {
            console.error('Error initiating gateway payment:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to initiate payment',
                error: error.message
            });
        }
    }
);

/**
 * @route   GET /api/mobile/term-payments/organization/:organizationId/analytics
 * @desc    Get payment analytics for organization (mobile view)
 * @access  Private
 */
router.get('/term-payments/organization/:organizationId/analytics', 
    middleware.authMiddleware, 
    async (req, res) => {
        try {
            const { organizationId } = req.params;
            const { termId } = req.query;
            
            // Check if user has access to this organization
            // This would typically check membership or admin status
            
            const analytics = await TermPaymentController.getOrganizationAnalytics(
                organizationId, 
                termId
            );
            
            // Format for mobile consumption
            const mobileAnalytics = {
                totalMembers: analytics.total_members,
                paidCount: analytics.paid_count,
                pendingCount: analytics.pending_count,
                overdueCount: analytics.overdue_count,
                paymentRate: analytics.payment_rate,
                totalExpected: analytics.total_expected,
                totalCollected: analytics.total_collected,
                summary: {
                    collected: `₱${analytics.total_collected.toLocaleString()}`,
                    expected: `₱${analytics.total_expected.toLocaleString()}`,
                    rate: `${analytics.payment_rate}%`,
                    outstanding: `₱${(analytics.total_expected - analytics.total_collected).toLocaleString()}`
                }
            };
            
            res.json({
                success: true,
                data: mobileAnalytics
            });
        } catch (error) {
            console.error('Error fetching organization analytics:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch analytics',
                error: error.message
            });
        }
    }
);

module.exports = router;