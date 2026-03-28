import { Router } from 'express';
import { validateAzureJWT, hasPermission } from '../../middlewares/middleWare';
import * as accountController from '../controllers/accountController';
import * as collegesController from '../controllers/collegesController';
import * as programsController from '../controllers/programsController';
import * as sectionController from '../controllers/sectionController';

const router = Router();

const requireAuth = validateAzureJWT;
const requireManage = hasPermission('MANAGE_ACCOUNT');
const requireViewOrg = hasPermission('VIEW_ORGANIZATION');

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

// GET  /api/web/manage/accounts
router.get('/manage/accounts', requireAuth, requireManage, accountController.getAccounts);

// POST /api/web/manage/accounts
router.post('/manage/accounts', requireAuth, requireManage, accountController.addAccount);

// PUT  /api/web/manage/accounts  (update — must come BEFORE unarchive to avoid prefix collision)
router.put('/manage/accounts', requireAuth, requireManage, accountController.updateAccount);

// PUT  /api/web/manage/accounts/unarchive/:user_id
router.put('/manage/accounts/unarchive/:user_id', requireAuth, requireManage, accountController.unarchiveAccount);

// DELETE /api/web/manage/accounts/:email
router.delete('/manage/accounts/:email', requireAuth, requireManage, accountController.deleteAccount);

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

// GET /api/web/manage/roles
router.get('/manage/roles', requireAuth, requireManage, accountController.getRoles);

// ---------------------------------------------------------------------------
// Programs (used by accounts dropdown — requires auth)
// ---------------------------------------------------------------------------

// GET /api/web/get-programs
router.get('/get-programs', requireAuth, accountController.getPrograms);

// GET /api/web/manage/programs (alias)
router.get('/manage/programs', requireAuth, requireManage, accountController.getPrograms);

// ---------------------------------------------------------------------------
// SDAO Ranks
// ---------------------------------------------------------------------------

// GET /api/web/manage/sdao-ranks/available?exclude_user_id=...
router.get('/manage/sdao-ranks/available', requireAuth, requireManage, accountController.getAvailableSdaoRanks);

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

// GET /api/web/sections?programId=...
router.get('/sections', requireAuth, accountController.getSections);

// ---------------------------------------------------------------------------
// Pending User Applications
// ---------------------------------------------------------------------------

// GET /api/web/manage/pending-users-applications
router.get('/manage/pending-users-applications', requireAuth, requireManage, accountController.getPendingApplications);

// POST /api/web/manage/user-application/approve
router.post('/manage/user-application/approve', requireAuth, requireManage, accountController.approveUserApplication);

// POST /api/web/manage/user-application/reject
router.post('/manage/user-application/reject', requireAuth, requireManage, accountController.rejectUserApplication);

// ---------------------------------------------------------------------------
// Resend invitation
// ---------------------------------------------------------------------------

// POST /api/web/manage/resend-invitation
router.post('/manage/resend-invitation', requireAuth, requireManage, accountController.resendInvitation);

// ---------------------------------------------------------------------------
// Colleges
// ---------------------------------------------------------------------------

// GET  /api/web/colleges
router.get('/colleges', requireAuth, requireViewOrg, collegesController.getAllColleges);

// POST /api/web/colleges
router.post('/colleges', requireAuth, requireManage, collegesController.createCollege);

// PUT  /api/web/colleges
router.put('/colleges', requireAuth, requireManage, collegesController.updateCollege);

// POST /api/web/colleges/archive
router.post('/colleges/archive', requireAuth, requireManage, collegesController.archiveCollege);

// POST /api/web/colleges/unarchive
router.post('/colleges/unarchive', requireAuth, requireManage, collegesController.unarchiveCollege);

// ---------------------------------------------------------------------------
// Programs (management CRUD)
// ---------------------------------------------------------------------------

// GET  /api/web/programs
router.get('/programs', requireAuth, requireViewOrg, programsController.getAllPrograms);

// POST /api/web/programs
router.post('/programs', requireAuth, requireManage, programsController.createProgram);

// PUT  /api/web/programs
router.put('/programs', requireAuth, requireManage, programsController.updateProgram);

// POST /api/web/programs/archive
router.post('/programs/archive', requireAuth, requireManage, programsController.archiveProgram);

// POST /api/web/programs/unarchive
router.post('/programs/unarchive', requireAuth, requireManage, programsController.unarchiveProgram);

// ---------------------------------------------------------------------------
// Sections (management mutations — GET is handled above under Accounts)
// ---------------------------------------------------------------------------

// POST /api/web/sections
router.post('/sections', requireAuth, requireManage, sectionController.createSection);

// PUT  /api/web/sections/:section_id
router.put('/sections/:section_id', requireAuth, requireManage, sectionController.updateSection);

// DELETE /api/web/sections/:section_id
router.delete('/sections/:section_id', requireAuth, requireManage, sectionController.archiveSection);

// POST /api/web/sections/:section_id/unarchive
router.post('/sections/:section_id/unarchive', requireAuth, requireManage, sectionController.unarchiveSection);

export default router;
