// ===========================
// SIMPLIFIED TERM PAYMENT MODELS FOR TWO TABLES
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
                    academic_year,
                    term_name,
                    term_description,
                    start_date,
                    end_date,
                    created_at,
                    updated_at,
                    created_by,
                    -- Calculated field: is term currently active based on dates
                    (CURDATE() BETWEEN start_date AND end_date) AS is_current_term
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
            // Validate date range
            if (new Date(termData.end_date) <= new Date(termData.start_date)) {
                throw new Error('End date must be after start date');
            }
            
            // Create new term (no is_active column - date ranges determine active status)
            const [result] = await connection.query(`
                INSERT INTO tbl_academic_term (
                    academic_year, 
                    term_name, 
                    term_description,
                    start_date, 
                    end_date, 
                    created_by
                ) VALUES (?, ?, ?, ?, ?, ?)
            `, [
                termData.academic_year,
                termData.term_name,
                termData.term_description || null,
                termData.start_date,
                termData.end_date,
                termData.created_by
            ]);
            
            return result.insertId;
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
            // Validate date range if dates are being updated
            if (termData.start_date && termData.end_date) {
                if (new Date(termData.end_date) <= new Date(termData.start_date)) {
                    throw new Error('End date must be after start date');
                }
            }
            
            // Build dynamic UPDATE query based on provided fields
            const updates = [];
            const values = [];
            
            if (termData.academic_year !== undefined) {
                updates.push('academic_year = ?');
                values.push(termData.academic_year);
            }
            if (termData.term_name !== undefined) {
                updates.push('term_name = ?');
                values.push(termData.term_name);
            }
            if (termData.term_description !== undefined) {
                updates.push('term_description = ?');
                values.push(termData.term_description);
            }
            if (termData.start_date !== undefined) {
                updates.push('start_date = ?');
                values.push(termData.start_date);
            }
            if (termData.end_date !== undefined) {
                updates.push('end_date = ?');
                values.push(termData.end_date);
            }
            
            if (updates.length === 0) {
                throw new Error('No fields to update');
            }
            
            updates.push('updated_at = NOW()');
            values.push(termId);
            
            const [result] = await connection.query(`
                UPDATE tbl_academic_term 
                SET ${updates.join(', ')}
                WHERE term_id = ?
            `, values);
            
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
            // First check if there are any payment records for this term
            const [paymentCheck] = await connection.query(`
                SELECT COUNT(*) as count FROM tbl_term_payments WHERE term_id = ?
            `, [termId]);
            
            if (paymentCheck[0].count > 0) {
                throw new Error('Cannot delete term. Payment records exist for this term.');
            }
            
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

// 2. Term Payment Model - Simplified for two tables
class TermPaymentModel {
    // Get user payments for specific organization
    static async getPaymentsByUser(userId, organizationId = null) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query('CALL GetUserTermPayments(?, ?)', [
                userId, organizationId
            ]);
            
            return rows[0];
        } catch (error) {
            console.error('Error fetching user payments:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Create term payment with transaction
    static async createTermPaymentWithTransaction(paymentData) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query('CALL CreateTermPaymentWithTransaction(?, ?, ?, ?)', [
                paymentData.user_id,
                paymentData.organization_id,
                paymentData.term_id,
                paymentData.receipt_path
            ]);
            
            return rows[0][0];
        } catch (error) {
            console.error('Error creating term payment with transaction:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Update payment receipt
    static async updatePaymentReceipt(paymentId, receiptPath, notes, userId) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query('CALL UpdateTermPaymentReceipt(?, ?, ?, ?)', [
                paymentId, receiptPath, notes, userId
            ]);
            
            return rows[0][0];
        } catch (error) {
            console.error('Error updating payment receipt:', error);
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
                SELECT 
                    mtp.*,
                    at.term_name,
                    at.academic_year,
                    o.name as organization_name,
                    t.receipt_no,
                    t.proof_of_payment,
                    t.notes
                FROM tbl_term_payments mtp
                JOIN tbl_academic_term at ON mtp.term_id = at.term_id
                JOIN tbl_organization o ON mtp.organization_id = o.organization_id
                LEFT JOIN tbl_transaction t ON mtp.transaction_id = t.transaction_id
                WHERE mtp.payment_id = ?
            `, [paymentId]);
            
            return rows[0] || null;
        } catch (error) {
            console.error('Error fetching payment by ID:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get organization payment submissions
    static async getOrganizationPaymentSubmissions(organizationId, organizationVersionId = null) {
        const connection = await pool.getConnection();
        try {
            console.log('[DEBUG] Getting organization payment submissions for org ID:', organizationId, 'version ID:', organizationVersionId);
            
            // First check if the table and columns exist
            try {
                const [tableInfo] = await connection.query('DESCRIBE tbl_term_payments');
                console.log('[DEBUG] tbl_term_payments structure:', tableInfo.map(col => col.Field));
            } catch (describeError) {
                console.log('[DEBUG] Error describing table:', describeError.message);
            }
            
            // Try to call the stored procedure with organization_version_id
            try {
                const [rows] = await connection.query('CALL GetPendingTermPayments(?, ?, ?)', [
                    organizationId, organizationVersionId, null
                ]);
                return rows[0];
            } catch (procError) {
                console.log('[DEBUG] Stored procedure failed, trying fallback:', procError.message);
                // Fallback to direct query if stored procedure fails
                const fallbackQuery = `
                    SELECT 
                        tp.payment_id,
                        tp.user_id,
                        tp.organization_id,
                        tp.organization_version_id,
                        tp.term_id,
                        CONCAT(u.f_name, ' ', u.l_name) as member_name,
                        u.email as member_email,
                        o.name as organization_name,
                        at.term_name,
                        tp.payment_status,
                        tp.created_at,
                        t.amount as payment_amount,
                        t.receipt_no as transaction_reference,
                        t.proof_image as receipt_url
                    FROM tbl_term_payments tp
                    JOIN tbl_user u ON tp.user_id = u.user_id
                    JOIN tbl_organization o ON tp.organization_id = o.organization_id
                    JOIN tbl_academic_term at ON tp.term_id = at.term_id
                    LEFT JOIN tbl_transaction t ON tp.transaction_id = t.transaction_id
                    WHERE tp.organization_id = ? 
                    AND (? IS NULL OR tp.organization_version_id = ?)
                    AND tp.payment_status = 'Pending'
                    ORDER BY tp.created_at ASC
                `;
                
                const [fallbackRows] = await connection.query(fallbackQuery, [
                    organizationId, organizationVersionId, organizationVersionId
                ]);
                console.log('[DEBUG] Fallback query successful, returning', fallbackRows.length, 'rows');
                return fallbackRows;
            }
        } catch (error) {
            console.error('Error fetching organization payment submissions:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Update payment status
    static async updatePaymentStatus(paymentId, status, updatedBy, notes = null, verifiedBy = null) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Update the term payment with verification details
            await connection.query(`
                UPDATE tbl_term_payments 
                SET payment_status = ?, 
                    notes = COALESCE(?, notes),
                    verified_by = COALESCE(?, verified_by),
                    verified_at = CASE WHEN ? IN ('Paid', 'Rejected') THEN NOW() ELSE verified_at END,
                    updated_at = NOW()
                WHERE payment_id = ?
            `, [status, notes, verifiedBy, status, paymentId]);
            
            // Get the related transaction_id for updating transaction status
            const [paymentData] = await connection.query(`
                SELECT transaction_id FROM tbl_term_payments WHERE payment_id = ?
            `, [paymentId]);

            if (paymentData.length > 0) {
                const transactionId = paymentData[0].transaction_id;
                
                // Update related transaction status (using correct table name)
                const transactionStatus = status === 'Paid' ? 'Completed' : 
                                        status === 'Rejected' ? 'Failed' : 'Pending';
                
                await connection.query(`
                    UPDATE tbl_transaction 
                    SET status = ?, updated_at = NOW()
                    WHERE transaction_id = ?
                `, [transactionStatus, transactionId]);
            }

            await connection.commit();
            
            // Return the updated payment details
            const [result] = await connection.query(`
                SELECT payment_id, payment_status, notes, verified_by, verified_at, updated_at
                FROM tbl_term_payments 
                WHERE payment_id = ?
            `, [paymentId]);
            
            return result[0];
        } catch (error) {
            await connection.rollback();
            console.error('Error updating payment status:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get payment by ID
    static async getPaymentById(paymentId) {
        const connection = await pool.getConnection();
        try {
            const [result] = await connection.query(`
                SELECT tp.*, t.organization_id
                FROM tbl_term_payments tp
                LEFT JOIN tbl_transactions t ON tp.payment_id = t.payment_id
                WHERE tp.payment_id = ?
            `, [paymentId]);
            
            return result[0];
        } catch (error) {
            console.error('Error getting payment by ID:', error);
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
                dbStatus = 'Rejected';
            }
            
            const [result] = await connection.query(`
                UPDATE tbl_term_payments 
                SET 
                    payment_status = ?,
                    paid_date = CASE WHEN ? = 'Paid' THEN NOW() ELSE paid_date END,
                    updated_at = NOW()
                WHERE payment_id = ?
            `, [dbStatus, dbStatus, paymentId]);
            
            if (result.affectedRows === 0) {
                return null;
            }
            
            // Return the updated payment record
            const [updatedPayment] = await connection.query(`
                SELECT 
                    mtp.*,
                    CASE 
                        WHEN mtp.payment_status = 'Paid' THEN 'Approved'
                        WHEN mtp.payment_status = 'Rejected' THEN 'Rejected'
                        ELSE mtp.payment_status
                    END as payment_status,
                    CONCAT(u.f_name, ' ', u.l_name) as submitter_name
                FROM tbl_term_payments mtp
                LEFT JOIN tbl_user u ON mtp.user_id = u.user_id
                WHERE mtp.payment_id = ?
            `, [paymentId]);
            
            return updatedPayment[0];
        } catch (error) {
            console.error('Error updating payment submission status:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get payments by user and organization
    static async getPaymentsByUserAndOrganization(userId, organizationId) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query(`
                SELECT 
                    mtp.*,
                    at.term_name,
                    at.academic_year,
                    at.start_date,
                    at.end_date,
                    o.name as organization_name,
                    t.receipt_no,
                    t.proof_of_payment,
                    t.notes
                FROM tbl_term_payments mtp
                JOIN tbl_academic_term at ON mtp.term_id = at.term_id
                JOIN tbl_organization o ON mtp.organization_id = o.organization_id
                LEFT JOIN tbl_transaction t ON mtp.transaction_id = t.transaction_id
                WHERE mtp.user_id = ? AND mtp.organization_id = ?
                ORDER BY mtp.created_at DESC
            `, [userId, organizationId]);
            
            return rows;
        } catch (error) {
            console.error('Error fetching payments by user and organization:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Delete payment
    static async deletePayment(paymentId) {
        const connection = await pool.getConnection();
        try {
            const [result] = await connection.query(`
                DELETE FROM tbl_term_payments 
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

    // Generate term payments for organization
    static async generateTermPaymentsForOrganization(organizationId, termId = null) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query('CALL GenerateTermPaymentsForSpecificOrganization(?, ?)', [
                organizationId, termId
            ]);
            
            return rows[0][0];
        } catch (error) {
            console.error('Error generating term payments:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Check user payment status
    static async checkUserPaymentStatus(userId, organizationId, termId) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query('CALL CheckUserTermPaymentStatus(?, ?, ?)', [
                userId, organizationId, termId
            ]);
            
            return rows[0][0] || null;
        } catch (error) {
            console.error('Error checking user payment status:', error);
            throw error;
        } finally {
            connection.release();
        }
    }
}

// Export all models
module.exports = {
    TermModel,
    TermPaymentModel
};