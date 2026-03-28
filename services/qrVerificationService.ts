// @ts-nocheck
export {};
const crypto = require('crypto');
const { prisma } = require('../config/db');

/**
 * QR Verification Service
 * Prisma-backed replacement for legacy stored-procedure flow.
 */
class QRVerificationService {
    constructor() {
        this.defaultExpiryDays = 1095;
        this.maxExpiryDays = 1095;
        this.verificationBaseUrl = this.getVerificationBaseUrl();
    }

    getVerificationBaseUrl() {
        if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
        if (process.env.DOMAIN) return `https://${process.env.DOMAIN}`;
        if (process.env.NODE_ENV === 'production') return 'https://nuconnect.nu-dasma.edu.ph';
        return 'http://localhost:5173';
    }

    getOrganizationName(transaction) {
        const membershipOrg = transaction?.tbl_transaction_membership?.tbl_renewal_cycle?.tbl_organization?.name;
        const eventOrg = transaction?.tbl_transaction_event?.tbl_event?.tbl_organization?.name;
        const versionOrg = transaction?.tbl_organization_version?.tbl_organization_tbl_organization_version_organization_idTotbl_organization?.name;
        return membershipOrg || eventOrg || versionOrg || 'SDAO';
    }

    async generateUniqueTokenId(length = 30, maxAttempts = 8) {
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            const candidate = crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);

            const [inVerification, inTransaction] = await Promise.all([
                prisma.tbl_transaction_verification.findFirst({
                    where: { jwt_token_id: candidate },
                    select: { verification_id: true },
                }),
                prisma.tbl_transaction.findFirst({
                    where: { qr_token: candidate },
                    select: { transaction_id: true },
                }),
            ]);

            if (!inVerification && !inTransaction) {
                return candidate;
            }
        }

        throw new Error('Failed to generate a unique QR token ID');
    }

    buildCompactUrls(qrToken) {
        const encoded = encodeURIComponent(qrToken);
        return {
            verification_compact_url: `${this.verificationBaseUrl}/verify?qr_token=${encoded}`,
            verification_api_url: `/api/web/verify/transaction?qr_token=${encoded}`,
        };
    }

    nonRevokedWhere() {
        return {
            OR: [
                { is_revoked: false },
                { is_revoked: null },
            ],
        };
    }

    normalizeExpiryDays(expiresInDays) {
        const parsed = Number(expiresInDays);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return this.defaultExpiryDays;
        }
        return Math.min(Math.floor(parsed), this.maxExpiryDays);
    }

    async getActiveVerificationForToken(transactionId, tokenId) {
        if (!tokenId) return null;
        return prisma.tbl_transaction_verification.findFirst({
            where: {
                transaction_id: Number(transactionId),
                jwt_token_id: String(tokenId),
                ...this.nonRevokedWhere(),
                expires_at: { gt: new Date() },
            },
            orderBy: { generated_at: 'desc' },
        });
    }

    async getActiveVerification(transactionId) {
        return prisma.tbl_transaction_verification.findFirst({
            where: {
                transaction_id: Number(transactionId),
                ...this.nonRevokedWhere(),
                expires_at: { gt: new Date() },
            },
            orderBy: { generated_at: 'desc' },
        });
    }

    async generateVerificationToken(transactionData, generatedBy, expiresInDays = this.defaultExpiryDays) {
        try {
            const transactionId = Number(transactionData.transaction_id);
            if (!transactionId) {
                throw new Error('transaction_id is required');
            }

            const generatedBySafe = generatedBy || transactionData.user_id;
            if (!generatedBySafe) {
                throw new Error('generated_by is required');
            }

            const normalizedExpiryDays = this.normalizeExpiryDays(expiresInDays);

            const txRow = await prisma.tbl_transaction.findUnique({
                where: { transaction_id: transactionId },
                select: { qr_token: true },
            });

            const transactionBound = await this.getActiveVerificationForToken(transactionId, txRow?.qr_token);
            if (transactionBound) {
                const compact = this.buildCompactUrls(transactionBound.jwt_token_id);
                return {
                    transaction_id: transactionId,
                    qr_token: transactionBound.jwt_token_id,
                    ...compact,
                    expires_at: transactionBound.expires_at.toISOString(),
                    is_reused_token: true,
                };
            }

            const active = await this.getActiveVerification(transactionId);
            if (active) {
                await prisma.tbl_transaction.update({
                    where: { transaction_id: transactionId },
                    data: {
                        qr_token: active.jwt_token_id,
                        qr_enabled: true,
                    },
                });

                const compact = this.buildCompactUrls(active.jwt_token_id);
                return {
                    transaction_id: transactionId,
                    qr_token: active.jwt_token_id,
                    ...compact,
                    expires_at: active.expires_at.toISOString(),
                    is_reused_token: true,
                };
            }

            const jwtId = await this.generateUniqueTokenId(30);
            const expirationTime = Date.now() + (normalizedExpiryDays * 24 * 60 * 60 * 1000);
            const expiresAt = new Date(expirationTime);
            const tokenHash = crypto
                .createHash('sha256')
                .update(`${jwtId}:${transactionId}:${expiresAt.toISOString()}`)
                .digest('hex');

            const persisted = await this.storeVerificationToken(
                transactionId,
                jwtId,
                tokenHash,
                generatedBySafe,
                expiresAt,
            );

            const compact = this.buildCompactUrls(persisted.jwt_token_id);
            return {
                transaction_id: transactionId,
                qr_token: persisted.jwt_token_id,
                ...compact,
                expires_at: persisted.expires_at.toISOString(),
                is_reused_token: Boolean(persisted.is_reused_token),
            };
        } catch (error) {
            console.error('Error generating verification token:', error);
            throw new Error('Failed to generate verification token');
        }
    }

    async revokeToken(transactionId, reason, revokedBy) {
        const id = Number(transactionId);
        const active = await prisma.tbl_transaction_verification.findFirst({
            where: {
                transaction_id: id,
                ...this.nonRevokedWhere(),
                expires_at: { gt: new Date() },
            },
            orderBy: { generated_at: 'desc' },
        });

        if (!active) {
            throw new Error('No active token found to revoke');
        }

        const revokedAt = new Date();

        await prisma.$transaction([
            prisma.tbl_transaction_verification.update({
                where: { verification_id: active.verification_id },
                data: {
                    is_revoked: true,
                    revoked_at: revokedAt,
                    revoked_by: revokedBy || null,
                    revoke_reason: reason || 'Manually revoked',
                },
            }),
            prisma.tbl_transaction.update({
                where: { transaction_id: id },
                data: {
                    qr_enabled: false,
                    qr_token: null,
                },
            }),
        ]);

        return {
            success: true,
            message: 'Verification token revoked successfully',
            revoked_token_id: active.jwt_token_id,
            revoked_at: revokedAt.toISOString(),
            reason: reason || 'Manually revoked',
        };
    }

    async storeVerificationToken(transactionId, jwtId, tokenHash, generatedBy, expiresAt) {
        const id = Number(transactionId);

        return prisma.$transaction(async (tx) => {
            const existingActive = await tx.tbl_transaction_verification.findFirst({
                where: {
                    transaction_id: id,
                    ...this.nonRevokedWhere(),
                    expires_at: { gt: new Date() },
                },
                orderBy: { generated_at: 'desc' },
            });

            if (existingActive) {
                await tx.tbl_transaction.update({
                    where: { transaction_id: id },
                    data: {
                        qr_token: existingActive.jwt_token_id,
                        qr_enabled: true,
                    },
                });

                return {
                    jwt_token_id: existingActive.jwt_token_id,
                    expires_at: existingActive.expires_at,
                    is_reused_token: true,
                };
            }

            await tx.tbl_transaction_verification.updateMany({
                where: {
                    transaction_id: id,
                    ...this.nonRevokedWhere(),
                },
                data: {
                    is_revoked: true,
                    revoked_at: new Date(),
                    revoked_by: generatedBy || null,
                    revoke_reason: 'Superseded by new token',
                },
            });

            await tx.tbl_transaction_verification.create({
                data: {
                    transaction_id: id,
                    jwt_token_id: jwtId,
                    token_hash: tokenHash,
                    generated_by: generatedBy,
                    expires_at: expiresAt,
                    is_revoked: false,
                },
            });

            await tx.tbl_transaction.update({
                where: { transaction_id: id },
                data: {
                    qr_token: jwtId,
                    qr_enabled: true,
                },
            });

            return {
                jwt_token_id: jwtId,
                expires_at: expiresAt,
                is_reused_token: false,
            };
        });
    }

    async verifyByQrToken(qrToken, verificationInfo = {}) {
        try {
            const tokenId = String(qrToken || '').trim();
            if (!tokenId) {
                return {
                    success: false,
                    verified: false,
                    error: {
                        code: 'INVALID_TOKEN',
                        message: 'qr_token is required',
                    },
                };
            }

            return this.verifyTokenInDatabase(
                tokenId,
                verificationInfo.clientIP,
                verificationInfo.userAgent,
            );
        } catch (error) {
            console.error('Error verifying qr_token:', error);
            return {
                success: false,
                verified: false,
                error: {
                    code: 'VERIFICATION_FAILED',
                    message: 'Unable to verify transaction',
                    details: { error: error.message },
                },
            };
        }
    }

    async verifyTokenInDatabase(jwtId, clientIP, userAgent) {
        const row = await prisma.tbl_transaction_verification.findFirst({
            where: {
                jwt_token_id: jwtId,
            },
            include: {
                tbl_transaction: {
                    include: {
                        tbl_payment_type: { select: { label: true } },
                        tbl_transaction_type: { select: { label: true } },
                        tbl_financial_category: { select: { label: true } },
                        tbl_transaction_membership: {
                            include: {
                                tbl_renewal_cycle: {
                                    include: {
                                        tbl_organization: { select: { name: true } },
                                    },
                                },
                            },
                        },
                        tbl_transaction_event: {
                            include: {
                                tbl_event: {
                                    include: {
                                        tbl_organization: { select: { name: true } },
                                    },
                                },
                            },
                        },
                        tbl_organization_version: {
                            include: {
                                tbl_organization_tbl_organization_version_organization_idTotbl_organization: {
                                    select: { name: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!row) {
            return {
                success: false,
                verified: false,
                error: {
                    code: 'INVALID_TOKEN',
                    message: 'Verification token is invalid',
                },
            };
        }

        if (row.is_revoked) {
            return {
                success: false,
                verified: false,
                error: {
                    code: 'TOKEN_REVOKED',
                    message: 'Verification token has been revoked',
                },
            };
        }

        if (row.expires_at <= new Date()) {
            return {
                success: false,
                verified: false,
                error: {
                    code: 'TOKEN_EXPIRED',
                    message: 'Verification token has expired',
                },
            };
        }

        if (row.tbl_transaction?.qr_token && row.tbl_transaction.qr_token !== jwtId) {
            return {
                success: false,
                verified: false,
                error: {
                    code: 'TOKEN_REVOKED',
                    message: 'Verification token has been rotated or revoked',
                },
            };
        }

        const updated = await prisma.tbl_transaction_verification.update({
            where: { verification_id: row.verification_id },
            data: {
                verification_count: { increment: 1 },
                last_verified_at: new Date(),
                last_verified_ip: clientIP || null,
                last_verified_user_agent: userAgent || null,
            },
        });

        const tx = row.tbl_transaction;

        return {
            success: true,
            verified: true,
            data: {
                transaction_id: tx.transaction_id,
                receipt_no: tx.receipt_no,
                amount: Number(tx.amount || 0).toFixed(2),
                currency: 'PHP',
                transaction_date: tx.transaction_date,
                status: tx.status,
                payer_name: tx.payer_name,
                payment_type: tx.tbl_payment_type?.label || 'Unknown',
                organization_name: this.getOrganizationName(tx),
                generated_at: row.generated_at,
                verified_at: updated.last_verified_at,
                is_authentic: true,
            },
            verification_info: {
                verification_count: updated.verification_count,
                first_verification: row.generated_at,
                last_verification: updated.last_verified_at,
            },
        };
    }

    async cleanupExpiredTokens() {
        const result = await prisma.tbl_transaction_verification.updateMany({
            where: {
                ...this.nonRevokedWhere(),
                expires_at: { lt: new Date() },
            },
            data: {
                is_revoked: true,
                revoked_at: new Date(),
                revoke_reason: 'Expired by cleanup',
            },
        });

        return `Cleanup completed. Revoked ${result.count} expired token(s).`;
    }

    async getPublicVerificationInfo(tokenId) {
        const row = await prisma.tbl_transaction_verification.findFirst({
            where: { jwt_token_id: tokenId },
            include: {
                tbl_transaction: {
                    include: {
                        tbl_payment_type: { select: { label: true } },
                        tbl_transaction_type: { select: { label: true } },
                        tbl_financial_category: { select: { label: true } },
                        tbl_transaction_membership: {
                            include: {
                                tbl_renewal_cycle: {
                                    include: {
                                        tbl_organization: { select: { name: true } },
                                    },
                                },
                            },
                        },
                        tbl_transaction_event: {
                            include: {
                                tbl_event: {
                                    include: {
                                        tbl_organization: { select: { name: true } },
                                    },
                                },
                            },
                        },
                        tbl_organization_version: {
                            include: {
                                tbl_organization_tbl_organization_version_organization_idTotbl_organization: {
                                    select: { name: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!row || row.is_revoked || row.expires_at <= new Date()) {
            return {
                success: false,
                error: 'Transaction not found or token expired',
            };
        }

        const updated = await prisma.tbl_transaction_verification.update({
            where: { verification_id: row.verification_id },
            data: {
                verification_count: { increment: 1 },
                last_verified_at: new Date(),
            },
        });

        const tx = row.tbl_transaction;

        return {
            success: true,
            data: {
                receipt_no: tx.receipt_no,
                amount: Number(tx.amount || 0).toFixed(2),
                payment_description: tx.payment_description,
                payer_name: tx.payer_name,
                transaction_date: tx.transaction_date,
                transaction_type: tx.tbl_transaction_type?.label || null,
                payment_method: tx.tbl_payment_type?.label || null,
                category: tx.tbl_financial_category?.label || null,
                organization_name: this.getOrganizationName(tx),
                verification_count: updated.verification_count,
                is_authentic: true,
                verified_at: updated.last_verified_at,
            },
        };
    }
}

module.exports = new QRVerificationService();