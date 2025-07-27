const express = require('express');
const router = express.Router();
const programsController = require('../controllers/programsController');
const middleware = require('../../middlewares/middleWare');

router.get(
    '/programs',
    middleware.validateAzureJWT,
    middleware.hasPermission("VIEW_ORGANIZATION"),
    programsController.getAllPrograms
);

router.get(
    '/colleges',
    middleware.validateAzureJWT,
    middleware.hasPermission("VIEW_ORGANIZATION"),
    programsController.getAllColleges
);

router.post(
    '/programs',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_PROGRAMS"),
    programsController.createProgram
);

router.put(
    '/programs',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_PROGRAMS"),
    programsController.updateProgram
);

router.delete(
    '/programs',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_PROGRAMS"),
    programsController.deleteProgram
);

module.exports = router;