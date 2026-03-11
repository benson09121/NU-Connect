/**
 * web/routes/venuesRoutes.ts
 *
 * TypeScript routes for Venue management.
 *
 *   GET    /venues                  — list venues (with optional availability check)
 *   POST   /venues                  — create venue  (MANAGE_VENUES)
 *   PUT    /venues/:id              — update venue  (MANAGE_VENUES)
 *   PUT    /venues/:id/archive      — archive venue (MANAGE_VENUES)
 *   PUT    /venues/:id/unarchive    — restore venue (MANAGE_VENUES)
 *
 * Mounted at /api/web in server.ts.
 */

import { Router } from 'express';
import { validateAzureJWT, hasPermission } from '../../middlewares/middleWare';
import * as ctrl from '../controllers/venuesController';

const router = Router();

// Any authenticated user can see the list of venues (needed for event-creation dropdowns)
router.get('/venues', validateAzureJWT, ctrl.getVenues);

// Mutations require MANAGE_VENUES permission
router.post('/venues', validateAzureJWT, hasPermission('MANAGE_VENUES'), ctrl.createVenue);
router.put('/venues/:id', validateAzureJWT, hasPermission('MANAGE_VENUES'), ctrl.updateVenue);
router.put('/venues/:id/archive', validateAzureJWT, hasPermission('MANAGE_VENUES'), ctrl.archiveVenue);
router.put('/venues/:id/unarchive', validateAzureJWT, hasPermission('MANAGE_VENUES'), ctrl.unarchiveVenue);

export default router;
