// ===========================
// SIMPLIFIED TERM PAYMENT CONTROLLER
// ===========================

const {
    TermModel,
    TermPaymentModel
} = require('../models/simplifiedTermPaymentModel');

class SimplifiedTermPaymentController {
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
            const terms = await TermModel.getAllTerms();
            
            res.json({
                success: true,
                data: terms
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

    // Create new term
    static async createTerm(req, res) {
        try {
            const termData = {
                ...req.body,
                created_by: req.user.user_id
            };
            
            const termId = await TermModel.createTerm(termData);
            
            res.status(201).json({
                success: true,
                message: 'Term created successfully',
                data: { term_id: termId }
            });
        } catch (error) {
            console.error('Error in createTerm:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create term',
                error: error.message
            });
        }
    }

    // Update term
    static async updateTerm(req, res) {
        try {
            const { termId } = req.params;
            const termData = req.body;
            
            const updated = await TermModel.updateTerm(termId, termData);
            
            if (!updated) {
                return res.status(404).json({
                    success: false,
                    message: 'Term not found'
                });
            }
            
            res.json({
                success: true,
                message: 'Term updated successfully'
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

    // Delete term
    static async deleteTerm(req, res) {
        try {
            const { termId } = req.params;
            
            const deleted = await TermModel.deleteTerm(termId);
            
            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    message: 'Term not found or has associated payments'
                });
            }
            
            res.json({
                success: true,
                message: 'Term deleted successfully'
            });
        } catch (error) {
            console.error('Error in deleteTerm:', error);
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

    // Get user payments
    static async getUserPayments(req, res) {
        try {
            const { userId } = req.params;
            const { organizationId } = req.query;
            
            // Check authorization
            if (req.user.user_id !== userId && req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }
            
            const payments = await TermPaymentModel.getPaymentsByUser(userId, organizationId);
            
            res.json({
                success: true,
                data: payments
            });
        } catch (error) {
            console.error('Error in getUserPayments:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch payments',
                error: error.message
            });
        }
    }

    // Create payment with transaction
    static async createPaymentWithTransaction(req, res) {
        try {
            const paymentData = {
                ...req.body,
                user_id: req.user.user_id
            };
            
            const result = await TermPaymentModel.createTermPaymentWithTransaction(paymentData);
            
            res.status(201).json({
                success: true,
                message: 'Payment created successfully',
                data: result
            });
        } catch (error) {
            console.error('Error in createPaymentWithTransaction:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create payment',
                error: error.message
            });
        }
    }

    // Update payment receipt
    static async updatePaymentReceipt(req, res) {
        try {
            const { paymentId } = req.params;
            const { receiptPath, notes } = req.body;
            const userId = req.user.user_id;
            
            const result = await TermPaymentModel.updatePaymentReceipt(paymentId, receiptPath, notes, userId);
            
            res.json({
                success: true,
                message: 'Payment receipt updated successfully',
                data: result
            });
        } catch (error) {
            console.error('Error in updatePaymentReceipt:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update payment receipt',
                error: error.message
            });
        }
    }

    // Get organization payment submissions
    static async getOrganizationPaymentSubmissions(req, res) {
        try {
            const { organizationId } = req.params;
            
            const payments = await TermPaymentModel.getOrganizationPaymentSubmissions(organizationId);
            
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

    // Update payment status
    static async updatePaymentStatus(req, res) {
        try {
            const { paymentId } = req.params;
            const { status, notes, verified_by } = req.body;
            const updatedBy = req.user.user_id;
            
            // Use the existing method with the correct parameter order
            const result = await TermPaymentModel.updatePaymentStatus(paymentId, status, updatedBy, notes, verified_by);
            
            if (!result) {
                return res.status(404).json({
                    success: false,
                    message: 'Payment not found'
                });
            }

            // Get the payment details to publish SSE event
            try {
                const paymentDetails = await TermPaymentModel.getPaymentById(paymentId);
                if (paymentDetails && paymentDetails.organization_id) {
                    const sseController = require('./sseController');
                    
                    // Publish to organization-specific channel
                    sseController.publishToChannel(
                        `term_payment_submissions_${paymentDetails.organization_id}`,
                        {
                            type: 'TERM_PAYMENT_UPDATED',
                            data: {
                                payment_id: paymentId,
                                status,
                                notes,
                                verified_by,
                                updated_at: new Date().toISOString(),
                                organization_id: paymentDetails.organization_id
                            }
                        }
                    );
                }
            } catch (sseError) {
                console.error('Error publishing SSE event:', sseError);
                // Don't fail the request if SSE fails
            }
            
            res.json({
                success: true,
                message: 'Payment status updated successfully',
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

    // Update payment submission status (for organization approval)
    static async updatePaymentSubmissionStatus(req, res) {
        try {
            const { paymentId } = req.params;
            const { status } = req.body;
            const updatedBy = req.user.user_id;
            
            const result = await TermPaymentModel.updatePaymentSubmissionStatus(paymentId, status, updatedBy);
            
            if (!result) {
                return res.status(404).json({
                    success: false,
                    message: 'Payment not found or already processed'
                });
            }
            
            res.json({
                success: true,
                message: `Payment ${status.toLowerCase()} successfully`,
                data: result
            });
        } catch (error) {
            console.error('Error in updatePaymentSubmissionStatus:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update payment submission status',
                error: error.message
            });
        }
    }

    // Generate term payments for organization
    static async generateTermPayments(req, res) {
        try {
            const { organizationId } = req.body;
            const { termId } = req.body;
            
            const result = await TermPaymentModel.generateTermPaymentsForOrganization(organizationId, termId);
            
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

    // Check user payment status
    static async checkUserPaymentStatus(req, res) {
        try {
            const { userId, organizationId, termId } = req.params;
            
            // Check authorization
            if (req.user.user_id !== userId && req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }
            
            const result = await TermPaymentModel.checkUserPaymentStatus(userId, organizationId, termId);
            
            if (!result) {
                return res.json({
                    success: true,
                    data: {
                        payment_required: true,
                        message: 'No payment record found for this term'
                    }
                });
            }
            
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Error in checkUserPaymentStatus:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to check payment status',
                error: error.message
            });
        }
    }

    // Delete payment
    static async deletePayment(req, res) {
        try {
            const { paymentId } = req.params;
            
            const deleted = await TermPaymentModel.deletePayment(paymentId);
            
            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    message: 'Payment not found or cannot be deleted'
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

    // Get payment by ID
    static async getPaymentById(paymentId) {
        try {
            const payment = await TermPaymentModel.getPaymentById(paymentId);
            return payment;
        } catch (error) {
            console.error('Error in getPaymentById:', error);
            throw error;
        }
    }

    // Get payments by user and organization
    static async getPaymentsByUserAndOrganization(req, res) {
        try {
            const { userId, organizationId } = req.params;
            
            // Check authorization
            if (req.user.user_id !== userId && req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }
            
            const payments = await TermPaymentModel.getPaymentsByUserAndOrganization(userId, organizationId);
            
            res.json({
                success: true,
                data: payments
            });
        } catch (error) {
            console.error('Error in getPaymentsByUserAndOrganization:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch payments',
                error: error.message
            });
        }
    }
}

module.exports = SimplifiedTermPaymentController;