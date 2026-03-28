/**
 * web/routes/termsRoutes.ts
 *
 * TypeScript routes for Academic Terms management.
 * Mounted at /api/web/term-payments in server.ts.
 *
 *   GET    /term-payments/terms/current  — active term (any authenticated user)
 *   GET    /term-payments/terms          — all terms (any authenticated user)
 *   POST   /term-payments/terms          — create (MANAGE_TERM_PAYMENTS)
 *   PUT    /term-payments/terms/:id      — update (MANAGE_TERM_PAYMENTS)
 *   DELETE /term-payments/terms/:id      — delete (MANAGE_TERM_PAYMENTS)
 */

import { Router } from 'express';
import { validateAzureJWT, hasPermission } from '../../middlewares/middleWare';
import * as ctrl from '../controllers/termsController';

const router = Router();

// GET /api/web/term-payments/terms/current
router.get('/terms/current', validateAzureJWT, ctrl.getCurrentActiveTerm);

// GET /api/web/term-payments/terms
router.get('/terms', validateAzureJWT, ctrl.getAllTerms);

// POST /api/web/term-payments/terms
router.post('/terms', validateAzureJWT, hasPermission('MANAGE_TERM_PAYMENTS'), ctrl.createTerm);

// PUT /api/web/term-payments/terms/:id
router.put('/terms/:id', validateAzureJWT, hasPermission('MANAGE_TERM_PAYMENTS'), ctrl.updateTerm);

// DELETE /api/web/term-payments/terms/:id
router.delete('/terms/:id', validateAzureJWT, hasPermission('MANAGE_TERM_PAYMENTS'), ctrl.deleteTerm);

export default router;
