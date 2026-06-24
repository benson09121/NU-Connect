// @ts-nocheck
// ===========================
// MOBILE TERM PAYMENT CONTROLLER
// ===========================

const MobileTermPaymentModel = require('../models/termPaymentModel');
const userModel = require('../models/userModel');
const fs = require('fs');
const path = require('path');
const { publishToChannel, publishOrgHub } = require('../../web/controllers/sseController');

class MobileTermPaymentController {
    // ==================
    // TERM MANAGEMENT
    // ==================

    // Get current active term
    static async getCurrentActiveTerm(req, res) {
        try {
            const currentTerm = await MobileTermPaymentModel.getCurrentActiveTerm();
            
            if (!currentTerm) {
                return res.status(404).json({
                    success: false,
                    message: 'No active term found'
                });
            }

            res.json({
                success: true,
                data: currentTerm
            });
        } catch (error) {
            console.error('Error in getCurrentActiveTerm:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch current active term',
                error: error.message
            });
        }
    }

    // Get all terms (for mobile display)
    static async getAllTerms(req, res) {
        try {
            const terms = await MobileTermPaymentModel.getAllTerms();
            
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
            console.error('Error in getAllTerms:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch terms',
                error: error.message
            });
        }
    }

    // ==================
    // PAYMENT OPERATIONS
    // ==================

    // Get user's term payments for organization
    static async getUserTermPayments(req, res) {
        try {
            const { organizationId } = req.params;
            const { organizationVersionId } = req.query; // Add organization_version_id from query params
            const user = await userModel.getUser(req.user.email);
            const userId = user.user_id;
            console.log(`[DEBUG] Getting payments for user: ${userId}, org: ${organizationId}, orgVersion: ${organizationVersionId}`);
            
            const payments = await MobileTermPaymentModel.getUserTermPayments(userId, organizationId, organizationVersionId);
            
            res.json({
                success: true,
                data: payments
            });
        } catch (error) {
            console.error('Error in getUserTermPayments:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch term payments',
                error: error.message
            });
        }
    }

    // Enhanced check payment status for current term with exclusion logic
    static async checkPaymentStatus(req, res) {
        try {
            const { organizationId, organizationVersionId } = req.params;
            const { 
                application_date, 
                current_term_id, 
                include_history = false, 
                future_terms_count = 4 
            } = req.query;
            
            const user = await userModel.getUser(req.user.email);
            const userId = user.user_id;
            
            console.log(`DEBUG CONTROLLER: Enhanced check payment status called for userId: ${userId}, organizationId: ${organizationId}, organizationVersionId: ${organizationVersionId}`);
            console.log(`DEBUG CONTROLLER: Additional params - application_date: ${application_date}, current_term_id: ${current_term_id}, include_history: ${include_history}`);

            // Get enhanced payment status data with exclusion logic
            const statusData = await MobileTermPaymentModel.checkEnhancedPaymentStatus(
                userId, 
                organizationId, 
                organizationVersionId, 
                {
                    application_date,
                    current_term_id: current_term_id ? parseInt(current_term_id) : null,
                    include_history: include_history === 'true',
                    future_terms_count: parseInt(future_terms_count) || 4
                }
            );
            
            res.json({
                success: true,
                data: statusData
            });
        } catch (error) {
            console.error('ERROR CONTROLLER: Error in enhanced checkPaymentStatus:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to check payment status',
                error: error.message
            });
        }
    }

    // Create payment record
    static async createPaymentRecord(req, res) {
        try {
            const { organizationId, organizationVersionId } = req.body;
            const user = await userModel.getUser(req.user.email);
            const userId = user.user_id;
            
            const result = await MobileTermPaymentModel.generateTermPaymentsForOrganization(organizationId, null);
            
            if (result && result.status === 'ERROR') {
                return res.status(400).json({
                    success: false,
                    message: result.result,
                    data: result
                });
            }
            
            // Get the newly created payment
            const payments = await MobileTermPaymentModel.getUserTermPayments(userId, organizationId, organizationVersionId);
            const latestPayment = payments.find(p => p.payment_status === 'Pending');
            
            if (!latestPayment) {
                return res.status(404).json({
                    success: false,
                    message: 'Payment record not created. Please check if you are an active member of a Per Term organization.'
                });
            }
            
            res.json({
                success: true,
                message: 'Payment record created successfully',
                data: {
                    paymentId: latestPayment.payment_id,
                    amount: latestPayment.payment_amount,
                    dueDate: latestPayment.due_date,
                    termId: latestPayment.term_id,
                    status: 'Pending'
                }
            });
        } catch (error) {
            console.error('Error in createPaymentRecord:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create payment record',
                error: error.message
            });
        }
    }

    // STEP 1: Create transaction and membership (returns transaction for real-time)
    static async createTransactionStep(req, res) {
        try {
            const { organizationId, organizationVersionId, paymentMethod } = req.body;
            const user = await userModel.getUser(req.user.email);
            const userId = user.user_id;
            
            console.log(`DEBUG CONTROLLER: createTransactionStep called for userId: ${userId}, organizationId: ${organizationId}`);
            console.log(`DEBUG CONTROLLER: paymentMethod: ${paymentMethod}`);
            
            if (!organizationVersionId) {
                return res.status(400).json({
                    success: false,
                    message: 'Organization version ID is required'
                });
            }
            
            if (!req.files || !req.files.receipt) {
                return res.status(400).json({
                    success: false,
                    message: 'Payment receipt file is required'
                });
            }

            const receipt = req.files.receipt;
            
            // Validate file
            const validationResult = MobileTermPaymentController._validateReceiptFile(receipt);
            if (!validationResult.valid) {
                return res.status(400).json({
                    success: false,
                    message: validationResult.message
                });
            }

            // Get organization details for upload path
            const orgDetails = await MobileTermPaymentModel.getOrganizationDetails(organizationId);
            if (!orgDetails) {
                return res.status(404).json({
                    success: false,
                    message: 'Organization not found'
                });
            }

            // Generate unique filename and upload path
            const uploadInfo = MobileTermPaymentController._generateUploadPath(
                organizationId, 
                organizationVersionId,
                userId, 
                receipt.name
            );

            // Ensure directory exists and save file
            if (!fs.existsSync(uploadInfo.uploadDir)) {
                fs.mkdirSync(uploadInfo.uploadDir, { recursive: true });
            }
            await receipt.mv(uploadInfo.uploadPath);

            // STEP 1: Create transaction with membership
            const transactionResult = await MobileTermPaymentModel.createTransactionWithMembership(
                userId, 
                organizationId, 
                organizationVersionId,
                uploadInfo.relativeImagePath,
                paymentMethod
            );
            
            console.log(`DEBUG CONTROLLER: Transaction created successfully:`, transactionResult);
            
            // REAL-TIME: Publish transaction creation immediately
            try {
                publishToChannel(`transactions_${organizationId}`, {
                    type: 'new_transaction',
                    transaction_id: transactionResult.transaction_id,
                    organization_id: organizationId,
                    cycle_number: transactionResult.cycle_number,
                    amount: transactionResult.amount,
                    user_id: userId,
                    user_name: `${user.first_name} ${user.last_name}`,
                    payment_method: transactionResult.payment_method,
                    receipt_url: transactionResult.receipt_url,
                    timestamp: new Date().toISOString()
                });
                console.log(`🟢 REAL-TIME: Published transaction creation to SSE: transactions_${organizationId}`);
            } catch (sseError) {
                console.error('🔴 Failed to publish transaction SSE:', sseError);
            }
            
            res.json({
                success: true,
                message: 'Transaction created successfully',
                data: {
                    transaction_id: transactionResult.transaction_id,
                    cycle_number: transactionResult.cycle_number,
                    amount: transactionResult.amount,
                    payment_method: transactionResult.payment_method,
                    receipt_url: transactionResult.receipt_url,
                    receipt_no: transactionResult.receipt_no,
                    organization_name: transactionResult.organization_name,
                    message: transactionResult.message
                }
            });
        } catch (error) {
            console.error('Error in createTransactionStep:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create transaction',
                error: error.message
            });
        }
    }

    // STEP 2: Create term payment using existing transaction ID
    static async createTermPaymentStep(req, res) {
        try {
            const { organizationId, organizationVersionId, termId, transactionId } = req.body;
            const user = await userModel.getUser(req.user.email);
            const userId = user.user_id;
            
            console.log(`DEBUG CONTROLLER: createTermPaymentStep called for transactionId: ${transactionId}, termId: ${termId}`);
            
            if (!transactionId) {
                return res.status(400).json({
                    success: false,
                    message: 'Transaction ID is required'
                });
            }
            
            if (!termId) {
                return res.status(400).json({
                    success: false,
                    message: 'Term ID is required'
                });
            }

            // STEP 2: Create term payment
            const paymentResult = await MobileTermPaymentModel.createTermPaymentWithTransactionId(
                userId, 
                organizationId, 
                organizationVersionId,
                termId,
                transactionId
            );
            
            console.log(`DEBUG CONTROLLER: Term payment created successfully:`, paymentResult);
            
            // REAL-TIME: Publish term payment creation immediately
            try {
                publishOrgHub({
                    orgId: organizationId,
                    orgVersionId: organizationVersionId,
                    entity: 'organization_termPayments',
                    operation: 'CREATE',
                    data: {
                        type: 'new_term_payment',
                        payment_id: paymentResult.payment_id,
                        transaction_id: paymentResult.transaction_id,
                        organization_id: organizationId,
                        user_id: userId,
                        user_name: `${user.first_name} ${user.last_name}`,
                        amount: paymentResult.amount,
                        payment_method: paymentResult.payment_method,
                        term_name: paymentResult.term_name,
                        timestamp: new Date().toISOString()
                    }
                });
                console.log(`� [MOBILE] 📡 Term Payment Published to hub - 1 item`);
            } catch (sseError) {
                console.error('🔴 Failed to publish term payment SSE:', sseError);
            }
            
            // REAL-TIME: Publish updated term payments list for dashboard
            try {
                const [termPaymentsList] = await MobileTermPaymentModel.connection.query(`
                    SELECT * FROM vw_term_payment_overview
                    WHERE organization_id = ? AND organization_version_id = ?
                    ORDER BY created_at DESC
                `, [organizationId, organizationVersionId]);
                
                publishOrgHub({
                    orgId: organizationId,
                    orgVersionId: organizationVersionId,
                    entity: 'organization_termPayments',
                    operation: 'UPDATE',
                    data: termPaymentsList
                });
                console.log(`� [MOBILE] 📡 Term Payments List Published to hub - ${termPaymentsList.length} items`);
                
            } catch (sseError) {
                console.error('🔴 Failed to publish term payments list SSE:', sseError);
            }
            
            res.json({
                success: true,
                message: 'Term payment created successfully',
                data: {
                    payment_id: paymentResult.payment_id,
                    transaction_id: paymentResult.transaction_id,
                    receipt_no: paymentResult.receipt_no,
                    amount: paymentResult.amount,
                    payment_method: paymentResult.payment_method,
                    payment_status: paymentResult.payment_status,
                    receipt_url: paymentResult.receipt_url,
                    term_name: paymentResult.term_name,
                    due_date: paymentResult.due_date,
                    organization_name: paymentResult.organization_name,
                    message: paymentResult.message
                }
            });
        } catch (error) {
            console.error('Error in createTermPaymentStep:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create term payment',
                error: error.message
            });
        }
    }

    // Create term payment with file upload
    static async createTermPayment(req, res) {
        try {
            const { organizationId, organizationVersionId, termId, paymentMethod } = req.body;
            const user = await userModel.getUser(req.user.email);
            const userId = user.user_id;
            
            console.log(`DEBUG CONTROLLER: createTermPayment called for userId: ${userId}, organizationId: ${organizationId}, organizationVersionId: ${organizationVersionId}`);
            console.log(`DEBUG CONTROLLER: paymentMethod: ${paymentMethod}`);
            console.log(`DEBUG CONTROLLER: req.body:`, req.body);
            
            if (!organizationVersionId) {
                return res.status(400).json({
                    success: false,
                    message: 'Organization version ID is required'
                });
            }
            
            if (!req.files || !req.files.receipt) {
                return res.status(400).json({
                    success: false,
                    message: 'Payment receipt file is required'
                });
            }

            const receipt = req.files.receipt;
            
            // Validate file
            const validationResult = MobileTermPaymentController._validateReceiptFile(receipt);
            if (!validationResult.valid) {
                return res.status(400).json({
                    success: false,
                    message: validationResult.message
                });
            }

            // Get organization details for upload path
            const orgDetails = await MobileTermPaymentModel.getOrganizationDetails(organizationId);
            if (!orgDetails) {
                return res.status(404).json({
                    success: false,
                    message: 'Organization not found'
                });
            }

            // Generate unique filename and upload path
            const uploadInfo = MobileTermPaymentController._generateUploadPath(
                organizationId, 
                organizationVersionId, // Use provided organizationVersionId instead of orgDetails.current_org_version_id
                userId, 
                receipt.name
            );

            // Ensure directory exists and save file
            if (!fs.existsSync(uploadInfo.uploadDir)) {
                fs.mkdirSync(uploadInfo.uploadDir, { recursive: true });
            }
            await receipt.mv(uploadInfo.uploadPath);

            // Create payment with transaction (including payment method)
            const result = await MobileTermPaymentModel.createTermPaymentWithTransaction(
                userId, 
                organizationId, 
                organizationVersionId, // Add organizationVersionId parameter
                termId, 
                uploadInfo.relativeImagePath,
                paymentMethod  // Pass payment method to model
            );
            
            console.log(`DEBUG CONTROLLER: Payment created successfully:`, result);
            
            // Publish real-time notification using existing SSE system
            const notificationData = {
                type: 'new_payment',
                message: `New ${paymentMethod || 'payment'} submitted by ${user.first_name} ${user.last_name}`,
                paymentId: result.payment_id,
                amount: result.amount,
                paymentMethod: paymentMethod || 'Not specified',
                userName: `${user.first_name} ${user.last_name}`,
                userEmail: user.email,
                organizationId: organizationId,
                termName: result.term_name,
                timestamp: new Date().toISOString()
            };
            
            // Publish to term payments channel for real-time updates
            publishToChannel('term_payments', notificationData);
            publishToChannel(`term_payments_${organizationId}`, notificationData);
               
            console.log('Published real-time payment notification via SSE:', notificationData);
            
            res.json({
                success: true,
                message: 'Payment submitted successfully and is pending review',
                data: {
                    paymentId: result.payment_id,
                    transactionId: result.transaction_id,
                    receiptNo: result.receipt_no,
                    amount: result.amount,
                    termName: result.term_name,
                    dueDate: result.due_date,
                    receiptUrl: uploadInfo.relativeImagePath,
                    paymentMethod: paymentMethod || 'Not specified',
                    status: 'Pending',
                    message: result.message || 'Payment created successfully'
                }
            });
        } catch (error) {
            console.error('Error in createTermPayment:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create payment',
                error: error.message
            });
        }
    }

    // Upload payment proof
    static async uploadPaymentProof(req, res) {
        try {
            const { paymentId, notes } = req.body;
            const user = await userModel.getUser(req.user.email);
            const userId = user.user_id;
            
            if (!req.files || !req.files.receipt) {
                return res.status(400).json({
                    success: false,
                    message: 'Payment receipt file is required'
                });
            }

            const receipt = req.files.receipt;
            
            // Validate file
            const validationResult = MobileTermPaymentController._validateReceiptFile(receipt);
            if (!validationResult.valid) {
                return res.status(400).json({
                    success: false,
                    message: validationResult.message
                });
            }

            // Validate payment ownership
            const paymentOwnership = await MobileTermPaymentModel.validatePaymentOwnership(paymentId, userId);
            if (!paymentOwnership) {
                return res.status(404).json({
                    success: false,
                    message: 'Payment not found or access denied'
                });
            }

            // Get organization details for upload path
            const orgDetails = await MobileTermPaymentModel.getOrganizationDetails(paymentOwnership.organization_id);
            
            // Generate upload path
            const uploadInfo = MobileTermPaymentController._generateUploadPath(
                paymentOwnership.organization_id, 
                orgDetails.current_org_version_id, 
                paymentId, 
                receipt.name,
                'payment_receipt'
            );

            // Ensure directory exists and save file
            if (!fs.existsSync(uploadInfo.uploadDir)) {
                fs.mkdirSync(uploadInfo.uploadDir, { recursive: true });
            }
            await receipt.mv(uploadInfo.uploadPath);

            // Update payment receipt
            const result = await MobileTermPaymentModel.updateTermPaymentReceipt(
                paymentId, 
                uploadInfo.relativeImagePath, 
                notes || 'Payment receipt uploaded via mobile app', 
                userId
            );
            
            res.json({
                success: true,
                message: 'Payment receipt uploaded and transaction created successfully',
                data: {
                    receipt_url: uploadInfo.relativeImagePath,
                    status: 'Pending Review',
                    transactionId: result.transaction_id,
                    receiptNo: result.receipt_no,
                    systemMessage: result.message
                }
            });
        } catch (error) {
            console.error('Error in uploadPaymentProof:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to upload payment proof',
                error: error.message
            });
        }
    }

    // ==================
    // ORGANIZATION OPERATIONS
    // ==================

    // Get organization analytics
    static async getOrganizationAnalytics(req, res) {
        try {
            const { organizationId } = req.params;
            const { termId } = req.query;
            
            // TODO: Implement analytics logic or call web controller
            // For now, return placeholder
            res.json({
                success: true,
                data: {
                    totalMembers: 0,
                    paidCount: 0,
                    pendingCount: 0,
                    overdueCount: 0,
                    paymentRate: 0,
                    totalExpected: 0,
                    totalCollected: 0,
                    summary: {
                        collected: '₱0',
                        expected: '₱0',
                        rate: '0%',
                        outstanding: '₱0'
                    }
                }
            });
        } catch (error) {
            console.error('Error in getOrganizationAnalytics:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch analytics',
                error: error.message
            });
        }
    }

    // Generate term payments for organization
    static async generateTermPayments(req, res) {
        try {
            let { termId, organizationId } = req.body;
            
            // If no termId provided, get the current active term
            if (!termId) {
                const activeTerm = await MobileTermPaymentModel.getCurrentActiveTerm();
                
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
                result = await MobileTermPaymentModel.generateTermPaymentsForOrganization(organizationId, termId);
            } else {
                // Generate for all Per Term organizations
                result = await MobileTermPaymentModel.generateTermPaymentsForAllOrganizations(termId);
            }
            
            // Check if the stored procedure returned an error
            if (result && result.status === 'ERROR') {
                return res.status(400).json({
                    success: false,
                    message: result.result,
                    data: result
                });
            }
            
            res.json({
                success: true,
                message: 'Term payments generated successfully',
                data: result
            });
        } catch (error) {
            console.error('Error in generateTermPayments:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate term payments',
                error: error.message
            });
        }
    }

    // Get pending payments
    static async getPendingPayments(req, res) {
        try {
            const { organizationId } = req.params;
            const { termId } = req.query;

            const pendingPayments = await MobileTermPaymentModel.getPendingTermPayments(organizationId, termId || null);
            
            res.json({
                success: true,
                data: pendingPayments
            });
        } catch (error) {
            console.error('Error in getPendingPayments:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch pending payments',
                error: error.message
            });
        }
    }

    // Update payment status
    static async updatePaymentStatus(req, res) {
        try {
            const { paymentId, status, remarks } = req.body;
            const user = await userModel.getUser(req.user.email);
            const verifiedBy = user.user_id;

            if (!['Paid', 'Rejected'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status. Must be "Paid" or "Rejected"'
                });
            }

            const updateResult = await MobileTermPaymentModel.updateTermPaymentStatus(paymentId, status, verifiedBy, remarks);
            
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
        } catch (error) {
            console.error('Error in updatePaymentStatus:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update payment status',
                error: error.message
            });
        }
    }

    // ==================
    // PAYMENT GATEWAY OPERATIONS
    // ==================

    // Initiate gateway payment
    static async initiateGatewayPayment(req, res) {
        try {
            const { paymentId, paymentMethod } = req.body;
            const user = await userModel.getUser(req.user.email);
            const userId = user.user_id;
            
            // Validate payment ownership
            const payment = await MobileTermPaymentModel.getPaymentWithTransactionDetails(paymentId);
            
            if (!payment || payment.user_id !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }

            // For now, simulate payment gateway integration
            // In production, integrate with actual payment providers
            const transactionReference = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // TODO: Update payment status to processing using model
            // await MobileTermPaymentModel.updatePaymentStatus(paymentId, 'Processing', userId);

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
            console.error('Error in initiateGatewayPayment:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to initiate payment',
                error: error.message
            });
        }
    }

    // ==================
    // UTILITY METHODS
    // ==================

    // Validate receipt file
    static _validateReceiptFile(file) {
        // Accept common image MIME types that might be sent by mobile devices
        const allowedTypes = [
            'image/jpeg', 
            'image/jpg',      // Some mobile apps incorrectly use this
            'image/pjpeg',    // Progressive JPEG (IE)
            'image/png', 
            'application/pdf'
        ];
        const maxSize = 10 * 1024 * 1024; // 10MB

        console.log(`[DEBUG] Validating receipt file:`, {
            fileName: file.name,
            mimetype: file.mimetype,
            size: file.size,
            allowedTypes
        });

        // Also check file extension as a backup
        const fileExt = file.name.toLowerCase().split('.').pop();
        const allowedExtensions = ['jpg', 'jpeg', 'png', 'pdf'];
        
        const mimeTypeValid = allowedTypes.includes(file.mimetype);
        const extensionValid = allowedExtensions.includes(fileExt);

        console.log(`[DEBUG] Validation checks:`, {
            mimeTypeValid,
            extensionValid,
            fileExtension: fileExt
        });

        if (!mimeTypeValid && !extensionValid) {
            console.log(`[DEBUG] File rejected - invalid type. MIME: ${file.mimetype}, Extension: ${fileExt}`);
            return {
                valid: false,
                message: `Invalid file type. Only JPEG, PNG, and PDF files are allowed. Received MIME type: ${file.mimetype}, Extension: ${fileExt}`
            };
        }

        if (file.size > maxSize) {
            console.log(`[DEBUG] File rejected - size too large: ${file.size} bytes`);
            return {
                valid: false,
                message: 'File size must be less than 10MB'
            };
        }

        console.log(`[DEBUG] File validation passed`);
        return { valid: true };
    }

    // Generate upload path information
    static _generateUploadPath(organizationId, orgVersionId, identifier, originalName, prefix = 'payment_receipt') {
        const timestamp = Date.now();
        const extension = originalName.split('.').pop();
        const filename = `${prefix}_${organizationId}_${identifier}_${timestamp}.${extension}`;
        
        // Updated path structure: /app/organizations/org_id/org_version/transactions/
        const uploadDir = `/app/organizations/${organizationId}/${orgVersionId}/transactions`;
        const uploadPath = `${uploadDir}/${filename}`;
        const relativeImagePath = `/app/organizations/${organizationId}/${orgVersionId}/transactions/${filename}`;

        return {
            filename,
            uploadDir,
            uploadPath,
            relativeImagePath
        };
    }

    // Check if user can retry payment after rejection
    static async checkPaymentRetryStatus(req, res) {
        try {
            const { organizationId, organizationVersionId, termId } = req.params;
            const user = await userModel.getUser(req.user.email);
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            const retryStatus = await MobileTermPaymentModel.checkRejectedPaymentStatus(
                user.user_id,
                parseInt(organizationId),
                organizationVersionId ? parseInt(organizationVersionId) : null,
                termId ? parseInt(termId) : null
            );

            res.json({
                success: true,
                data: retryStatus
            });
        } catch (error) {
            console.error('Error checking payment retry status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to check payment retry status',
                error: error.message
            });
        }
    }
}

module.exports = MobileTermPaymentController;
