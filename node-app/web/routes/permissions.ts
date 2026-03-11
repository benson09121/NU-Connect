import { Router } from 'express';
import {
  getMyPermissions,
  checkPermission,
  listSystemPermissions,
} from '../controllers/permissionController';
import { validateAzureJWT } from '../../middlewares/middleWare';


const router = Router();
// ── All routes use Azure AD token validation ────────────────────────────────
// The Bearer token is the MSAL access_token sent from the React frontend.
// validateAzureJWT decodes it via JWKS and sets req.user.email.

// Full permission bundle for the logged-in user
router.get('/me/permissions', validateAzureJWT, getMyPermissions);

// Quick single-permission check: GET /api/web/me/can/manage_events?orgId=1
router.get('/me/can/:permission', validateAzureJWT, checkPermission);

// Master list of all system permissions (useful for admin UIs)
router.get('/system/permissions', validateAzureJWT, listSystemPermissions);

export default router;