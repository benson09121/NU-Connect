import { Router } from 'express';
import { validateAzureJWT, hasAnyPermission, hasPermission } from '../../middlewares/middleWare';
import * as qrController from '../controllers/qrVerificationController';

const router = Router();

router.post(
  '/transactions/generate-qr-token',
  validateAzureJWT,
  hasAnyPermission(['VIEW_TRANSACTIONS', 'APPROVE_TRANSACTION']),
  qrController.generateQRToken,
);

router.post(
  '/transactions/revoke-qr-token',
  validateAzureJWT,
  hasPermission('APPROVE_TRANSACTION'),
  qrController.revokeQRToken,
);

router.post(
  '/admin/qr-tokens/cleanup',
  validateAzureJWT,
  hasPermission('APPROVE_TRANSACTION'),
  qrController.cleanupExpiredTokens,
);

router.post('/verify/transaction', qrController.verifyTransaction);
router.get('/verify/transaction', qrController.verifyTransaction);

router.get('/verify/transaction/public/:tokenId', qrController.getPublicVerificationData);
router.get('/qr-verification/health', qrController.healthCheck);

export default router;
