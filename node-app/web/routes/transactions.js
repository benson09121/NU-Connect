const express = require('express');
const router = express.Router();
const middleware = require('../../middlewares/middleWare');
const controller = require('../controllers/transactionController');

// Permissions
const VIEW = 'VIEW_TRANSACTIONS';
const MANAGE = 'MANAGE_TRANSACTIONS';

router.post(
  '/transactions',
  middleware.validateAzureJWT,
  middleware.hasPermission(['MANAGE_TRANSACTIONS']),
  controller.create
);

router.put(
  '/transactions',
  middleware.validateAzureJWT,
  middleware.hasPermission([MANAGE]),
  controller.update
);

router.post(
  '/transactions/archive',
  middleware.validateAzureJWT,
  middleware.hasPermission([MANAGE]),
  controller.archive
);

router.post(
  '/transactions/unarchive',
  middleware.validateAzureJWT,
  middleware.hasPermission([MANAGE]),
  controller.unarchive
);

router.get(
  '/transactions/:id',
  middleware.validateAzureJWT,
  middleware.hasPermission([VIEW, MANAGE]),
  controller.getOne
);

router.get(
  '/transactions',
  middleware.validateAzureJWT,
  middleware.hasPermission([VIEW, MANAGE]),
  controller.list
);

router.get(
  '/transaction-types',
  middleware.validateAzureJWT,
  middleware.hasPermission([VIEW, MANAGE]),
  controller.getTransactionTypes
);

router.get(
  '/payment-types',
  middleware.validateAzureJWT,
  middleware.hasPermission([VIEW, MANAGE]),
  controller.getPaymentTypes
);

router.get(
  '/financial-categories',
  middleware.validateAzureJWT,
  middleware.hasPermission([VIEW, MANAGE]),
  controller.getFinancialCategories
);

router.get(
  '/transactions/:organization_id/versions/:organization_version_id/files/:filename',
  middleware.validateAzureJWT,
  middleware.hasPermission([VIEW, MANAGE]),
  controller.getTransactionFile
);

router.get(
  '/organizations/:organization_id/versions/:organization_version_id/transactions',
  middleware.validateAzureJWT,
  middleware.hasPermission([VIEW, MANAGE]),
  controller.getTransactionsByOrganization
);

module.exports = router;