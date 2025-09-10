const express = require('express');
const router = express.Router();
const collegesController = require('../controllers/collegesController');
const middleware = require('../../middlewares/middleWare');

router.get(
    '/colleges',
    middleware.validateAzureJWT,
    middleware.hasPermission("VIEW_ORGANIZATION"),
    collegesController.getAllColleges
);

router.post(
    '/colleges',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_COLLEGES"),
    collegesController.createCollege
);

router.put(
    '/colleges',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_COLLEGES"),
    collegesController.updateCollege
);

router.post(
    '/colleges/archive',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_COLLEGES"),
    collegesController.archiveCollege
);

router.post(
    '/colleges/unarchive',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_COLLEGES"),
    collegesController.unarchiveCollege
);

module.exports = router;