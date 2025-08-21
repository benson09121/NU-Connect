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
  middleware.hasPermission([MANAGE]),
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

module.exports = router;