// ===========================
// MOBILE TERM PAYMENT ROUTES
// ===========================

const express = require('express');
const router = express.Router();
const middleware = require('../../middlewares/middleWare');
const MobileTermPaymentController = require('../controllers/termPaymentController');
const userModel = require('../models/userModel');

// ===================
// MOBILE ENDPOINTS
// ===================

/**
 * @route   GET /api/mobile/term-payments/organization/:organizationId
 * @desc    Get user's term payments for a specific organization (Updated for simplified structure)
 * @access  Private
 */
router.get('/term-payments/organization/:organizationId', 
    middleware.authMiddleware, 
    MobileTermPaymentController.getUserTermPayments
);

/**
 * @route   POST /api/mobile/term-payments/create-payment
 * @desc    Create a new term payment record when user initiates payment
 * @access  Private
 */
router.post('/term-payments/create-payment',
    middleware.authMiddleware,
    MobileTermPaymentController.createPaymentRecord
);

/**
 * @route   POST /api/mobile/term-payments/create-payment
 * @desc    Create term payment when user submits payment proof (Updated for simplified structure)
 * @access  Private
 */
router.post('/term-payments/create-payment', 
    middleware.authMiddleware, 
    async (req, res) => {
        try {
            const { organizationId, termId } = req.body;
            const user = await userModel.getUser(req.user.email);
            const userId = user.user_id;
            
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

            // Validate file size (10MB limit)
            if (receipt.size > 10 * 1024 * 1024) {
                return res.status(400).json({
                    success: false,
                    message: 'File size must be less than 10MB'
                });
            }

            // Generate unique filename with correct upload path structure
            const timestamp = Date.now();
            const extension = receipt.name.split('.').pop();
            const filename = `payment_receipt_${organizationId}_${userId}_${timestamp}.${extension}`;
            
            // Get organization version ID from database
            const pool = require('../../config/db');
            const connection = await pool.getConnection();
            
            let orgVersionId;
            try {
                const [orgResult] = await connection.query(
                    'SELECT current_org_version_id FROM tbl_organization WHERE organization_id = ?',
                    [organizationId]
                );
                
                if (orgResult.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: 'Organization not found'
                    });
                }
                
                orgVersionId = orgResult[0].current_org_version_id;
                
                // Use the correct upload path structure: /app/organizations/{org_id}/{org_version_id}/transactions/
                const uploadDir = `./public/app/organizations/${organizationId}/${orgVersionId}/transactions`;
                const uploadPath = `${uploadDir}/${filename}`;
                const relativeImagePath = `/app/organizations/${organizationId}/${orgVersionId}/transactions/${filename}`;

                // Ensure directory exists
                const fs = require('fs');
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }

                // Save file
                await receipt.mv(uploadPath);

                // Create term payment with transaction using new procedure
                const [result] = await connection.query(
                    'CALL CreateTermPaymentWithTransaction(?, ?, ?, ?)',
                    [userId, organizationId, termId, relativeImagePath]
                );
                
                const paymentResult = result[0][0];
                
                res.json({
                    success: true,
                    message: 'Payment submitted successfully and is pending review',
                    data: {
                        paymentId: paymentResult.payment_id,
                        transactionId: paymentResult.transaction_id,
                        receiptNo: paymentResult.receipt_no,
                        amount: paymentResult.amount,
                        termName: paymentResult.term_name,
                        dueDate: paymentResult.due_date,
                        receiptUrl: relativeImagePath,
                        status: 'Pending',
                        message: paymentResult.message || 'Payment created successfully'
                    }
                });
            } finally {
                connection.release();
            }
        } catch (error) {
            console.error('Error creating term payment:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create payment',
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

            // Validate file size (10MB limit)
            if (receipt.size > 10 * 1024 * 1024) {
                return res.status(400).json({
                    success: false,
                    message: 'File size must be less than 10MB'
                });
            }

            // Get payment information to determine organization details
            const pool = require('../../config/db');
            const connection = await pool.getConnection();
            
            try {
                // Get payment and organization details
                const [paymentResult] = await connection.query(`
                    SELECT tp.organization_id, o.current_org_version_id
                    FROM tbl_term_payments tp
                    JOIN tbl_organization o ON tp.organization_id = o.organization_id
                    WHERE tp.payment_id = ? AND tp.user_id = ?
                `, [paymentId, userId]);
                
                if (paymentResult.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: 'Payment not found or access denied'
                    });
                }
                
                const organizationId = paymentResult[0].organization_id;
                const orgVersionId = paymentResult[0].current_org_version_id;
                
                // Generate unique filename with correct upload path structure
                const timestamp = Date.now();
                const extension = receipt.name.split('.').pop();
                const filename = `payment_receipt_${paymentId}_${timestamp}.${extension}`;
                
                // Use the correct upload path structure: /app/organizations/{org_id}/{org_version_id}/transactions/
                const uploadDir = `./public/app/organizations/${organizationId}/${orgVersionId}/transactions`;
                const uploadPath = `${uploadDir}/${filename}`;
                const relativeImagePath = `/app/organizations/${organizationId}/${orgVersionId}/transactions/${filename}`;

                // Ensure directory exists
                const fs = require('fs');
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }

                // Save file
                await receipt.mv(uploadPath);

                // Update payment receipt using new procedure
                const [result] = await connection.query(
                    'CALL UpdateTermPaymentReceipt(?, ?, ?, ?)',
                    [paymentId, relativeImagePath, notes || 'Payment receipt uploaded via mobile app', userId]
                );
                
                const transactionResult = result[0][0];
                
                res.json({
                    success: true,
                    message: 'Payment receipt uploaded and transaction created successfully',
                    data: {
                        receipt_url: relativeImagePath,
                        status: 'Pending Review',
                        transactionId: transactionResult.transaction_id,
                        receiptNo: transactionResult.receipt_no,
                        systemMessage: transactionResult.message
                    }
                });
            } finally {
                connection.release();
            }
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

/**
 * @route   POST /api/mobile/term-payments/generate-for-term
 * @desc    Generate term payments for all Per Term organizations for a specific term (Admin/Testing)
 * @access  Private
 */
router.post('/term-payments/generate-for-term',
    middleware.authMiddleware,
    async (req, res) => {
        try {
            let { termId, organizationId } = req.body;
            
            const pool = require('../../config/db');
            const connection = await pool.getConnection();
            
            try {
                // If no termId provided, get the current active term
                if (!termId) {
                    const [activeTermResult] = await connection.query('CALL GetCurrentActiveTerm()');
                    const activeTerm = activeTermResult[0][0];
                    
                    if (!activeTerm) {
                        return res.status(400).json({
                            success: false,
                            message: 'No active term found. Please ensure there is an active term set in the system.',
                            data: null
                        });
                    }
                    
                    termId = activeTerm.term_id;
                    console.log(`Using active term: ${activeTerm.term_name} (ID: ${termId})`);
                }
                
                let result;
                if (organizationId) {
                    // Generate for specific organization
                    [result] = await connection.query(
                        'CALL GenerateTermPaymentsForSpecificOrganization(?, ?)',
                        [organizationId, termId]
                    );
                } else {
                    // Generate for all Per Term organizations
                    [result] = await connection.query(
                        'CALL GenerateTermPaymentsForAllPerTermOrganizations(?)',
                        [termId]
                    );
                }
                
                // Check if the stored procedure returned an error
                const resultData = result[0][0];
                if (resultData && resultData.status === 'ERROR') {
                    return res.status(400).json({
                        success: false,
                        message: resultData.result,
                        data: resultData
                    });
                }
                
                res.json({
                    success: true,
                    message: 'Term payments generated successfully',
                    data: resultData || result[0]
                });
            } finally {
                connection.release();
            }
        } catch (error) {
            console.error('Error generating term payments:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate term payments',
                error: error.message
            });
        }
    }
);

/**
 * @route   GET /api/mobile/term-payments/check-status/:organizationId/:termId
 * @desc    Check user payment status for specific organization and term
 * @access  Private
 */
router.get('/term-payments/check-status/:organizationId/:termId',
    middleware.authMiddleware,
    async (req, res) => {
        try {
            const { organizationId, termId } = req.params;
            const user = await userModel.getUser(req.user.email);
            const userId = user.user_id;

            const pool = require('../../config/db');
            const connection = await pool.getConnection();
            
            try {
                const [result] = await connection.query(
                    'CALL CheckUserTermPaymentStatus(?, ?, ?)',
                    [userId, organizationId, termId]
                );
                
                const statusData = result[0][0];
                
                res.json({
                    success: true,
                    data: statusData
                });
            } finally {
                connection.release();
            }
        } catch (error) {
            console.error('Error checking payment status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to check payment status',
                error: error.message
            });
        }
    }
);

/**
 * @route   GET /api/mobile/term-payments/pending/:organizationId
 * @desc    Get pending term payments for approval
 * @access  Private
 */
router.get('/term-payments/pending/:organizationId',
    middleware.authMiddleware,
    async (req, res) => {
        try {
            const { organizationId } = req.params;
            const { termId } = req.query;

            const pool = require('../../config/db');
            const connection = await pool.getConnection();
            
            try {
                const [result] = await connection.query(
                    'CALL GetPendingTermPayments(?, ?)',
                    [organizationId, termId || null]
                );
                
                const pendingPayments = result[0];
                
                res.json({
                    success: true,
                    data: pendingPayments
                });
            } finally {
                connection.release();
            }
        } catch (error) {
            console.error('Error fetching pending payments:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch pending payments',
                error: error.message
            });
        }
    }
);

/**
 * @route   PUT /api/mobile/term-payments/update-status
 * @desc    Update payment status (approve/reject)
 * @access  Private
 */
router.put('/term-payments/update-status',
    middleware.authMiddleware,
    async (req, res) => {
        try {
            const { paymentId, status, remarks } = req.body;
            const verifiedBy = req.user.user_id;

            if (!['Paid', 'Rejected'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status. Must be "Paid" or "Rejected"'
                });
            }

            const pool = require('../../config/db');
            const connection = await pool.getConnection();
            
            try {
                const [result] = await connection.query(
                    'CALL UpdateTermPaymentStatus(?, ?, ?)',
                    [paymentId, status, verifiedBy]
                );
                
                const updateResult = result[0][0];
                
                if (updateResult.affected_rows > 0) {
                    res.json({
                        success: true,
                        message: `Payment ${status.toLowerCase()} successfully`,
                        data: {
                            paymentId,
                            status,
                            verifiedBy,
                            remarks
                        }
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        message: 'Payment not found or already processed'
                    });
                }
            } finally {
                connection.release();
            }
        } catch (error) {
            console.error('Error updating payment status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update payment status',
                error: error.message
            });
        }
    }
);

/**
 * @route   GET /api/mobile/term-payments/check-payment-status/:organizationId
 * @desc    Check if user needs to pay for current academic term and get payment status
 * @access  Private
 */
router.get('/term-payments/check-payment-status/:organizationId', 
    middleware.authMiddleware, 
    async (req, res) => {
        try {
            const { organizationId } = req.params;
            const user = await userModel.getUser(req.user.email);
            const userId = user.user_id;
            
            console.log(`DEBUG: Check payment status called for userId: ${userId}, organizationId: ${organizationId}`);
            console.log(`DEBUG: Current date: ${new Date().toISOString()}`);

            const pool = require('../../config/db');
            const connection = await pool.getConnection();
            
            try {
                console.log('DEBUG: About to query for current term...');
                // Step 1: Check if current date falls within any active academic term using date ranges
                const [termResult] = await connection.query(`
                    SELECT 
                        term_id,
                        academic_year,
                        term_name,
                        start_date,
                        end_date,
                        is_active,
                        created_at,
                        DATE(NOW()) BETWEEN start_date AND end_date as is_current_term,
                        DATE(NOW()) as current_date
                    FROM tbl_academic_term 
                    WHERE DATE(NOW()) BETWEEN start_date AND end_date
                    ORDER BY start_date DESC
                    LIMIT 1
                `);
                
                console.log('DEBUG: Term query result:', termResult);
                console.log('DEBUG: Term result length:', termResult.length);
                
                if (termResult.length === 0) {
                    console.log('DEBUG: No current term found, checking all terms...');
                    // Let's also check what terms exist
                    const [allTerms] = await connection.query(`
                        SELECT 
                            term_id,
                            academic_year,
                            term_name,
                            start_date,
                            end_date,
                            is_active,
                            DATE(NOW()) as current_date,
                            DATE(NOW()) BETWEEN start_date AND end_date as is_current_term
                        FROM tbl_academic_term 
                        ORDER BY start_date DESC
                    `);
                    console.log('DEBUG: All available terms:', allTerms);
                    
                    return res.json({
                        success: true,
                        data: {
                            current_term: null,
                            payment_required: false,
                            payment_records: null,
                            message: 'No active academic term found for current date',
                            debug_info: {
                                current_date: new Date().toISOString(),
                                available_terms: allTerms
                            }
                        }
                    });
                }

                const currentTerm = termResult[0];
                console.log('DEBUG: Found current term:', currentTerm);

                // Step 2: Check if user has payment record for this term and organization
                console.log(`DEBUG: Checking payments for userId: ${userId}, organizationId: ${organizationId}, termId: ${currentTerm.term_id}`);
                
                const [paymentResult] = await connection.query(`
                    SELECT 
                        mtp.payment_id,
                        mtp.term_id,
                        mtp.organization_id,
                        mtp.user_id,
                        mtp.payment_status,
                        mtp.created_at,
                        mtp.updated_at,
                        o.membership_fee_amount,
                        o.membership_fee_type,
                        t.amount as transaction_amount,
                        t.payment_method,
                        t.transaction_id,
                        t.receipt_no,
                        at.term_name,
                        at.start_date,
                        at.end_date
                    FROM tbl_membership_term_payment mtp
                    JOIN tbl_organization o ON mtp.organization_id = o.organization_id
                    JOIN tbl_academic_term at ON mtp.term_id = at.term_id
                    LEFT JOIN tbl_transaction t ON mtp.payment_id = t.payment_id
                    WHERE mtp.user_id = ? 
                    AND mtp.organization_id = ? 
                    AND mtp.term_id = ?
                `, [userId, organizationId, currentTerm.term_id]);

                console.log('DEBUG: Payment query result:', paymentResult);
                console.log('DEBUG: Payment result length:', paymentResult.length);

                if (paymentResult.length === 0) {
                    console.log('DEBUG: No payment record found - user needs to pay');
                    // No payment record exists - user needs to pay
                    // Get organization fee details
                    const [orgResult] = await connection.query(`
                        SELECT 
                            membership_fee_amount,
                            membership_fee_type,
                            organization_name
                        FROM tbl_organization 
                        WHERE organization_id = ?
                    `, [organizationId]);

                    const orgFee = orgResult[0] || {};
                    console.log('DEBUG: Organization fee info:', orgFee);

                    return res.json({
                        success: true,
                        data: {
                            current_term: {
                                term_id: currentTerm.term_id,
                                term_name: currentTerm.term_name,
                                start_date: currentTerm.start_date,
                                end_date: currentTerm.end_date
                            },
                            payment_required: true,
                            payment_records: null,
                            organization_fee: {
                                amount: orgFee.membership_fee_amount,
                                type: orgFee.membership_fee_type,
                                organization_name: orgFee.organization_name
                            },
                            message: 'Payment required for current term'
                        }
                    });
                } else {
                    console.log('DEBUG: Payment record found - returning payment status');
                    // Payment record exists - return status
                    const paymentData = paymentResult.map(payment => ({
                        payment_id: payment.payment_id,
                        term_id: payment.term_id,
                        organization_id: payment.organization_id,
                        user_id: payment.user_id,
                        payment_status: payment.payment_status,
                        created_at: payment.created_at,
                        updated_at: payment.updated_at,
                        organization_fee_amount: payment.membership_fee_amount,
                        organization_fee_type: payment.membership_fee_type,
                        transaction_amount: payment.transaction_amount,
                        payment_method: payment.payment_method,
                        transaction_id: payment.transaction_id,
                        receipt_no: payment.receipt_no,
                        term_name: payment.term_name,
                        start_date: payment.start_date,
                        end_date: payment.end_date
                    }));

                    return res.json({
                        success: true,
                        data: {
                            current_term: {
                                term_id: currentTerm.term_id,
                                term_name: currentTerm.term_name,
                                start_date: currentTerm.start_date,
                                end_date: currentTerm.end_date
                            },
                            payment_required: false,
                            payment_records: paymentData,
                            message: `Payment status: ${paymentData[0].payment_status}`
                        }
                    });
                }
            } finally {
                connection.release();
            }
        } catch (error) {
            console.error('ERROR: Error in check-payment-status endpoint:', error);
            console.error('ERROR: Stack trace:', error.stack);
            res.status(500).json({
                success: false,
                message: 'Failed to check payment status',
                error: error.message
            });
        }
    }
);

module.exports = router;