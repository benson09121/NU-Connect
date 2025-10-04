// ===========================
// TERM PAYMENT CONTROLLER
// ===========================

const {
    TermModel,
    TermPaymentModel
} = require('../models/simplifiedTermPaymentModel');

// Import SSE functionality for real-time updates
const { subscribeToChannel, publishToChannel } = require('./sseController');

class TermPaymentController {
    // ===================
    // TERM MANAGEMENT
    // ===================

    // Get current active term
    static async getCurrentActiveTerm(req, res) {
        try {
            const term = await TermModel.getCurrentActiveTerm();
            
            if (!term) {
                return res.status(404).json({
                    success: false,
                    message: 'No active term found'
                });
            }

            res.json({
                success: true,
                data: term
            });
        } catch (error) {
            console.error('Error in getCurrentActiveTerm:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch current term',
                error: error.message
            });
        }
    }

    // Get all terms
    static async getAllTerms(req, res) {
        try {
            const { sessionId } = req.query;
            const terms = await TermModel.getAllTerms();
            
            // Subscribe to real-time updates if sessionId provided
            if (sessionId) {
                const channel = 'term-payments';
                subscribeToChannel(sessionId, channel);
                console.log(`Subscribed session ${sessionId} to ${channel}`);
            }
            
            res.json({
                success: true,
                data: terms,
                count: terms.length
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

    // Create new term (Admin only)
    static async createTerm(req, res) {
        try {
            const { academic_year, term_name, start_date, end_date } = req.body;
            const created_by = req.user.user_id;

            // Validation
            if (!academic_year || !term_name || !start_date || !end_date) {
                return res.status(400).json({
                    success: false,
                    message: 'Required fields: academic_year, term_name, start_date, end_date'
                });
            }

            const termData = {
                academic_year,
                term_name,
                start_date,
                end_date,
                created_by
            };

            const newTerm = await TermModel.createTerm(termData);

            // Publish to SSE for real-time updates
            try {
                // Fetch the updated terms list and publish it
                const updatedTerms = await TermModel.getAllTerms();
                // Ensure it's an array before publishing
                const termsArray = Array.isArray(updatedTerms) ? updatedTerms : [];
                await publishToChannel('term-payments', termsArray);
                console.log('Published updated terms list to SSE channel:', termsArray.length, 'terms');
            } catch (sseError) {
                console.error('Failed to publish to SSE:', sseError);
                // Don't fail the request if SSE fails
            }

            res.status(201).json({
                success: true,
                message: 'Term created successfully',
                data: newTerm
            });
        } catch (error) {
            console.error('Error in createTerm:', error);
            
            // Send appropriate status code based on error type
            const statusCode = error.message.includes('already exists') ? 409 : 500;
            
            res.status(statusCode).json({
                success: false,
                message: error.message || 'Failed to create term',
                error: error.message
            });
        }
    }

    // Update term (Admin only)
    static async updateTerm(req, res) {
        try {
            const { termId } = req.params;
            const termData = req.body;

            const updatedTerm = await TermModel.updateTerm(termId, termData);

            if (!updatedTerm) {
                return res.status(404).json({
                    success: false,
                    message: 'Term not found'
                });
            }

            // Publish to SSE for real-time updates
            try {
                // Fetch the updated terms list and publish it
                const updatedTerms = await TermModel.getAllTerms();
                // Ensure it's an array before publishing
                const termsArray = Array.isArray(updatedTerms) ? updatedTerms : [];
                await publishToChannel('term-payments', termsArray);
                console.log('Published updated terms list to SSE channel:', termsArray.length, 'terms');
            } catch (sseError) {
                console.error('Failed to publish to SSE:', sseError);
            }

            res.json({
                success: true,
                message: 'Term updated successfully',
                data: updatedTerm
            });
        } catch (error) {
            console.error('Error in updateTerm:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update term',
                error: error.message
            });
        }
    }

    // Delete term (Admin only)
    static async deleteTerm(req, res) {
        try {
            const { termId } = req.params;

            const deleted = await TermModel.deleteTerm(termId);

            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    message: 'Term not found'
                });
            }

            // Publish to SSE for real-time updates
            try {
                // Fetch the updated terms list and publish it
                const updatedTerms = await TermModel.getAllTerms();
                // Ensure it's an array before publishing
                const termsArray = Array.isArray(updatedTerms) ? updatedTerms : [];
                await publishToChannel('term-payments', termsArray);
                console.log('Published updated terms list to SSE channel:', termsArray.length, 'terms');
            } catch (sseError) {
                console.error('Failed to publish to SSE:', sseError);
            }

            res.json({
                success: true,
                message: 'Term deleted successfully'
            });
        } catch (error) {
            console.error('Error in deleteTerm:', error);
            
            // Check if it's a foreign key constraint error
            if (error.message.includes('Payment records exist')) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete term. Payment records exist for this term.',
                    error: error.message
                });
            }
            
            res.status(500).json({
                success: false,
                message: 'Failed to delete term',
                error: error.message
            });
        }
    }

    // ===================
    // PAYMENT MANAGEMENT
    // ===================

    // Create term payment
    static async createTermPayment(req, res) {
        try {
            const { organization_id, organization_version_id, cycle_number, user_id, term_id, amount_due, due_date } = req.body;

            // Validation
            if (!organization_id || !organization_version_id || !cycle_number || !user_id || !term_id || !amount_due || !due_date) {
                return res.status(400).json({
                    success: false,
                    message: 'All fields are required: organization_id, organization_version_id, cycle_number, user_id, term_id, amount_due, due_date'
                });
            }

            const paymentData = {
                organization_id,
                organization_version_id,
                cycle_number,
                user_id,
                term_id,
                amount_due,
                due_date
            };

            const payment = await TermPaymentModel.createTermPayment(paymentData);

            res.status(201).json({
                success: true,
                message: 'Term payment created successfully',
                data: payment
            });
        } catch (error) {
            console.error('Error in createTermPayment:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create term payment',
                error: error.message
            });
        }
    }

    // Process payment transaction with transaction system integration
    static async processPaymentTransaction(req, res) {
        try {
            const { paymentId } = req.params;
            const { payment_method, transaction_reference } = req.body;

            if (!payment_method) {
                return res.status(400).json({
                    success: false,
                    message: 'Payment method is required'
                });
            }

            const result = await TermPaymentModel.processPaymentTransaction(
                paymentId, 
                payment_method, 
                transaction_reference
            );

            res.json({
                success: true,
                message: 'Payment processed successfully and transaction created',
                data: result
            });
        } catch (error) {
            console.error('Error in processPaymentTransaction:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to process payment',
                error: error.message
            });
        }
    }

    // Get payment by ID
    static async getPaymentById(req, res) {
        try {
            const { paymentId } = req.params;

            const payment = await TermPaymentModel.getPaymentById(paymentId);

            if (!payment) {
                return res.status(404).json({
                    success: false,
                    message: 'Payment not found'
                });
            }

            res.json({
                success: true,
                data: payment
            });
        } catch (error) {
            console.error('Error in getPaymentById:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch payment',
                error: error.message
            });
        }
    }

    // Get transaction details for a payment
    static async getPaymentTransactionDetails(req, res) {
        try {
            const { paymentId } = req.params;

            const transactionDetails = await TermPaymentModel.getPaymentTransactionDetails(paymentId);

            if (!transactionDetails) {
                return res.status(404).json({
                    success: false,
                    message: 'Payment or transaction not found'
                });
            }

            res.json({
                success: true,
                data: transactionDetails
            });
        } catch (error) {
            console.error('Error in getPaymentTransactionDetails:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch transaction details',
                error: error.message
            });
        }
    }

    // Create direct payment with transaction (for SDAO approvals)
    static async createDirectPaymentWithTransaction(req, res) {
        try {
            const { 
                applicationId,
                termId,
                organizationId,
                orgVersionId,
                userId,
                paymentAmount,
                paymentMethod,
                transactionReference
            } = req.body;

            // Validation
            if (!applicationId || !termId || !organizationId || !orgVersionId || !userId || !paymentAmount) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: applicationId, termId, organizationId, orgVersionId, userId, paymentAmount'
                });
            }

            const paymentData = {
                applicationId,
                termId,
                organizationId,
                orgVersionId,
                userId,
                paymentAmount,
                paymentMethod: paymentMethod || 'Cash',
                transactionReference
            };

            const result = await TermPaymentModel.createDirectPaymentWithTransaction(paymentData);

            res.json({
                success: true,
                message: 'Payment created and transaction recorded successfully',
                data: result
            });
        } catch (error) {
            console.error('Error in createDirectPaymentWithTransaction:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create payment with transaction',
                error: error.message
            });
        }
    }

    // Get payments for user
    static async getUserPayments(req, res) {
        try {
            const { userId } = req.params;
            const { organization_id } = req.query;

            const payments = await TermPaymentModel.getPaymentsByUser(userId, organization_id);

            res.json({
                success: true,
                data: payments,
                count: payments.length
            });
        } catch (error) {
            console.error('Error in getUserPayments:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch user payments',
                error: error.message
            });
        }
    }

    // Get payments for organization
    static async getOrganizationPayments(req, res) {
        try {
            const { organizationId } = req.params;
            const { organization_version_id, term_id, status } = req.query;

            const payments = await TermPaymentModel.getPaymentsByOrganization(
                organizationId, 
                organization_version_id,
                term_id, 
                status
            );

            res.json({
                success: true,
                data: payments,
                count: payments.length
            });
        } catch (error) {
            console.error('Error in getOrganizationPayments:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch organization payments',
                error: error.message
            });
        }
    }

    // Update payment status manually
    static async updatePaymentStatus(req, res) {
        try {
            const { paymentId } = req.params;
            const { status } = req.body;
            const updated_by = req.user.user_id;

            if (!status) {
                return res.status(400).json({
                    success: false,
                    message: 'Payment status is required'
                });
            }

            const validStatuses = ['Pending', 'Paid', 'Overdue', 'Cancelled'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid payment status. Valid options: ' + validStatuses.join(', ')
                });
            }

            const updated = await TermPaymentModel.updatePaymentStatus(paymentId, status, updated_by);

            if (!updated) {
                return res.status(404).json({
                    success: false,
                    message: 'Payment not found'
                });
            }

            res.json({
                success: true,
                message: 'Payment status updated successfully'
            });
        } catch (error) {
            console.error('Error in updatePaymentStatus:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update payment status',
                error: error.message
            });
        }
    }

    // Delete payment (Admin only)
    static async deletePayment(req, res) {
        try {
            const { paymentId } = req.params;

            const deleted = await TermPaymentModel.deletePayment(paymentId);

            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    message: 'Payment not found or cannot be deleted (not in pending status)'
                });
            }

            res.json({
                success: true,
                message: 'Payment deleted successfully'
            });
        } catch (error) {
            console.error('Error in deletePayment:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete payment',
                error: error.message
            });
        }
    }

    // ===================
    // ORGANIZATION CONFIGURATION
    // ===================

    // Set organization term configuration
    static async setOrganizationTermConfig(req, res) {
        try {
            const { organizationId } = req.params;
            const { term_id, fee_amount, grace_period_days, is_required } = req.body;
            const created_by = req.user.user_id;

            if (!term_id || !fee_amount) {
                return res.status(400).json({
                    success: false,
                    message: 'Term ID and fee amount are required'
                });
            }

            const configData = {
                organization_id: organizationId,
                term_id,
                fee_amount,
                grace_period_days: grace_period_days || 30,
                is_required: is_required !== undefined ? is_required : true,
                created_by
            };

            const result = await OrganizationTermConfigModel.setOrganizationTermConfig(configData);

            res.json({
                success: true,
                message: 'Organization term configuration saved successfully',
                data: result
            });
        } catch (error) {
            console.error('Error in setOrganizationTermConfig:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to save organization term configuration',
                error: error.message
            });
        }
    }

    // Get organization term configuration
    static async getOrganizationTermConfig(req, res) {
        try {
            const { organizationId } = req.params;
            const { term_id } = req.query;

            const config = await OrganizationTermConfigModel.getOrganizationTermConfig(
                organizationId, 
                term_id
            );

            res.json({
                success: true,
                data: config
            });
        } catch (error) {
            console.error('Error in getOrganizationTermConfig:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch organization term configuration',
                error: error.message
            });
        }
    }

    // Generate payments for organization
    static async generatePaymentsForOrganization(req, res) {
        try {
            const { organizationId } = req.params;
            const { cycle_number, term_id } = req.body;

            if (!cycle_number || !term_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Cycle number and term ID are required'
                });
            }

            const result = await OrganizationTermConfigModel.generatePaymentsForOrganization(
                organizationId, 
                cycle_number, 
                term_id
            );

            res.json({
                success: true,
                message: `Successfully generated ${result.payments_generated} payments`,
                data: result
            });
        } catch (error) {
            console.error('Error in generatePaymentsForOrganization:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate payments for organization',
                error: error.message
            });
        }
    }

    // ===================
    // ANALYTICS
    // ===================

    // Get organization payment analytics
    static async getOrganizationPaymentAnalytics(req, res) {
        try {
            const { organizationId } = req.params;
            const { term_id } = req.query;

            if (!term_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Term ID is required'
                });
            }

            const analytics = await TermPaymentAnalyticsModel.getOrganizationPaymentAnalytics(
                organizationId, 
                term_id
            );

            res.json({
                success: true,
                data: analytics
            });
        } catch (error) {
            console.error('Error in getOrganizationPaymentAnalytics:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch payment analytics',
                error: error.message
            });
        }
    }

    // Get system payment analytics
    static async getSystemPaymentAnalytics(req, res) {
        try {
            const { term_id } = req.query;

            const analytics = await TermPaymentAnalyticsModel.getSystemPaymentAnalytics(term_id);

            res.json({
                success: true,
                data: analytics
            });
        } catch (error) {
            console.error('Error in getSystemPaymentAnalytics:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch system analytics',
                error: error.message
            });
        }
    }

    // Get payment trends
    static async getPaymentTrends(req, res) {
        try {
            const { organization_id } = req.query;

            const trends = await TermPaymentAnalyticsModel.getPaymentTrends(organization_id);

            res.json({
                success: true,
                data: trends,
                count: trends.length
            });
        } catch (error) {
            console.error('Error in getPaymentTrends:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch payment trends',
                error: error.message
            });
        }
    }

    // ===================
    // UTILITIES
    // ===================

    // Update overdue payments (System/Admin only)
    static async updateOverduePayments(req, res) {
        try {
            const result = await TermPaymentUtilsModel.updateOverduePayments();

            res.json({
                success: true,
                message: `Updated ${result.overdue_payments_updated} payments to overdue status`,
                data: result
            });
        } catch (error) {
            console.error('Error in updateOverduePayments:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update overdue payments',
                error: error.message
            });
        }
    }

    // Get payment settings
    static async getPaymentSettings(req, res) {
        try {
            const settings = await TermPaymentUtilsModel.getPaymentSettings();

            res.json({
                success: true,
                data: settings
            });
        } catch (error) {
            console.error('Error in getPaymentSettings:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch payment settings',
                error: error.message
            });
        }
    }

    // Update payment setting (Admin only)
    static async updatePaymentSetting(req, res) {
        try {
            const { settingKey } = req.params;
            const { setting_value } = req.body;
            const updated_by = req.user.user_id;

            if (!setting_value) {
                return res.status(400).json({
                    success: false,
                    message: 'Setting value is required'
                });
            }

            const updated = await TermPaymentUtilsModel.updatePaymentSetting(
                settingKey, 
                setting_value, 
                updated_by
            );

            if (!updated) {
                return res.status(404).json({
                    success: false,
                    message: 'Setting not found'
                });
            }

            res.json({
                success: true,
                message: 'Payment setting updated successfully'
            });
        } catch (error) {
            console.error('Error in updatePaymentSetting:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update payment setting',
                error: error.message
            });
        }
    }

    // ===================
    // MOBILE-SPECIFIC ENDPOINTS
    // ===================

    // Get user's pending payments (Mobile)
    static async getUserPendingPayments(req, res) {
        try {
            const userId = req.user.user_id;
            
            const payments = await TermPaymentModel.getPaymentsByUser(userId);
            const pendingPayments = payments.filter(p => p.payment_status === 'Pending' || p.payment_status === 'Overdue');

            res.json({
                success: true,
                data: pendingPayments,
                count: pendingPayments.length
            });
        } catch (error) {
            console.error('Error in getUserPendingPayments:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch pending payments',
                error: error.message
            });
        }
    }

    // Get user's payment summary (Mobile)
    static async getUserPaymentSummary(req, res) {
        try {
            const userId = req.user.user_id;
            
            const payments = await TermPaymentModel.getPaymentsByUser(userId);
            
            const summary = {
                total_payments: payments.length,
                paid_payments: payments.filter(p => p.payment_status === 'Paid').length,
                pending_payments: payments.filter(p => p.payment_status === 'Pending').length,
                overdue_payments: payments.filter(p => p.payment_status === 'Overdue').length,
                total_amount_paid: payments
                    .filter(p => p.payment_status === 'Paid')
                    .reduce((sum, p) => sum + parseFloat(p.amount_due), 0),
                outstanding_amount: payments
                    .filter(p => p.payment_status !== 'Paid')
                    .reduce((sum, p) => sum + parseFloat(p.amount_due), 0)
            };

            res.json({
                success: true,
                data: summary
            });
        } catch (error) {
            console.error('Error in getUserPaymentSummary:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch payment summary',
                error: error.message
            });
        }
    }

    // ===================
    // ORGANIZATION MANAGEMENT METHODS
    // ===================

    // Get term payment submissions for organization (for presidents)
    static async getOrganizationPaymentSubmissions(req, res) {
        try {
            const { organizationId } = req.params;
            const { organization_version_id, sessionId } = req.query;
            
            // Get payments with user details for this organization
            const payments = await TermPaymentModel.getOrganizationPaymentSubmissions(organizationId, organization_version_id);
            
            // Subscribe to real-time updates if sessionId provided
            if (sessionId) {
                const channel = `term_payment_submissions_${organizationId}`;
                subscribeToChannel(sessionId, channel);
            }
            
            res.json({
                success: true,
                data: payments
            });
        } catch (error) {
            console.error('Error in getOrganizationPaymentSubmissions:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch payment submissions',
                error: error.message
            });
        }
    }

    // Update payment status for organization management (approve/reject)
    static async updatePaymentStatus(req, res) {
        try {
            const { paymentId } = req.params;
            const { status } = req.body;
            const updated_by = req.user.user_id;

            // Validate status
            const validStatuses = ['Approved', 'Rejected', 'Pending'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status. Valid options: ' + validStatuses.join(', ')
                });
            }

            const result = await TermPaymentModel.updatePaymentSubmissionStatus(paymentId, status, updated_by);

            if (!result) {
                return res.status(404).json({
                    success: false,
                    message: 'Payment not found'
                });
            }

            // Get updated payment list for broadcasting
            const organizationId = result.organization_id;
            if (organizationId) {
                const updatedPayments = await TermPaymentModel.getOrganizationPaymentSubmissions(organizationId);
                
                // Broadcast the updated list to all subscribers
                publishToChannel(`term_payment_submissions_${organizationId}`, {
                    operation: 'UPDATE',
                    data: updatedPayments,
                    timestamp: new Date()
                });
            }

            res.json({
                success: true,
                message: `Payment ${status.toLowerCase()} successfully`,
                data: result
            });
        } catch (error) {
            console.error('Error in updatePaymentStatus:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update payment status',
                error: error.message
            });
        }
    }

    // ===================
    // MOBILE-SPECIFIC METHODS
    // ===================

    // Get user's term payments for a specific organization (used by mobile routes)
    static async getUserTermPayments(userId, organizationId) {
        try {
            const payments = await TermPaymentModel.getPaymentsByUserAndOrganization(userId, organizationId);
            return payments;
        } catch (error) {
            console.error('Error in getUserTermPayments:', error);
            throw error;
        }
    }

    // Update payment with receipt (used by mobile upload-proof route)
    static async updatePaymentWithReceipt(paymentId, filename, notes, userId) {
        try {
            const result = await TermPaymentModel.updatePaymentReceipt(paymentId, filename, notes, userId);
            return result;
        } catch (error) {
            console.error('Error in updatePaymentWithReceipt:', error);
            throw error;
        }
    }

    // Get organization analytics (used by mobile analytics route)
    static async getOrganizationAnalytics(organizationId, termId = null) {
        try {
            const analytics = await TermPaymentAnalyticsModel.getOrganizationAnalytics(organizationId, termId);
            return analytics;
        } catch (error) {
            console.error('Error in getOrganizationAnalytics:', error);
            throw error;
        }
    }

    // Update payment status with additional parameters (enhanced for mobile)
    static async updatePaymentStatus(paymentId, status, paymentMethod = null, transactionReference = null, userId) {
        try {
            const result = await TermPaymentModel.updatePaymentStatusEnhanced(
                paymentId, 
                status, 
                paymentMethod, 
                transactionReference, 
                userId
            );
            return result;
        } catch (error) {
            console.error('Error in enhanced updatePaymentStatus:', error);
            throw error;
        }
    }
}

module.exports = TermPaymentController;