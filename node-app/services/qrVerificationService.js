const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mysql = require('../config/db');

/**
 * QR Verification Service
 * Handles JWT token generation, verification, and QR code data management
 */
class QRVerificationService {
    constructor() {
        // JWT Configuration - these should be in environment variables
        this.jwtSecret = process.env.JWT_SECRET_KEY || 'your-256-bit-secret-key-for-qr-verification';
        this.jwtAlgorithm = 'HS256';
        this.jwtIssuer = 'nuconnect-system';
        this.jwtAudience = 'nuconnect-verifier';
        this.defaultExpiryDays = 365;
        
        // Frontend URL for QR verification - supports both development and production
        this.verificationBaseUrl = this.getVerificationBaseUrl();
    }

    /**
     * Get the appropriate base URL for QR verification
     * Handles both development (localhost) and production environments
     */
    getVerificationBaseUrl() {
        // Check for explicit frontend URL in environment
        if (process.env.FRONTEND_URL) {
            return process.env.FRONTEND_URL;
        }

        // Check for production domain
        if (process.env.DOMAIN) {
            return `https://${process.env.DOMAIN}`;
        }

        // Check NODE_ENV for environment-specific defaults
        if (process.env.NODE_ENV === 'production') {
            return 'https://nuconnect.nu-dasma.edu.ph'; // Replace with actual production domain
        }

        // Development fallback
        return 'http://localhost:5173';
    }

    /**
     * Generate a verification token for a transaction
     * @param {Object} transactionData - Transaction data from database
     * @param {string} generatedBy - User ID who generated the token
     * @param {number} expiresInDays - Token expiration in days
     * @returns {Object} QR data object with encrypted token
     */
    async generateVerificationToken(transactionData, generatedBy, expiresInDays = this.defaultExpiryDays) {
        try {
            const now = Math.floor(Date.now() / 1000);
            const expirationTime = now + (expiresInDays * 24 * 60 * 60);
            const jwtId = crypto.randomUUID();
            
            // Create hash of critical transaction data to detect tampering
            const criticalData = `${transactionData.transaction_id}:${transactionData.amount}:${transactionData.transaction_date}:${transactionData.status}`;
            const dataHash = crypto.createHash('sha256').update(criticalData).digest('hex');

            // JWT payload
            const payload = {
                transaction_id: transactionData.transaction_id,
                receipt_no: transactionData.receipt_no,
                amount: parseFloat(transactionData.amount).toFixed(2),
                currency: 'PHP',
                date: transactionData.transaction_date,
                status: transactionData.status,
                payer_name: transactionData.payer_name,
                payment_type: transactionData.payment_type_label || 'Unknown',
                organization_id: transactionData.organization_id,
                organization_version_id: transactionData.org_version_id,
                hash: dataHash,
                
                // JWT standard claims
                iss: this.jwtIssuer,
                aud: this.jwtAudience,
                iat: now,
                exp: expirationTime,
                nbf: now,
                jti: jwtId
            };

            // Sign the JWT token
            const token = jwt.sign(payload, this.jwtSecret, {
                algorithm: this.jwtAlgorithm
            });

            // Hash the token for database storage
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

            // Store verification record in database
            const expiresAt = new Date(expirationTime * 1000);
            await this.storeVerificationToken(
                transactionData.transaction_id,
                jwtId,
                tokenHash,
                generatedBy,
                expiresAt
            );

            // Create QR data structure with proper verification URL
            const qrData = {
                token: token,
                verify: `${this.verificationBaseUrl}/verify?token=${encodeURIComponent(token)}`,
                transaction_id: transactionData.transaction_id,
                amount: transactionData.amount,
                date: transactionData.transaction_date,
                v: 2  // QR payload version
            };

            return {
                transaction_id: transactionData.transaction_id,
                qr_data: qrData,
                expires_at: expiresAt.toISOString(),
                token_id: jwtId,
                verification_url: qrData.verify
            };

        } catch (error) {
            console.error('Error generating verification token:', error);
            throw new Error('Failed to generate verification token');
        }
    }

    /**
     * Verify a JWT token and return transaction data
     * @param {string} token - JWT token to verify
     * @param {Object} verificationInfo - Client IP and user agent
     * @returns {Object} Verification result
     */
    async verifyToken(token, verificationInfo = {}) {
        try {
            // First, verify the JWT token signature and structure
            let payload;
            try {
                payload = jwt.verify(token, this.jwtSecret, {
                    algorithms: [this.jwtAlgorithm],
                    issuer: this.jwtIssuer,
                    audience: this.jwtAudience
                });
            } catch (jwtError) {
                return {
                    success: false,
                    verified: false,
                    error: {
                        code: 'INVALID_TOKEN',
                        message: 'Invalid or malformed verification token',
                        details: { error: jwtError.message }
                    }
                };
            }

            // Hash the token for database lookup
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

            // Verify against database and get transaction data
            const verificationResult = await this.verifyTokenInDatabase(
                payload.jti,
                tokenHash,
                verificationInfo.clientIP,
                verificationInfo.userAgent
            );

            return verificationResult;

        } catch (error) {
            console.error('Error verifying token:', error);
            return {
                success: false,
                verified: false,
                error: {
                    code: 'VERIFICATION_FAILED',
                    message: 'Unable to verify transaction',
                    details: { error: error.message }
                }
            };
        }
    }

    /**
     * Revoke a verification token
     * @param {number} transactionId - Transaction ID
     * @param {string} reason - Reason for revocation
     * @param {string} revokedBy - User ID who revoked the token
     * @returns {Object} Revocation result
     */
    async revokeToken(transactionId, reason, revokedBy) {
        try {
            const connection = await mysql.getConnection();
            
            const [results] = await connection.execute(
                'CALL RevokeQRToken(?, ?, ?)',
                [transactionId, revokedBy, reason]
            );

            connection.release();

            if (results && results.length > 0) {
                return {
                    success: true,
                    message: 'Verification token revoked successfully',
                    revoked_token_id: results[0].revoked_token_id,
                    revoked_at: results[0].revoked_at,
                    reason: results[0].reason
                };
            } else {
                throw new Error('No active token found to revoke');
            }

        } catch (error) {
            console.error('Error revoking token:', error);
            throw new Error(error.message || 'Failed to revoke verification token');
        }
    }

    /**
     * Store verification token in database
     * @private
     */
    async storeVerificationToken(transactionId, jwtId, tokenHash, generatedBy, expiresAt) {
        try {
            const connection = await mysql.getConnection();
            
            const [results] = await connection.execute(
                'CALL GenerateQRVerificationToken(?, ?, ?, ?, ?)',
                [transactionId, jwtId, tokenHash, generatedBy, expiresAt]
            );

            connection.release();

            if (!results || results.length === 0) {
                throw new Error('Failed to store verification token');
            }

            return results[0];

        } catch (error) {
            console.error('Error storing verification token:', error);
            throw error;
        }
    }

    /**
     * Verify token in database and return transaction data
     * @private
     */
    async verifyTokenInDatabase(jwtId, tokenHash, clientIP, userAgent) {
        try {
            const connection = await mysql.getConnection();
            
            const [results] = await connection.execute(
                'CALL VerifyQRToken(?, ?, ?)',
                [jwtId, clientIP || null, userAgent || null]
            );

            connection.release();

            if (results && results.length > 0 && results[0].length > 0) {
                const transactionData = results[0][0];
                
                return {
                    success: true,
                    verified: true,
                    data: {
                        transaction_id: transactionData.transaction_id,
                        receipt_no: transactionData.receipt_no,
                        amount: parseFloat(transactionData.amount).toFixed(2),
                        currency: transactionData.currency,
                        transaction_date: transactionData.transaction_date,
                        status: transactionData.status,
                        payer_name: transactionData.payer_name,
                        payment_type: transactionData.payment_type,
                        organization_name: transactionData.organization_name,
                        generated_at: transactionData.token_generated_at,
                        verified_at: transactionData.verified_at,
                        is_authentic: transactionData.is_authentic
                    },
                    verification_info: {
                        verification_count: transactionData.verification_count,
                        first_verification: transactionData.token_generated_at,
                        last_verification: transactionData.last_verified_at
                    }
                };
            } else {
                return {
                    success: false,
                    verified: false,
                    error: {
                        code: 'TRANSACTION_NOT_FOUND',
                        message: 'Transaction not found or token is invalid'
                    }
                };
            }

        } catch (error) {
            console.error('Database verification error:', error);
            
            // Handle specific database errors
            if (error.message.includes('Invalid verification token')) {
                return {
                    success: false,
                    verified: false,
                    error: {
                        code: 'INVALID_TOKEN',
                        message: 'Verification token is invalid'
                    }
                };
            }
            
            if (error.message.includes('token has been revoked')) {
                return {
                    success: false,
                    verified: false,
                    error: {
                        code: 'TOKEN_REVOKED',
                        message: 'Verification token has been revoked'
                    }
                };
            }
            
            if (error.message.includes('token has expired')) {
                return {
                    success: false,
                    verified: false,
                    error: {
                        code: 'TOKEN_EXPIRED',
                        message: 'Verification token has expired'
                    }
                };
            }

            return {
                success: false,
                verified: false,
                error: {
                    code: 'DATABASE_ERROR',
                    message: 'Database verification failed',
                    details: { error: error.message }
                }
            };
        }
    }

    /**
     * Clean up expired tokens (for scheduled maintenance)
     */
    async cleanupExpiredTokens() {
        try {
            const connection = await mysql.getConnection();
            
            const [results] = await connection.execute('CALL CleanupExpiredQRTokens()');
            
            connection.release();

            console.log('QR Token cleanup result:', results[0]?.[0]?.result || 'Cleanup completed');
            return results[0]?.[0]?.result || 'Cleanup completed';

        } catch (error) {
            console.error('Error cleaning up expired tokens:', error);
            throw error;
        }
    }

    /**
     * Get public verification info (for display without sensitive data)
     * @param {string} tokenId - JWT token ID
     * @returns {Object} Public verification data
     */
    async getPublicVerificationInfo(tokenId) {
        try {
            const connection = await mysql.getConnection();
            
            const [results] = await connection.execute(`
                SELECT 
                    t.receipt_no,
                    t.amount,
                    t.payment_description,
                    t.payer_name,
                    DATE(t.transaction_date) as transaction_date,
                    tt.label as transaction_type,
                    pt.label as payment_method,
                    fc.label as category,
                    -- Get organization name from multiple possible sources
                    COALESCE(
                        o1.name,  -- From membership transactions
                        o2.name,  -- From event transactions
                        o3.name,  -- From org_version_id on transaction
                        'SDAO'    -- Default for SDAO transactions
                    ) as organization_name,
                    tv.verification_count,
                    tv.is_revoked,
                    tv.expires_at > CURRENT_TIMESTAMP as is_active
                FROM tbl_transaction_verification tv
                JOIN tbl_transaction t ON tv.transaction_id = t.transaction_id
                LEFT JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
                LEFT JOIN tbl_payment_type pt ON t.payment_type_id = pt.payment_type_id
                LEFT JOIN tbl_financial_category fc ON t.category_id = fc.category_id
                -- Try to get org from membership transactions
                LEFT JOIN tbl_transaction_membership tm ON t.transaction_id = tm.transaction_id
                LEFT JOIN tbl_organization o1 ON tm.organization_id = o1.organization_id
                -- Try to get org from event transactions
                LEFT JOIN tbl_transaction_event te ON t.transaction_id = te.transaction_id
                LEFT JOIN tbl_event e ON te.event_id = e.event_id
                LEFT JOIN tbl_organization o2 ON e.organization_id = o2.organization_id
                -- Try to get org from transaction's org_version_id
                LEFT JOIN tbl_organization_version ov ON t.org_version_id = ov.org_version_id
                LEFT JOIN tbl_organization o3 ON ov.organization_id = o3.organization_id
                WHERE tv.jwt_token_id = ?
                  AND tv.is_revoked = FALSE
                  AND tv.expires_at > CURRENT_TIMESTAMP
            `, [tokenId]);

            connection.release();

            if (results.length > 0) {
                const data = results[0];
                
                // Update verification count and last verified timestamp
                await connection.execute(`
                    UPDATE tbl_transaction_verification 
                    SET verification_count = verification_count + 1,
                        last_verified_at = CURRENT_TIMESTAMP
                    WHERE jwt_token_id = ?
                `, [tokenId]);
                
                return {
                    success: true,
                    data: {
                        receipt_no: data.receipt_no,
                        amount: parseFloat(data.amount || 0).toFixed(2),
                        payment_description: data.payment_description,
                        payer_name: data.payer_name,
                        transaction_date: data.transaction_date,
                        transaction_type: data.transaction_type,
                        payment_method: data.payment_method,
                        category: data.category,
                        organization_name: data.organization_name,
                        verification_count: data.verification_count + 1, // Show updated count
                        is_authentic: true, // If found in DB with valid token, it's authentic
                        verified_at: new Date().toISOString()
                    }
                };
            } else {
                return {
                    success: false,
                    error: 'Transaction not found or token expired'
                };
            }

        } catch (error) {
            console.error('Error getting public verification info:', error);
            return {
                success: false,
                error: 'Failed to retrieve verification information'
            };
        }
    }
}

module.exports = new QRVerificationService();