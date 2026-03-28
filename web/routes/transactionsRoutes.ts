import { Router } from 'express';
import { validateAzureJWT, hasPermission, hasAnyPermission } from '../../middlewares/middleWare';
import * as ctrl from '../controllers/transactionsController';

const router = Router();

const VIEW = 'VIEW_TRANSACTIONS';
const CREATE = 'CREATE_TRANSACTION';
const UPDATE = 'UPDATE_TRANSACTION';
const ARCHIVE = 'ARCHIVE_TRANSACTION';
const APPROVE = 'APPROVE_TRANSACTION';

router.post('/transactions', validateAzureJWT, hasPermission(CREATE), ctrl.create);
router.put('/transactions', validateAzureJWT, hasPermission(UPDATE), ctrl.update);
router.post('/transactions/archive', validateAzureJWT, hasPermission(ARCHIVE), ctrl.archive);
router.post('/transactions/unarchive', validateAzureJWT, hasPermission(ARCHIVE), ctrl.unarchive);

router.get('/transactions/:id', validateAzureJWT, hasPermission(VIEW), ctrl.getOne);
router.get('/transactions', validateAzureJWT, hasPermission(VIEW), ctrl.list);

router.get('/transaction-types', validateAzureJWT, hasPermission(VIEW), ctrl.getTransactionTypes);
router.get('/payment-types', validateAzureJWT, hasPermission(VIEW), ctrl.getPaymentTypes);
router.get('/financial-categories', validateAzureJWT, hasPermission(VIEW), ctrl.getFinancialCategories);

router.get(
  '/transactions/:organization_id/versions/:organization_version_id/files/:filename',
  validateAzureJWT,
  hasPermission(VIEW),
  ctrl.getTransactionFile,
);

router.get(
  '/transactions/:organization_id/versions/:organization_version_id/files',
  validateAzureJWT,
  hasPermission(VIEW),
  ctrl.getTransactionFile,
);

router.get(
  '/organizations/:organization_id/versions/:organization_version_id/transactions',
  validateAzureJWT,
  hasPermission(VIEW),
  ctrl.getTransactionsByOrganization,
);

router.post('/transactions/approve', validateAzureJWT, hasPermission(APPROVE), ctrl.approveTransaction);
router.get('/transactions/:id/audit-trail', validateAzureJWT, hasPermission(VIEW), ctrl.getTransactionAuditTrail);
router.get('/transaction-audits', validateAzureJWT, hasPermission(VIEW), ctrl.getAllTransactionAudits);

export default router;
