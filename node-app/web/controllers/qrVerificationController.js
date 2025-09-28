const qrVerificationService = require('../../services/qrVerificationService');

// Simple in-memory rate limiting
const rateLimitMap = new Map();
const RATE_LIMIT = 5; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute in milliseconds

// Rate limiting function
const rateLimit = (userIdentifier) => {
    const now = Date.now();
    const userRequests = rateLimitMap.get(userIdentifier) || [];
    
    // Remove old requests outside the time window
    const recentRequests = userRequests.filter(timestamp => now - timestamp < RATE_WINDOW);
    
    if (recentRequests.length >= RATE_LIMIT) {
        return false; // Rate limit exceeded
    }
    
    // Add current request
    recentRequests.push(now);
    rateLimitMap.set(userIdentifier, recentRequests);
    
    // Cleanup old entries periodically
    if (Math.random() < 0.01) { // 1% chance to cleanup
        for (const [key, requests] of rateLimitMap.entries()) {
            const validRequests = requests.filter(timestamp => now - timestamp < RATE_WINDOW);
            if (validRequests.length === 0) {
                rateLimitMap.delete(key);
            } else {
                rateLimitMap.set(key, validRequests);
            }
        }
    }
    
    return true; // Request allowed
};

/**
 * QR Verification Controller
 * Handles HTTP requests for QR code generation and verification
 */
const qrVerificationController = {
    /**
     * Generate QR verification token for a transaction
     * POST /api/web/transactions/generate-qr-token
     */
    async generateQRToken(req, res) {
        try {
            const { transaction_id, expires_in_days = 365 } = req.body;
            const userId = req.user?.user_id || req.user?.email;

            // Validate input
            if (!transaction_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Transaction ID is required'
                });
            }

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User authentication required'
                });
            }

            // Rate limiting - use IP address and transaction ID as identifier
            const userIdentifier = `${req.ip}-${userId}-${transaction_id}`;
            if (!rateLimit(userIdentifier)) {
                return res.status(429).json({
                    success: false,
                    error: 'Rate limit exceeded. Please wait before generating another QR code.',
                    retryAfter: 60 // seconds
                });
            }

            // Get transaction data from database
            const mysql = require('../../config/db');
            const connection = await mysql.getConnection();

            const [transactionResults] = await connection.execute(`
                SELECT 
                    t.*,
                    pt.label as payment_type_label,
                    tt.label as transaction_type_label,
                    o.name as organization_name,
                    ov.organization_id
                FROM tbl_transaction t
                LEFT JOIN tbl_payment_type pt ON t.payment_type_id = pt.payment_type_id
                LEFT JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
                LEFT JOIN tbl_transaction_membership tm ON t.transaction_id = tm.transaction_id
                LEFT JOIN tbl_organization_version ov ON tm.organization_id = ov.organization_id
                LEFT JOIN tbl_organization o ON ov.organization_id = o.organization_id
                WHERE t.transaction_id = ?
            `, [transaction_id]);

            connection.release();

            if (transactionResults.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Transaction not found'
                });
            }

            const transactionData = transactionResults[0];

            // Permission check is already handled by route middleware
            // (middleware.hasPermission(['MANAGE_TRANSACTIONS', 'VIEW_TRANSACTIONS']))
            // No additional permission check needed here

            // Generate the verification token
            const qrData = await qrVerificationService.generateVerificationToken(
                transactionData,
                userId,
                expires_in_days
            );

            res.json({
                success: true,
                data: qrData
            });

        } catch (error) {
            console.error('QR generation error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to generate verification token',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    },

    /**
     * Verify transaction QR code
     * POST /api/web/verify/transaction
     */
    async verifyTransaction(req, res) {
        try {
            const { token } = req.body;
            
            if (!token) {
                return res.status(400).json({
                    success: false,
                    verified: false,
                    error: {
                        code: 'MISSING_TOKEN',
                        message: 'Verification token is required'
                    }
                });
            }

            // Get client information for audit logging
            const clientIP = req.headers['x-forwarded-for'] || 
                           req.headers['x-real-ip'] || 
                           req.connection.remoteAddress || 
                           req.socket.remoteAddress || 
                           (req.connection.socket ? req.connection.socket.remoteAddress : null);
            
            const userAgent = req.headers['user-agent'];

            // Verify the token
            const verificationResult = await qrVerificationService.verifyToken(token, {
                clientIP,
                userAgent
            });

            // Set appropriate HTTP status code based on result
            let statusCode = 200;
            if (!verificationResult.success) {
                statusCode = verificationResult.error?.code === 'INVALID_TOKEN' ? 400 : 422;
            }

            res.status(statusCode).json(verificationResult);

        } catch (error) {
            console.error('Verification error:', error);
            res.status(500).json({
                success: false,
                verified: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Internal server error during verification',
                    details: process.env.NODE_ENV === 'development' ? error.message : undefined
                }
            });
        }
    },

    /**
     * Revoke QR verification token
     * POST /api/web/transactions/revoke-qr-token
     */
    async revokeQRToken(req, res) {
        try {
            const { transaction_id, reason = 'Manually revoked' } = req.body;
            const userId = req.user?.user_id || req.user?.email;

            if (!transaction_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Transaction ID is required'
                });
            }

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User authentication required'
                });
            }

            // Check permissions (only MANAGE_TRANSACTIONS should be able to revoke)
            if (!req.user.permissions?.includes('MANAGE_TRANSACTIONS')) {
                return res.status(403).json({
                    success: false,
                    error: 'Insufficient permissions to revoke QR tokens'
                });
            }

            // Revoke the token
            const result = await qrVerificationService.revokeToken(
                transaction_id,
                reason,
                userId
            );

            res.json(result);

        } catch (error) {
            console.error('Token revocation error:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to revoke verification token',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    },

    /**
     * Get public verification data (no auth required)
     * GET /api/web/verify/transaction/public/:tokenId
     */
    async getPublicVerificationData(req, res) {
        try {
            const { tokenId } = req.params;

            if (!tokenId) {
                return res.status(400).json({
                    success: false,
                    error: 'Token ID is required'
                });
            }

            const result = await qrVerificationService.getPublicVerificationInfo(tokenId);

            res.json(result);

        } catch (error) {
            console.error('Public verification data error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve verification information',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    },

    /**
     * Admin endpoint: Clean up expired tokens
     * POST /api/web/admin/qr-tokens/cleanup
     */
    async cleanupExpiredTokens(req, res) {
        try {
            // Check admin permissions
            if (!req.user.permissions?.includes('MANAGE_TRANSACTIONS')) {
                return res.status(403).json({
                    success: false,
                    error: 'Admin permissions required'
                });
            }

            const result = await qrVerificationService.cleanupExpiredTokens();

            res.json({
                success: true,
                message: result
            });

        } catch (error) {
            console.error('Token cleanup error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to clean up expired tokens',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    },

    /**
     * Health check endpoint for QR verification system
     * GET /api/web/qr-verification/health
     */
    async healthCheck(req, res) {
        try {
            // Basic system health check
            const mysql = require('../../config/db');
            const connection = await mysql.getConnection();
            
            // Check if verification table exists
            const [tableCheck] = await connection.execute(`
                SELECT COUNT(*) as table_exists 
                FROM information_schema.tables 
                WHERE table_schema = DATABASE() 
                AND table_name = 'tbl_transaction_verification'
            `);

            // Check if procedures exist
            const [procedureCheck] = await connection.execute(`
                SELECT COUNT(*) as procedure_count
                FROM information_schema.routines
                WHERE routine_schema = DATABASE()
                AND routine_name IN ('GenerateQRVerificationToken', 'VerifyQRToken', 'RevokeQRToken')
            `);

            connection.release();

            const isHealthy = 
                tableCheck[0].table_exists > 0 && 
                procedureCheck[0].procedure_count >= 3;

            res.json({
                success: true,
                healthy: isHealthy,
                system: 'QR Verification Service',
                version: '2.0.0',
                checks: {
                    database_table: tableCheck[0].table_exists > 0,
                    stored_procedures: procedureCheck[0].procedure_count >= 3,
                    jwt_configured: !!process.env.JWT_SECRET_KEY
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Health check error:', error);
            res.status(503).json({
                success: false,
                healthy: false,
                error: 'Health check failed',
                timestamp: new Date().toISOString()
            });
        }
    }
};

module.exports = qrVerificationController;