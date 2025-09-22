// ===========================
// TERM PAYMENT MODELS
// ===========================

const pool = require('../../config/db');

// 1. Term Model - Handles academic term management
class TermModel {
    // Get the currently active term
    static async getCurrentActiveTerm() {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query('CALL GetCurrentActiveTerm()');
            return rows[0][0] || null;
        } catch (error) {
            console.error('Error fetching current active term:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get all terms
    static async getAllTerms() {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query(`
                SELECT 
                    term_id,
                    YEAR(start_date) as academic_year,
                    term_name,
                    start_date,
                    end_date,
                    is_active,
                    created_at
                FROM tbl_academic_term 
                ORDER BY start_date DESC
            `);
            return rows;
        } catch (error) {
            console.error('Error fetching all terms:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Create a new term
    static async createTerm(termData) {
        const connection = await pool.getConnection();
        try {
            const { academic_year, term_name, start_date, end_date, created_by } = termData;
            
            // Deactivate other terms if this is being set as active
            if (termData.is_active) {
                await connection.query('UPDATE tbl_academic_term SET is_active = FALSE');
            }
            
            const [result] = await connection.query(`
                INSERT INTO tbl_academic_term (
                    academic_year, term_name, start_date, end_date, 
                    is_active, created_by
                ) VALUES (?, ?, ?, ?, ?, ?)
            `, [academic_year, term_name, start_date, end_date, termData.is_active || false, created_by]);
            
            return { term_id: result.insertId, ...termData };
        } catch (error) {
            console.error('Error creating term:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Update term
    static async updateTerm(termId, termData) {
        const connection = await pool.getConnection();
        try {
            // If setting as active, deactivate others first
            if (termData.is_active) {
                await connection.query('UPDATE tbl_academic_term SET is_active = FALSE');
            }
            
            const [result] = await connection.query(`
                UPDATE tbl_academic_term 
                SET academic_year = ?, term_name = ?, start_date = ?, 
                    end_date = ?, is_active = ?
                WHERE term_id = ?
            `, [
                termData.academic_year,
                termData.term_name,
                termData.start_date,
                termData.end_date,
                termData.is_active || false,
                termId
            ]);
            
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error updating term:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Delete term (only if no payments exist)
    static async deleteTerm(termId) {
        const connection = await pool.getConnection();
        try {
            const [result] = await connection.query(`
                DELETE FROM tbl_academic_term WHERE term_id = ?
            `, [termId]);
            
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error deleting term:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get term by ID
    static async getTermById(termId) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query(`
                SELECT * FROM tbl_academic_term WHERE term_id = ?
            `, [termId]);
            
            return rows[0] || null;
        } catch (error) {
            console.error('Error fetching term by ID:', error);
            throw error;
        } finally {
            connection.release();
        }
    }
}

// 2. Term Payment Model - Handles individual payment records
class TermPaymentModel {
    // Create a new term payment
    static async createTermPayment(paymentData) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query('CALL CreateTermPayment(?, ?, ?, ?, ?, ?)', [
                paymentData.organization_id,
                paymentData.cycle_number,
                paymentData.user_id,
                paymentData.term_id,
                paymentData.amount_due,
                paymentData.due_date
            ]);
            
            return rows[0][0];
        } catch (error) {
            console.error('Error creating term payment:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Process payment transaction with transaction system integration
    static async processPaymentTransaction(paymentId, paymentMethod, transactionReference) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query('CALL ProcessTermPaymentTransaction(?, ?, ?)', [
                paymentId, paymentMethod, transactionReference
            ]);
            
            return rows[0][0];
        } catch (error) {
            console.error('Error processing payment transaction:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get transaction details for a payment
    static async getPaymentTransactionDetails(paymentId) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query(`
                SELECT 
                    mtp.payment_id,
                    mtp.transaction_id,
                    t.receipt_no,
                    t.transaction_date,
                    t.status as transaction_status,
                    t.payer_name,
                    t.amount,
                    pt.label as payment_method,
                    fc.label as category
                FROM tbl_membership_term_payment mtp
                LEFT JOIN tbl_transaction t ON mtp.transaction_id = t.transaction_id
                LEFT JOIN tbl_payment_type pt ON t.payment_type_id = pt.payment_type_id
                LEFT JOIN tbl_financial_category fc ON t.category_id = fc.category_id
                WHERE mtp.payment_id = ?
            `, [paymentId]);
            
            return rows[0] || null;
        } catch (error) {
            console.error('Error fetching payment transaction details:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Create direct payment with transaction (for SDAO approvals)
    static async createDirectPaymentWithTransaction(paymentData) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // First create the term payment
            const [paymentResult] = await connection.query('CALL CreateTermPayment(?, ?, ?, ?, ?, ?)', [
                paymentData.applicationId,
                paymentData.termId,
                paymentData.organizationId,
                paymentData.orgVersionId,
                paymentData.userId,
                paymentData.paymentAmount
            ]);

            const paymentId = paymentResult[0][0].payment_id;

            // Then process the transaction (creates transaction record)
            await connection.query('CALL ProcessTermPaymentTransaction(?, ?, ?)', [
                paymentId,
                paymentData.paymentMethod || 'Cash',
                paymentData.transactionReference || null
            ]);

            await connection.commit();

            // Return the complete payment with transaction details
            const [finalResult] = await connection.query(`
                SELECT * FROM vw_term_payment_overview 
                WHERE payment_id = ?
            `, [paymentId]);

            return finalResult[0];
        } catch (error) {
            await connection.rollback();
            console.error('Error creating direct payment with transaction:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get payment by ID
    static async getPaymentById(paymentId) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query(`
                SELECT * FROM vw_term_payment_overview 
                WHERE payment_id = ?
            `, [paymentId]);
            
            return rows[0] || null;
        } catch (error) {
            console.error('Error fetching payment by ID:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get payments for user
    static async getPaymentsByUser(userId, organizationId = null) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query('CALL GetMemberTermPaymentHistory(?, ?)', [
                userId, organizationId
            ]);
            
            return rows[0];
        } catch (error) {
            console.error('Error fetching payments by user:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get payments for organization
    static async getPaymentsByOrganization(organizationId, termId = null, status = null) {
        const connection = await pool.getConnection();
        try {
            let query = `
                SELECT * FROM vw_term_payment_overview 
                WHERE organization_id = ?
            `;
            const params = [organizationId];

            if (termId) {
                query += ' AND term_id = ?';
                params.push(termId);
            }

            if (status) {
                query += ' AND payment_status = ?';
                params.push(status);
            }

            query += ' ORDER BY due_date DESC, member_name ASC';

            const [rows] = await connection.query(query, params);
            return rows;
        } catch (error) {
            console.error('Error fetching payments by organization:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Update payment status manually
    static async updatePaymentStatus(paymentId, status, updatedBy) {
        const connection = await pool.getConnection();
        try {
            const [result] = await connection.query(`
                UPDATE tbl_membership_term_payment 
                SET payment_status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE payment_id = ?
            `, [status, paymentId]);

            if (result.affectedRows > 0) {
                // Log the action
                await connection.query('CALL LogAction(?, ?, ?, ?, ?, ?)', [
                    updatedBy,
                    `Manually updated payment status to ${status}`,
                    'TERM_PAYMENT_STATUS_UPDATE',
                    JSON.stringify({ payment_id: paymentId, new_status: status }),
                    null,
                    null
                ]);
            }

            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error updating payment status:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Delete payment (admin only)
    static async deletePayment(paymentId) {
        const connection = await pool.getConnection();
        try {
            const [result] = await connection.query(`
                DELETE FROM tbl_membership_term_payment 
                WHERE payment_id = ? AND payment_status = 'Pending'
            `, [paymentId]);
            
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error deleting payment:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // ===================
    // MOBILE-SPECIFIC METHODS
    // ===================

    // Get payments by user and organization (for mobile app)
    static async getPaymentsByUserAndOrganization(userId, organizationId) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query(`
                SELECT 
                    tp.payment_id,
                    tp.membership_id,
                    tp.term_id,
                    tp.organization_id,
                    tp.user_id,
                    tp.payment_amount as amount_due,
                    tp.payment_status,
                    tp.payment_method,
                    tp.transaction_reference,
                    tp.payment_date,
                    tp.due_date,
                    tp.late_fee_applied,
                    tp.notes,
                    tp.receipt_path,
                    tp.created_at,
                    tp.updated_at,
                    t.term_name,
                    t.start_date as term_start,
                    t.end_date as term_end,
                    o.name as organization_name
                FROM tbl_term_payments tp
                JOIN tbl_academic_term t ON tp.term_id = t.term_id
                JOIN tbl_organization o ON tp.organization_id = o.organization_id
                WHERE tp.user_id = ? AND tp.organization_id = ?
                ORDER BY tp.due_date DESC
            `, [userId, organizationId]);
            
            return rows;
        } catch (error) {
            console.error('Error fetching payments by user and organization:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Update payment with receipt information
    static async updatePaymentReceipt(paymentId, filename, notes, userId) {
        const connection = await pool.getConnection();
        try {
            const [result] = await connection.query(`
                UPDATE tbl_term_payments 
                SET 
                    receipt_path = ?,
                    notes = ?,
                    payment_status = 'Pending',
                    updated_at = NOW()
                WHERE payment_id = ? AND user_id = ?
            `, [filename, notes, paymentId, userId]);
            
            if (result.affectedRows === 0) {
                throw new Error('Payment not found or access denied');
            }
            
            return { 
                success: true, 
                receiptPath: filename,
                status: 'Pending'
            };
        } catch (error) {
            console.error('Error updating payment receipt:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Enhanced payment status update with additional fields
    static async updatePaymentStatusEnhanced(paymentId, status, paymentMethod = null, transactionReference = null, userId) {
        const connection = await pool.getConnection();
        try {
            let query = `
                UPDATE tbl_term_payments 
                SET 
                    payment_status = ?,
                    updated_at = NOW()
            `;
            let params = [status];
            
            if (paymentMethod) {
                query += `, payment_method = ?`;
                params.push(paymentMethod);
            }
            
            if (transactionReference) {
                query += `, transaction_reference = ?`;
                params.push(transactionReference);
            }
            
            if (status === 'Paid' || status === 'Processing') {
                query += `, payment_date = NOW()`;
            }
            
            query += ` WHERE payment_id = ?`;
            params.push(paymentId);
            
            if (userId) {
                query += ` AND user_id = ?`;
                params.push(userId);
            }
            
            const [result] = await connection.query(query, params);
            
            if (result.affectedRows === 0) {
                throw new Error('Payment not found or access denied');
            }
            
            return { 
                success: true, 
                status,
                transactionReference
            };
        } catch (error) {
            console.error('Error updating payment status enhanced:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get payment submissions for organization management (with user details)
    static async getOrganizationPaymentSubmissions(organizationId) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query(`
                SELECT 
                    tp.payment_id,
                    tp.user_id,
                    tp.term_id,
                    tp.organization_id,
                    tp.payment_amount as amount_due,
                    tp.payment_status,
                    tp.payment_date,
                    tp.receipt_path as screenshot_path,
                    tp.notes,
                    tp.created_at as submitted_at,
                    tp.updated_at,
                    u.f_name as first_name,
                    u.l_name as last_name,
                    CONCAT(u.f_name, ' ', u.l_name) as submitter_name,
                    u.email as submitter_email,
                    at.term_name,
                    YEAR(at.start_date) as academic_year
                FROM tbl_term_payments tp
                LEFT JOIN tbl_user u ON tp.user_id = u.user_id
                LEFT JOIN tbl_academic_term at ON tp.term_id = at.term_id
                WHERE tp.organization_id = ?
                AND tp.receipt_path IS NOT NULL
                ORDER BY tp.created_at DESC
            `, [organizationId]);
            
            return rows;
        } catch (error) {
            console.error('Error fetching organization payment submissions:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Update payment submission status (for organization presidents)
    static async updatePaymentSubmissionStatus(paymentId, status, updatedBy) {
        const connection = await pool.getConnection();
        try {
            // Map frontend status to database status
            let dbStatus = status;
            if (status === 'Approved') {
                dbStatus = 'Paid';
            } else if (status === 'Rejected') {
                dbStatus = 'Cancelled';
            }
            
            const [result] = await connection.query(`
                UPDATE tbl_term_payments 
                SET 
                    payment_status = ?,
                    verified_by = ?,
                    verified_at = NOW(),
                    updated_at = NOW()
                WHERE payment_id = ?
            `, [dbStatus, updatedBy, paymentId]);
            
            if (result.affectedRows === 0) {
                return null;
            }
            
            // Return updated payment info with mapped status back to frontend format
            const [updatedPayment] = await connection.query(`
                SELECT 
                    tp.*,
                    CASE 
                        WHEN tp.payment_status = 'Paid' THEN 'Approved'
                        WHEN tp.payment_status = 'Cancelled' THEN 'Rejected'
                        ELSE tp.payment_status
                    END as payment_status,
                    tp.receipt_path as screenshot_path,
                    CONCAT(u.f_name, ' ', u.l_name) as submitter_name
                FROM tbl_term_payments tp
                LEFT JOIN tbl_user u ON tp.user_id = u.user_id
                WHERE tp.payment_id = ?
            `, [paymentId]);
            
            return updatedPayment[0];
        } catch (error) {
            console.error('Error updating payment submission status:', error);
            throw error;
        } finally {
            connection.release();
        }
    }
}

// 3. Organization Term Configuration Model
class OrganizationTermConfigModel {
    // Create or update organization term configuration
    static async setOrganizationTermConfig(configData) {
        const connection = await pool.getConnection();
        try {
            const [result] = await connection.query(`
                INSERT INTO tbl_organization_term_config (
                    organization_id, term_id, fee_amount, grace_period_days, 
                    is_required, created_by
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    fee_amount = VALUES(fee_amount),
                    grace_period_days = VALUES(grace_period_days),
                    is_required = VALUES(is_required),
                    updated_at = CURRENT_TIMESTAMP
            `, [
                configData.organization_id,
                configData.term_id,
                configData.fee_amount,
                configData.grace_period_days || 30,
                configData.is_required || true,
                configData.created_by
            ]);
            
            return { 
                success: true, 
                config_id: result.insertId || configData.organization_id 
            };
        } catch (error) {
            console.error('Error setting organization term config:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get organization term configuration
    static async getOrganizationTermConfig(organizationId, termId = null) {
        const connection = await pool.getConnection();
        try {
            let query = `
                SELECT 
                    otc.*,
                    at.academic_year,
                    at.term_name,
                    at.start_date,
                    at.end_date
                FROM tbl_organization_term_config otc
                JOIN tbl_academic_term at ON otc.term_id = at.term_id
                WHERE otc.organization_id = ?
            `;
            const params = [organizationId];

            if (termId) {
                query += ' AND otc.term_id = ?';
                params.push(termId);
            }

            query += ' ORDER BY at.academic_year DESC, at.start_date DESC';

            const [rows] = await connection.query(query, params);
            return termId ? (rows[0] || null) : rows;
        } catch (error) {
            console.error('Error fetching organization term config:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Generate payments for organization
    static async generatePaymentsForOrganization(organizationId, cycleNumber, termId) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query('CALL GenerateTermPaymentsForOrganization(?, ?, ?)', [
                organizationId, cycleNumber, termId
            ]);
            
            return rows[0][0];
        } catch (error) {
            console.error('Error generating payments for organization:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Delete organization term configuration
    static async deleteOrganizationTermConfig(organizationId, termId) {
        const connection = await pool.getConnection();
        try {
            const [result] = await connection.query(`
                DELETE FROM tbl_organization_term_config 
                WHERE organization_id = ? AND term_id = ?
            `, [organizationId, termId]);
            
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error deleting organization term config:', error);
            throw error;
        } finally {
            connection.release();
        }
    }
}

// 4. Analytics Model for term payments
class TermPaymentAnalyticsModel {
    // Get payment analytics for organization
    static async getOrganizationPaymentAnalytics(organizationId, termId) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query('CALL GetTermPaymentAnalytics(?, ?)', [
                organizationId, termId
            ]);
            
            return rows[0][0] || {};
        } catch (error) {
            console.error('Error fetching payment analytics:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get overall system analytics
    static async getSystemPaymentAnalytics(termId = null) {
        const connection = await pool.getConnection();
        try {
            let query = `
                SELECT 
                    COUNT(DISTINCT mtp.organization_id) as active_organizations,
                    COUNT(DISTINCT mtp.user_id) as total_paying_members,
                    COUNT(*) as total_payments,
                    SUM(CASE WHEN mtp.payment_status = 'Paid' THEN 1 ELSE 0 END) as paid_payments,
                    SUM(CASE WHEN mtp.payment_status = 'Pending' THEN 1 ELSE 0 END) as pending_payments,
                    SUM(CASE WHEN mtp.payment_status = 'Overdue' THEN 1 ELSE 0 END) as overdue_payments,
                    SUM(CASE WHEN mtp.payment_status = 'Paid' THEN mtp.payment_amount ELSE 0 END) as total_revenue,
                    SUM(CASE WHEN mtp.payment_status != 'Paid' THEN mtp.payment_amount ELSE 0 END) as outstanding_amount,
                    AVG(mtp.payment_amount) as average_payment_amount
                FROM tbl_membership_term_payment mtp
            `;
            const params = [];

            if (termId) {
                query += ' WHERE mtp.term_id = ?';
                params.push(termId);
            }

            const [rows] = await connection.query(query, params);
            return rows[0] || {};
        } catch (error) {
            console.error('Error fetching system payment analytics:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get payment trends over time
    static async getPaymentTrends(organizationId = null) {
        const connection = await pool.getConnection();
        try {
            let query = `
                SELECT 
                    YEAR(at.start_date) as academic_year,
                    at.term_name,
                    COUNT(*) as total_payments,
                    SUM(CASE WHEN mtp.payment_status = 'Paid' THEN 1 ELSE 0 END) as paid_payments,
                    SUM(CASE WHEN mtp.payment_status = 'Paid' THEN mtp.payment_amount ELSE 0 END) as revenue
                FROM tbl_membership_term_payment mtp
                JOIN tbl_academic_term at ON mtp.term_id = at.term_id
            `;
            const params = [];

            if (organizationId) {
                query += ' WHERE mtp.organization_id = ?';
                params.push(organizationId);
            }

            query += ` 
                GROUP BY at.term_id, at.academic_year, at.term_name
                ORDER BY at.academic_year DESC, at.start_date DESC
            `;

            const [rows] = await connection.query(query, params);
            return rows;
        } catch (error) {
            console.error('Error fetching payment trends:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Alias method for mobile controller compatibility
    static async getOrganizationAnalytics(organizationId, termId = null) {
        return await this.getOrganizationPaymentAnalytics(organizationId, termId);
    }
}

// 5. Utility functions for term payments
class TermPaymentUtilsModel {
    // Update overdue payments
    static async updateOverduePayments() {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query('CALL UpdateOverdueTermPayments()');
            return rows[0][0];
        } catch (error) {
            console.error('Error updating overdue payments:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get payment settings
    static async getPaymentSettings() {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query(`
                SELECT setting_key, setting_value, description 
                FROM tbl_term_payment_settings
            `);
            
            const settings = {};
            rows.forEach(row => {
                settings[row.setting_key] = {
                    value: row.setting_value,
                    description: row.description
                };
            });
            
            return settings;
        } catch (error) {
            console.error('Error fetching payment settings:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Update payment setting
    static async updatePaymentSetting(settingKey, settingValue, updatedBy) {
        const connection = await pool.getConnection();
        try {
            const [result] = await connection.query(`
                UPDATE tbl_term_payment_settings 
                SET setting_value = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
                WHERE setting_key = ?
            `, [settingValue, updatedBy, settingKey]);
            
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error updating payment setting:', error);
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = {
    TermModel,
    TermPaymentModel,
    OrganizationTermConfigModel,
    TermPaymentAnalyticsModel,
    TermPaymentUtilsModel
};