import { Router } from 'express';
import { validateAzureJWT } from '../../middlewares/middleWare';
import * as ctrl from '../controllers/manageRolesController';

const router = Router();

router.get('/organization-permissions', validateAzureJWT, ctrl.getOrgPermissions);
router.get('/organization-committee-roles', validateAzureJWT, ctrl.getCommitteeRoles);
router.get('/organization-executives-roles', validateAzureJWT, ctrl.getExecutiveRoles);
router.get('/member-permission-overrides', validateAzureJWT, ctrl.getMemberOverrides);
router.get('/getEmailSuggestion-override', validateAzureJWT, ctrl.getEmailSuggestions);

router.put('/update-committee-role-permissions', validateAzureJWT, ctrl.updateCommitteePermissions);
router.put('/update-executive-role-permissions', validateAzureJWT, ctrl.updateExecutivePermissions);
router.post('/add-override-permission', validateAzureJWT, ctrl.addOverridePermission);
router.put('/update-member-permissions', validateAzureJWT, ctrl.updateMemberPermissions);
router.post('/remove-member-permissions', validateAzureJWT, ctrl.removeMemberPermissions);

export default router;
