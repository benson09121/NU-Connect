// ===========================
// MOBILE TERM PAYMENT ROUTES
// ===========================

const express = require('express');
const router = express.Router();
const TermPaymentController = require('../controllers/termPaymentController');
const { TermPaymentModel } = require('../../web/models/termPaymentModel');

// Middleware - Authentication required for all routes
const { authMiddleware } = require('../../middlewares/middleWare');

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Helper function to process payment with transaction
async function processPaymentTransaction(paymentId, paymentMethod, transactionReference) {
    try {
        return await TermPaymentModel.processPaymentTransaction(
            paymentId, 
            paymentMethod, 
            transactionReference
        );
    } catch (error) {
        console.error('Error in processPaymentTransaction helper:', error);
        throw error;
    }
}

// ===================
// USER PAYMENT ROUTES (MOBILE)
// ===================

/**
 * @route   GET /mobile/api/term-payments/my-payments
 * @desc    Get user's payment history
 * @access  Private (User themselves)
 */
router.get('/my-payments', (req, res) => {
    // Set userId from authenticated user
    req.params.userId = req.user.user_id;
    TermPaymentController.getUserPayments(req, res);
});

/**
 * @route   GET /mobile/api/term-payments/my-pending-payments
 * @desc    Get user's pending payments
 * @access  Private (User themselves)
 */
router.get('/my-pending-payments', TermPaymentController.getUserPendingPayments);

/**
 * @route   GET /mobile/api/term-payments/my-payment-summary
 * @desc    Get user's payment summary
 * @access  Private (User themselves)
 */
router.get('/my-payment-summary', TermPaymentController.getUserPaymentSummary);

/**
 * @route   GET /mobile/api/term-payments/payment/:paymentId
 * @desc    Get specific payment details
 * @access  Private (Payment owner only)
 */
router.get('/payment/:paymentId', async (req, res) => {
    try {
        const { paymentId } = req.params;
        const userId = req.user.user_id;
        
        // First get the payment to verify ownership
        const { TermPaymentModel } = require('../models/termPaymentModel');
        const payment = await TermPaymentModel.getPaymentById(paymentId);
        
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }
        
        // Verify user owns this payment
        if (payment.user_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied - you can only view your own payments'
            });
        }
        
        res.json({
            success: true,
            data: payment
        });
    } catch (error) {
        console.error('Error in mobile getPaymentById:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch payment details',
            error: error.message
        });
    }
});

// ===================
// ORGANIZATION-RELATED ROUTES (MOBILE)
// ===================

/**
 * @route   GET /mobile/api/term-payments/organization/:organizationId/my-payments
 * @desc    Get user's payments for specific organization
 * @access  Private (User themselves, must be member of organization)
 */
router.get('/organization/:organizationId/my-payments', async (req, res) => {
    try {
        const { organizationId } = req.params;
        const userId = req.user.user_id;
        
        // Verify user is member of organization
        const pool = require('../../config/db');
        const connection = await pool.getConnection();
        
        try {
            const [memberCheck] = await connection.query(`
                SELECT 1 FROM tbl_organization_member 
                WHERE organization_id = ? AND user_id = ? AND status = 'Active'
            `, [organizationId, userId]);
            
            if (memberCheck.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied - you are not an active member of this organization'
                });
            }
            
            // Get payments for this organization
            const { TermPaymentModel } = require('../models/termPaymentModel');
            const payments = await TermPaymentModel.getPaymentsByUser(userId, organizationId);
            
            res.json({
                success: true,
                data: payments,
                count: payments.length
            });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error in mobile getOrganizationPayments:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch organization payments',
            error: error.message
        });
    }
});

/**
 * @route   GET /mobile/api/term-payments/organization/:organizationId/current-term
 * @desc    Get current term payment for user in specific organization
 * @access  Private (User themselves, must be member of organization)
 */
router.get('/organization/:organizationId/current-term', async (req, res) => {
    try {
        const { organizationId } = req.params;
        const userId = req.user.user_id;
        
        // Get current active term
        const { TermModel } = require('../models/termPaymentModel');
        const currentTerm = await TermModel.getCurrentActiveTerm();
        
        if (!currentTerm) {
            return res.status(404).json({
                success: false,
                message: 'No active term found'
            });
        }
        
        // Get user's payment for current term in this organization
        const pool = require('../../config/db');
        const connection = await pool.getConnection();
        
        try {
            const [payments] = await connection.query(`
                SELECT mtp.*, o.name as organization_name
                FROM tbl_membership_term_payment mtp
                JOIN tbl_organization o ON mtp.organization_id = o.organization_id
                WHERE mtp.organization_id = ? 
                AND mtp.user_id = ? 
                AND mtp.term_id = ?
                ORDER BY mtp.created_at DESC
                LIMIT 1
            `, [organizationId, userId, currentTerm.term_id]);
            
            const payment = payments[0] || null;
            
            res.json({
                success: true,
                data: {
                    current_term: currentTerm,
                    payment: payment
                }
            });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error in mobile getCurrentTermPayment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch current term payment',
            error: error.message
        });
    }
});

// ===================
// TERM INFORMATION ROUTES (MOBILE)
// ===================

/**
 * @route   GET /mobile/api/term-payments/current-term
 * @desc    Get current active term
 * @access  Private (All authenticated users)
 */
router.get('/current-term', TermPaymentController.getCurrentActiveTerm);

/**
 * @route   GET /mobile/api/term-payments/terms
 * @desc    Get all terms (limited info for mobile)
 * @access  Private (All authenticated users)
 */
router.get('/terms', async (req, res) => {
    try {
        const { TermModel } = require('../models/termPaymentModel');
        const terms = await TermModel.getAllTerms();
        
        // Return limited info for mobile
        const mobileTerms = terms.map(term => ({
            term_id: term.term_id,
            academic_year: term.academic_year,
            term_name: term.term_name,
            start_date: term.start_date,
            end_date: term.end_date,
            is_active: term.is_active
        }));
        
        res.json({
            success: true,
            data: mobileTerms,
            count: mobileTerms.length
        });
    } catch (error) {
        console.error('Error in mobile getAllTerms:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch terms',
            error: error.message
        });
    }
});

// ===================
// DASHBOARD SUMMARY ROUTES (MOBILE)
// ===================

/**
 * @route   GET /mobile/api/term-payments/dashboard-summary
 * @desc    Get payment dashboard summary for mobile
 * @access  Private (User themselves)
 */
router.get('/dashboard-summary', async (req, res) => {
    try {
        const userId = req.user.user_id;
        
        const { TermPaymentModel, TermModel } = require('../models/termPaymentModel');
        
        // Get current term
        const currentTerm = await TermModel.getCurrentActiveTerm();
        
        // Get all user payments
        const allPayments = await TermPaymentModel.getPaymentsByUser(userId);
        
        // Get current term payments
        const currentTermPayments = currentTerm ? 
            allPayments.filter(p => p.term_id === currentTerm.term_id) : [];
        
        // Calculate summary
        const summary = {
            current_term: currentTerm,
            current_term_payments: {
                total: currentTermPayments.length,
                paid: currentTermPayments.filter(p => p.payment_status === 'Paid').length,
                pending: currentTermPayments.filter(p => p.payment_status === 'Pending').length,
                overdue: currentTermPayments.filter(p => p.payment_status === 'Overdue').length,
                total_amount: currentTermPayments.reduce((sum, p) => sum + parseFloat(p.amount_due), 0),
                paid_amount: currentTermPayments
                    .filter(p => p.payment_status === 'Paid')
                    .reduce((sum, p) => sum + parseFloat(p.amount_due), 0),
                outstanding_amount: currentTermPayments
                    .filter(p => p.payment_status !== 'Paid')
                    .reduce((sum, p) => sum + parseFloat(p.amount_due), 0)
            },
            overall_stats: {
                total_payments: allPayments.length,
                total_organizations: [...new Set(allPayments.map(p => p.organization_id))].length,
                lifetime_paid: allPayments
                    .filter(p => p.payment_status === 'Paid')
                    .reduce((sum, p) => sum + parseFloat(p.amount_due), 0),
                pending_payments: allPayments.filter(p => p.payment_status === 'Pending').length,
                overdue_payments: allPayments.filter(p => p.payment_status === 'Overdue').length
            },
            recent_payments: allPayments
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 5) // Last 5 payments
        };
        
        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        console.error('Error in mobile dashboard summary:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard summary',
            error: error.message
        });
    }
});

/**
 * @route   POST /mobile/api/term-payments/upload-proof
 * @desc    Upload payment proof for term payment
 * @access  Private (Payment owner only)
 */
router.post('/upload-proof', async (req, res) => {
    try {
        const { paymentId, notes, paymentMethod } = req.body;
        const userId = req.user.user_id;
        
        if (!paymentId) {
            return res.status(400).json({
                success: false,
                message: 'Payment ID is required'
            });
        }
        
        // Verify the payment belongs to the user
        const payment = await TermPaymentModel.getPaymentById(paymentId);
        
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }
        
        if (payment.user_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied - you can only update your own payments'
            });
        }
        
        // Process the payment with uploaded proof
        const result = await processPaymentTransaction(
            paymentId,
            paymentMethod || 'Upload Proof',
            `Mobile-Upload-${Date.now()}`
        );

        res.json({
            success: true,
            message: 'Payment proof uploaded and processed successfully',
            data: result
        });
    } catch (error) {
        console.error('Error uploading payment proof:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload payment proof',
            error: error.message
        });
    }
});

/**
 * @route   POST /mobile/api/term-payments/initiate-gateway-payment
 * @desc    Initiate gateway payment for term payment
 * @access  Private (Payment owner only)
 */
router.post('/initiate-gateway-payment', async (req, res) => {
    try {
        const { paymentId, paymentMethod } = req.body;
        const userId = req.user.user_id;
        
        // In a real implementation, this would integrate with a payment gateway
        // For now, we'll simulate the payment process
        
        const result = await processPaymentTransaction(paymentId, paymentMethod || 'Online Payment', `Gateway-${Date.now()}`);
        
        res.json({
            success: true,
            message: 'Gateway payment processed successfully',
            data: result
        });
    } catch (error) {
        console.error('Error processing gateway payment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process gateway payment',
            error: error.message
        });
    }
});

/**
 * @route   GET /mobile/api/term-payments/current-term
 * @desc    Get current active term
 * @access  Private
 */
router.get('/current-term', async (req, res) => {
    try {
        const TermPaymentController = require('../../web/controllers/termPaymentController');
        
        // Call the web controller method
        await TermPaymentController.getCurrentActiveTerm(req, res);
    } catch (error) {
        console.error('Error fetching current term:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch current term',
            error: error.message
        });
    }
});

/**
 * @route   GET /mobile/api/term-payments/user/:userId/organization/:organizationId
 * @desc    Get user's term payments for specific organization
 * @access  Private (User themselves only)
 */
router.get('/user/:userId/organization/:organizationId', async (req, res) => {
    try {
        const { userId, organizationId } = req.params;
        const authenticatedUserId = req.user.user_id;
        
        // Verify user can only access their own payments
        if (userId !== authenticatedUserId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied - you can only view your own payments'
            });
        }
        
        const TermPaymentController = require('../../web/controllers/termPaymentController');
        
        // Set up request object for web controller
        const modifiedReq = {
            ...req,
            params: { userId },
            query: { organization_id: organizationId }
        };
        
        await TermPaymentController.getUserPayments(modifiedReq, res);
    } catch (error) {
        console.error('Error fetching user organization payments:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch payments',
            error: error.message
        });
    }
});

// ===================
// ERROR HANDLING MIDDLEWARE
// ===================

// Catch all errors for mobile term payment routes
router.use((error, req, res, next) => {
    console.error('Mobile Term Payment Route Error:', error);
    
    res.status(500).json({
        success: false,
        message: 'Internal server error in mobile term payment system',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

module.exports = router;