// @ts-nocheck
// ===========================
// MOBILE SEMESTRAL PAYMENT CONTROLLERS
// ===========================

const { TermModel, TermPaymentModel, OrganizationTermConfigModel } = require('../../web/models/termPaymentModel');

class MobileSemestralPaymentController {
    /**
     * Get current active semester for mobile
     */
    static async getCurrentActiveSemester(req, res) {
        try {
            const semester = await TermModel.getCurrentActiveTerm();
            res.status(200).json({
                status: 'success',
                data: semester,
                message: semester ? 'Current semester retrieved successfully' : 'No active semester found'
            });
        } catch (error) {
            console.error('Error fetching current semester:', error);
            res.status(500).json({
                status: 'error',
                message: error.message || 'Failed to fetch current semester'
            });
        }
    }

    /**
     * Get user's semestral payments for mobile
     */
    static async getUserSemestralPayments(req, res) {
        try {
            const { user_id, organization_id } = req.query;
            
            if (!user_id) {
                return res.status(400).json({
                    status: 'error',
                    message: 'user_id is required'
                });
            }

            const payments = await TermPaymentModel.getUserTermPayments(
                user_id, organization_id
            );

            res.status(200).json({
                status: 'success',
                data: payments,
                count: payments.length,
                message: 'User semestral payments retrieved successfully'
            });
        } catch (error) {
            console.error('Error fetching user semestral payments:', error);
            res.status(500).json({
                status: 'error',
                message: error.message || 'Failed to fetch semestral payments'
            });
        }
    }

    /**
     * Get organization payment options for mobile (during application)
     */
    static async getOrganizationPaymentOptions(req, res) {
        try {
            const { organization_id } = req.params;
            
            if (!organization_id) {
                return res.status(400).json({
                    status: 'error',
                    message: 'organization_id is required'
                });
            }

            // Get organization details from organizationsModel
            const organizationsModel = require('../../web/models/organizationsModel');
            const organization = await organizationsModel.getOrganizationById(organization_id);

            if (!organization || organization.length === 0) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Organization not found'
                });
            }

            const orgData = organization[0];
            let paymentOptions = {
                organization_id: orgData.organization_id,
                organization_name: orgData.name,
                membership_fee_type: orgData.membership_fee_type,
                membership_fee_amount: orgData.membership_fee_amount
            };

            // If semestral payment, get the current semester configurations
            if (orgData.membership_fee_type === 'Per Semester') {
                const currentSemester = await TermModel.getCurrentActiveTerm();
                if (currentSemester) {
                    const semesterConfigs = await OrganizationTermConfigModel.getOrganizationTermConfigs(
                        organization_id, 1 // Assuming cycle 1 for new applications
                    );
                    
                    paymentOptions.current_semester = currentSemester;
                    paymentOptions.semestral_configs = semesterConfigs;
                    
                    // Calculate first semester payment if available
                    const firstSemesterConfig = semesterConfigs.find(config => 
                        config.semester_id === currentSemester.semester_id
                    );
                    if (firstSemesterConfig) {
                        paymentOptions.first_semester_fee = firstSemesterConfig.fee_amount;
                        paymentOptions.grace_period_days = firstSemesterConfig.grace_period_days;
                    }
                }
            }

            res.status(200).json({
                status: 'success',
                data: paymentOptions,
                message: 'Organization payment options retrieved successfully'
            });
        } catch (error) {
            console.error('Error fetching organization payment options:', error);
            res.status(500).json({
                status: 'error',
                message: error.message || 'Failed to fetch payment options'
            });
        }
    }

    /**
     * Create semestral payment during mobile organization application
     */
    static async createSemestralPaymentForApplication(req, res) {
        try {
            const { organization_id, user_id, semester_id, cycle_number, amount_due } = req.body;
            
            if (!organization_id || !user_id || !semester_id || !cycle_number || !amount_due) {
                return res.status(400).json({
                    status: 'error',
                    message: 'organization_id, user_id, semester_id, cycle_number, and amount_due are required'
                });
            }

            // Create the semestral payment with 30 days due date
            const due_date = new Date();
            due_date.setDate(due_date.getDate() + 30);

            const payment = await TermPaymentModel.createTermPayment({
                organization_id,
                cycle_number,
                user_id,
                semester_id,
                amount_due,
                due_date: due_date.toISOString().split('T')[0] // Format as YYYY-MM-DD
            });

            res.status(201).json({
                status: 'success',
                message: 'Semestral payment created successfully',
                data: payment
            });
        } catch (error) {
            console.error('Error creating semestral payment:', error);
            res.status(500).json({
                status: 'error',
                message: error.message || 'Failed to create semestral payment'
            });
        }
    }

    /**
     * Get payment status for a specific payment (mobile)
     */
    static async getPaymentStatus(req, res) {
        try {
            const { payment_id } = req.params;
            
            if (!payment_id) {
                return res.status(400).json({
                    status: 'error',
                    message: 'payment_id is required'
                });
            }

            const payment = await TermPaymentModel.getTermPaymentById(payment_id);

            if (!payment) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Payment not found'
                });
            }

            res.status(200).json({
                status: 'success',
                data: payment,
                message: 'Payment status retrieved successfully'
            });
        } catch (error) {
            console.error('Error fetching payment status:', error);
            res.status(500).json({
                status: 'error',
                message: error.message || 'Failed to fetch payment status'
            });
        }
    }

    /**
     * Get overdue payments for current user (mobile)
     */
    static async getUserOverduePayments(req, res) {
        try {
            const { user_id } = req.params;
            
            if (!user_id) {
                return res.status(400).json({
                    status: 'error',
                    message: 'user_id is required'
                });
            }

            const overduePayments = await TermPaymentModel.getUserOverduePayments(user_id);

            res.status(200).json({
                status: 'success',
                data: overduePayments,
                count: overduePayments.length,
                message: overduePayments.length > 0 ? 
                    `Found ${overduePayments.length} overdue payment(s)` : 
                    'No overdue payments found'
            });
        } catch (error) {
            console.error('Error fetching user overdue payments:', error);
            res.status(500).json({
                status: 'error',
                message: error.message || 'Failed to fetch overdue payments'
            });
        }
    }

    /**
     * Get user's payment summary (mobile dashboard)
     */
    static async getUserPaymentSummary(req, res) {
        try {
            const { user_id } = req.params;
            const { organization_id } = req.query;
            
            if (!user_id) {
                return res.status(400).json({
                    status: 'error',
                    message: 'user_id is required'
                });
            }

            // Get all user payments
            const allPayments = await TermPaymentModel.getUserTermPayments(user_id, organization_id);
            
            // Get overdue payments
            const overduePayments = await TermPaymentModel.getUserOverduePayments(user_id);
            
            // Calculate summary
            const summary = {
                total_payments: allPayments.length,
                paid_payments: allPayments.filter(p => p.payment_status === 'Paid').length,
                pending_payments: allPayments.filter(p => p.payment_status === 'Pending').length,
                overdue_payments: overduePayments.length,
                total_amount_due: allPayments.reduce((sum, p) => sum + parseFloat(p.amount_due || 0), 0),
                total_paid_amount: allPayments
                    .filter(p => p.payment_status === 'Paid')
                    .reduce((sum, p) => sum + parseFloat(p.amount_due || 0), 0),
                total_outstanding: allPayments
                    .filter(p => p.payment_status !== 'Paid')
                    .reduce((sum, p) => sum + parseFloat(p.amount_due || 0), 0)
            };

            res.status(200).json({
                status: 'success',
                data: {
                    summary,
                    recent_payments: allPayments.slice(0, 5), // Last 5 payments
                    overdue_payments: overduePayments
                },
                message: 'User payment summary retrieved successfully'
            });
        } catch (error) {
            console.error('Error fetching user payment summary:', error);
            res.status(500).json({
                status: 'error',
                message: error.message || 'Failed to fetch payment summary'
            });
        }
    }
}

module.exports = MobileSemestralPaymentController;
