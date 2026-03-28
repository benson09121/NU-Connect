import { Request, Response } from 'express';
import { prisma } from '../../config/db';

// Keep service interop via CommonJS export until the service itself is fully typed.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const qrVerificationService = require('../../services/qrVerificationService');

const QR_MAX_EXPIRY_DAYS = 1095;

// Simple in-memory rate limiting
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT = 5; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute in milliseconds

function rateLimit(userIdentifier: string): boolean {
  const now = Date.now();
  const userRequests = rateLimitMap.get(userIdentifier) || [];

  // Remove old requests outside the time window
  const recentRequests = userRequests.filter((timestamp) => now - timestamp < RATE_WINDOW);

  if (recentRequests.length >= RATE_LIMIT) {
    return false;
  }

  recentRequests.push(now);
  rateLimitMap.set(userIdentifier, recentRequests);

  // Cleanup old entries periodically
  if (Math.random() < 0.01) {
    for (const [key, requests] of rateLimitMap.entries()) {
      const validRequests = requests.filter((timestamp) => now - timestamp < RATE_WINDOW);
      if (validRequests.length === 0) {
        rateLimitMap.delete(key);
      } else {
        rateLimitMap.set(key, validRequests);
      }
    }
  }

  return true;
}

export async function generateQRToken(req: Request, res: Response): Promise<void> {
  try {
    const { transaction_id, expires_in_days = QR_MAX_EXPIRY_DAYS } = req.body;
    const userId = (req as any).user?.user_id || (req as any).user?.email;
    const normalizedExpiryDays = Math.min(
      QR_MAX_EXPIRY_DAYS,
      Math.max(1, Number(expires_in_days) || QR_MAX_EXPIRY_DAYS),
    );

    if (!transaction_id) {
      res.status(400).json({ success: false, error: 'Transaction ID is required' });
      return;
    }

    if (!userId) {
      res.status(401).json({ success: false, error: 'User authentication required' });
      return;
    }

    const userIdentifier = `${req.ip}-${userId}-${transaction_id}`;
    if (!rateLimit(userIdentifier)) {
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. Please wait before generating another QR code.',
        retryAfter: 60,
      });
      return;
    }

    const transactionData = await prisma.tbl_transaction.findUnique({
      where: { transaction_id: Number(transaction_id) },
      include: {
        tbl_payment_type: { select: { label: true } },
        tbl_transaction_type: { select: { label: true } },
        tbl_transaction_membership: {
          include: {
            tbl_renewal_cycle: {
              include: {
                tbl_organization: { select: { organization_id: true, name: true } },
              },
            },
          },
        },
        tbl_transaction_event: {
          include: {
            tbl_event: {
              include: {
                tbl_organization: { select: { organization_id: true, name: true } },
              },
            },
          },
        },
        tbl_organization_version: {
          include: {
            tbl_organization_tbl_organization_version_organization_idTotbl_organization: {
              select: { organization_id: true, name: true },
            },
          },
        },
      },
    });

    if (!transactionData) {
      res.status(404).json({ success: false, error: 'Transaction not found' });
      return;
    }

    const organizationFromMembership = transactionData.tbl_transaction_membership?.tbl_renewal_cycle?.tbl_organization;
    const organizationFromEvent = transactionData.tbl_transaction_event?.tbl_event?.tbl_organization;
    const organizationFromVersion = transactionData.tbl_organization_version?.tbl_organization_tbl_organization_version_organization_idTotbl_organization;

    const normalizedTransaction = {
      ...transactionData,
      payment_type_label: transactionData.tbl_payment_type?.label || null,
      transaction_type_label: transactionData.tbl_transaction_type?.label || null,
      organization_id:
        organizationFromMembership?.organization_id ||
        organizationFromEvent?.organization_id ||
        organizationFromVersion?.organization_id ||
        null,
      organization_name:
        organizationFromMembership?.name ||
        organizationFromEvent?.name ||
        organizationFromVersion?.name ||
        'SDAO',
    };

    const qrData = await qrVerificationService.generateVerificationToken(
      normalizedTransaction,
      userId,
      normalizedExpiryDays,
    );

    res.json({ success: true, data: qrData });
  } catch (error: any) {
    console.error('QR generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate verification token',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

export async function verifyTransaction(req: Request, res: Response): Promise<void> {
  try {
    const qrToken = (req.body as any)?.qr_token || (req.query as any)?.qr_token;

    if (!qrToken) {
      res.status(400).json({
        success: false,
        verified: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'qr_token is required',
        },
      });
      return;
    }

    const clientIP =
      (req.headers['x-forwarded-for'] as string) ||
      (req.headers['x-real-ip'] as string) ||
      req.socket.remoteAddress ||
      null;

    const userAgent = req.headers['user-agent'];

    const verificationResult = await qrVerificationService.verifyByQrToken(qrToken, {
      clientIP,
      userAgent,
    });

    let statusCode = 200;
    if (!verificationResult.success) {
      statusCode = verificationResult.error?.code === 'INVALID_TOKEN' ? 400 : 422;
    }

    res.status(statusCode).json(verificationResult);
  } catch (error: any) {
    console.error('Verification error:', error);
    res.status(500).json({
      success: false,
      verified: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error during verification',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
    });
  }
}

export async function revokeQRToken(req: Request, res: Response): Promise<void> {
  try {
    const { transaction_id, reason = 'Manually revoked' } = req.body;
    const userId = (req as any).user?.user_id || (req as any).user?.email;

    if (!transaction_id) {
      res.status(400).json({ success: false, error: 'Transaction ID is required' });
      return;
    }

    if (!userId) {
      res.status(401).json({ success: false, error: 'User authentication required' });
      return;
    }

    const result = await qrVerificationService.revokeToken(transaction_id, reason, userId);
    res.json(result);
  } catch (error: any) {
    console.error('Token revocation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to revoke verification token',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

export async function getPublicVerificationData(req: Request, res: Response): Promise<void> {
  try {
    const { tokenId } = req.params;

    if (!tokenId) {
      res.status(400).json({ success: false, error: 'Token ID is required' });
      return;
    }

    const result = await qrVerificationService.getPublicVerificationInfo(tokenId);
    res.json(result);
  } catch (error: any) {
    console.error('Public verification data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve verification information',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

export async function cleanupExpiredTokens(req: Request, res: Response): Promise<void> {
  try {
    const result = await qrVerificationService.cleanupExpiredTokens();
    res.json({ success: true, message: result });
  } catch (error: any) {
    console.error('Token cleanup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clean up expired tokens',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

export async function healthCheck(req: Request, res: Response): Promise<void> {
  try {
    const tableCheck = await prisma.tbl_transaction_verification.count();
    const isHealthy = tableCheck >= 0;

    res.json({
      success: true,
      healthy: isHealthy,
      system: 'QR Verification Service',
      version: '2.0.0',
      checks: {
        database_table: tableCheck >= 0,
        stored_procedures: false,
        jwt_configured: !!process.env.JWT_SECRET_KEY,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      success: false,
      healthy: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
    });
  }
}
