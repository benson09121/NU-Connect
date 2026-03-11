const express = require('express');
const router = express.Router();
const sectionController = require('../controllers/sectionController');
const middleware = require('../../middlewares/middleWare');

/**
 * All section routes require MANAGE_PROGRAMS permission
 * This reuses the existing permission that controls program and college management
 */

/**
 * @route   GET /api/web/sections
 * @desc    Get all sections with optional filters
 * @query   programId (optional) - Filter by program ID
 * @query   isActive (optional) - Filter by active status (true/false)
 * @access  Private - Requires MANAGE_PROGRAMS permission
 */
router.get(
  '/sections',
  middleware.validateAzureJWT,
  middleware.hasPermission('MANAGE_PROGRAMS'),
  sectionController.getAllSections
);

/**
 * @route   GET /api/web/sections/:id
 * @desc    Get section by ID with assigned students
 * @param   id - Section ID
 * @access  Private - Requires MANAGE_PROGRAMS permission
 */
router.get(
  '/sections/:id',
  middleware.validateAzureJWT,
  middleware.hasPermission('MANAGE_PROGRAMS'),
  sectionController.getSectionById
);

/**
 * @route   POST /api/web/sections
 * @desc    Create a new section
 * @body    { sectionName, programId }
 * @access  Private - Requires MANAGE_PROGRAMS permission
 */
router.post(
  '/sections',
  middleware.validateAzureJWT,
  middleware.hasPermission('MANAGE_PROGRAMS'),
  sectionController.addSection
);

/**
 * @route   PUT /api/web/sections/:id
 * @desc    Update an existing section
 * @param   id - Section ID
 * @body    { sectionName }
 * @access  Private - Requires MANAGE_PROGRAMS permission
 */
router.put(
  '/sections/:id',
  middleware.validateAzureJWT,
  middleware.hasPermission('MANAGE_PROGRAMS'),
  sectionController.updateSection
);

/**
 * @route   DELETE /api/web/sections/:id
 * @desc    Archive a section
 * @param   id - Section ID
 * @access  Private - Requires MANAGE_PROGRAMS permission
 */
router.delete(
  '/sections/:id',
  middleware.validateAzureJWT,
  middleware.hasPermission('MANAGE_PROGRAMS'),
  sectionController.archiveSection
);

/**
 * @route   POST /api/web/sections/:id/unarchive
 * @desc    Unarchive a section
 * @param   id - Section ID
 * @access  Private - Requires MANAGE_PROGRAMS permission
 */
router.post(
  '/sections/:id/unarchive',
  middleware.validateAzureJWT,
  middleware.hasPermission('MANAGE_PROGRAMS'),
  sectionController.unarchiveSection
);

module.exports = router;
