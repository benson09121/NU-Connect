// ===========================
// ORGANIZATION SEMESTRAL PAYMENT EXTENSIONS
// ===========================

const { OrganizationTermConfigModel, TermPaymentModel } = require('../models/termPaymentModel');
const organizationsModel = require('../models/organizationsModel');
const { subscribeToChannel, publishToChannel } = require('./sseController');

/**
 * Extension controllers for organizations to handle semestral payment configurations
 */
class OrganizationSemestralExtensions {
    
    /**
     * Update organization to support semestral payment configuration
     */
    static async updateOrganizationSemestralConfig(req, res) {
        try {
            const { organization_id } = req.params;
            const { 
                membership_fee_type, 
                membership_fee_amount,
                semestral_configs // Array of semester configurations
            } = req.body;

            if (!organization_id) {
                return res.status(400).json({ 
                    success: false,
                    error: 'organization_id is required' 
                });
            }

            // Validate semestral payment configuration
            if (membership_fee_type === 'Per Semester') {
                if (!semestral_configs || !Array.isArray(semestral_configs) || semestral_configs.length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'semestral_configs array is required when membership_fee_type is "Per Semester"'
                    });
                }

                // Validate each semester configuration
                for (const config of semestral_configs) {
                    if (!config.semester_id || !config.cycle_number || config.fee_amount === undefined) {
                        return res.status(400).json({
                            success: false,
                            error: 'Each semestral config must have semester_id, cycle_number, and fee_amount'
                        });
                    }
                }
            }

            // First update the organization's membership fee type
            await organizationsModel.updateOrganizationPaymentType(organization_id, {
                membership_fee_type,
                membership_fee_amount
            });

            // If semestral payment type, create semester configurations
            if (membership_fee_type === 'Per Semester' && semestral_configs) {
                const results = [];
                
                for (const config of semestral_configs) {
                    try {
                        const semesterConfig = await OrganizationTermConfigModel.createOrganizationTermConfig({
                            organization_id: parseInt(organization_id),
                            cycle_number: config.cycle_number,
                            semester_id: config.semester_id,
                            fee_amount: config.fee_amount,
                            is_required: config.is_required !== false, // Default to true
                            auto_generate_payment: config.auto_generate_payment !== false, // Default to true
                            grace_period_days: config.grace_period_days || 30,
                            created_by: req.user.user_id
                        });
                        results.push(semesterConfig);
                    } catch (configError) {
                        // If configuration already exists, update it instead
                        if (configError.code === 'ER_DUP_ENTRY') {
                            console.log(`Configuration already exists for org ${organization_id}, semester ${config.semester_id}, cycle ${config.cycle_number}`);
                        } else {
                            throw configError;
                        }
                    }
                }

                // Broadcast updates
                publishToChannel(`org_semester_config_${organization_id}`, {
                    operation: 'BULK_CREATE',
                    data: results,
                    timestamp: new Date()
                });

                publishToChannel(`organizations_updated`, {
                    operation: 'UPDATE',
                    data: [{
                        organization_id,
                        membership_fee_type,
                        semestral_configs: results
                    }],
                    timestamp: new Date()
                });

                return res.status(200).json({
                    success: true,
                    message: 'Organization semestral payment configuration updated successfully',
                    data: {
                        organization_id,
                        membership_fee_type,
                        semestral_configs: results
                    }
                });
            }

            // For non-semestral payment types, just return success
            publishToChannel(`organizations_updated`, {
                operation: 'UPDATE',
                data: [{
                    organization_id,
                    membership_fee_type
                }],
                timestamp: new Date()
            });

            res.status(200).json({
                success: true,
                message: 'Organization payment configuration updated successfully',
                data: {
                    organization_id,
                    membership_fee_type
                }
            });

        } catch (error) {
            console.error('Error updating organization semestral config:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'An error occurred while updating organization semestral configuration'
            });
        }
    }

    /**
     * Get organization with semestral payment details
     */
    static async getOrganizationWithSemestralConfig(req, res) {
        try {
            const { organization_id } = req.params;
            const { sessionId } = req.query;

            if (!organization_id) {
                return res.status(400).json({ 
                    success: false,
                    error: 'organization_id is required' 
                });
            }

            // Get basic organization info
            const organization = await organizationsModel.getOrganizationById(organization_id);

            if (!organization || organization.length === 0) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Organization not found' 
                });
            }

            const orgData = organization[0];

            // If it's a semestral payment organization, get the configurations
            if (orgData.membership_fee_type === 'Per Semester') {
                // Get all semester configurations for this organization
                const semestralConfigs = await OrganizationTermConfigModel.getOrganizationAllTermConfigs(organization_id);
                
                orgData.semestral_configs = semestralConfigs;
            }

            if (sessionId) {
                subscribeToChannel(sessionId, `organization_details_${organization_id}`);
            }

            res.status(200).json({
                success: true,
                data: orgData,
                message: 'Organization details retrieved successfully'
            });

        } catch (error) {
            console.error('Error fetching organization with semestral config:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'An error occurred while fetching organization details'
            });
        }
    }

    /**
     * Generate semestral payments for all members of an organization
     */
    static async generateAllSemestralPayments(req, res) {
        try {
            const { organization_id } = req.params;
            const { cycle_number, semester_id } = req.body;

            if (!organization_id || !cycle_number || !semester_id) {
                return res.status(400).json({
                    success: false,
                    error: 'organization_id, cycle_number, and semester_id are required'
                });
            }

            // Check if organization uses semestral payment
            const organization = await organizationsModel.getOrganizationById(organization_id);
            
            if (!organization || organization.length === 0) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Organization not found' 
                });
            }

            if (organization[0].membership_fee_type !== 'Per Semester') {
                return res.status(400).json({
                    success: false,
                    error: 'Organization does not use semestral payment system'
                });
            }

            // Generate payments for all organization members
            const result = await TermPaymentModel.generateTermPaymentsForOrganization(
                organization_id, cycle_number, semester_id
            );

            publishToChannel(`semestral_payments_${organization_id}`, {
                operation: 'BULK_GENERATE',
                data: [result],
                timestamp: new Date()
            });

            res.status(201).json({
                success: true,
                message: 'Semestral payments generated successfully',
                data: {
                    organization_id,
                    cycle_number,
                    semester_id,
                    result
                }
            });

        } catch (error) {
            console.error('Error generating semestral payments:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'An error occurred while generating semestral payments'
            });
        }
    }

    /**
     * Get organization payment analytics including semestral payment data
     */
    static async getOrganizationPaymentAnalytics(req, res) {
        try {
            const { organization_id } = req.params;
            const { semester_id } = req.query;

            if (!organization_id) {
                return res.status(400).json({ 
                    success: false,
                    error: 'organization_id is required' 
                });
            }
            
            // Get payment summary
            const paymentSummary = await TermPaymentModel.getOrganizationTermPaymentSummary(
                organization_id, semester_id
            );

            // Get overdue payments
            const overduePayments = await TermPaymentModel.getOverduePayments(organization_id);

            const analytics = {
                organization_id,
                semester_id,
                payment_summary: paymentSummary,
                overdue_payments: overduePayments,
                generated_at: new Date()
            };

            res.status(200).json({
                success: true,
                data: analytics,
                message: 'Organization payment analytics retrieved successfully'
            });

        } catch (error) {
            console.error('Error fetching organization payment analytics:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'An error occurred while fetching payment analytics'
            });
        }
    }
}

module.exports = OrganizationSemestralExtensions;
