/**
 * web/routes/approval.ts
 *
 * Routes for the Approval System (V2).
 *
 * Mounted at /api/web/approvals in server.ts.
 *
 * All routes require Azure AD JWT authentication.
 */

import { Router } from 'express';
import { validateAzureJWT } from '../../middlewares/middleWare';
import {
  getApprovalChain,
  markApprovalReceived,
  signApprovalStep,
  approveApprovalStep,
  rejectApprovalStep,
  checkUserESignature,
  getMyPendingApprovals,
  getFacultyByProgram,
  submitFacultySelection,
  validateApprovalChain,
} from '../controllers/approvalController';

const router = Router();

// =====================================================================
// APPROVAL CHAIN ROUTES
// =====================================================================

/**
 * @route   GET /api/web/approvals/my-pending
 * @desc    Get all pending approvals for current user
 */
router.get('/my-pending', validateAzureJWT, getMyPendingApprovals);

/**
 * @route   GET /api/web/approvals/check-esignature
 * @desc    Check if current user has uploaded e-signature
 */
router.get('/check-esignature', validateAzureJWT, checkUserESignature);

/**
 * @route   GET /api/web/approvals/chain/:applicationId
 * @desc    Get complete approval chain for application
 */
router.get('/chain/:applicationId', validateAzureJWT, getApprovalChain);

/**
 * @route   POST /api/web/approvals/chain/:chainId/receive
 * @desc    Mark approval step as received with e-signature
 */
router.post('/chain/:chainId/receive', validateAzureJWT, markApprovalReceived);

/**
 * @route   POST /api/web/approvals/chain/:chainId/sign
 * @desc    Sign approval step with e-signature
 */
router.post('/chain/:chainId/sign', validateAzureJWT, signApprovalStep);

/**
 * @route   POST /api/web/approvals/chain/:chainId/approve
 * @desc    Approve approval step (for FINAL approvers only)
 */
router.post('/chain/:chainId/approve', validateAzureJWT, approveApprovalStep);

/**
 * @route   POST /api/web/approvals/chain/:chainId/reject
 * @desc    Reject approval step
 */
router.post('/chain/:chainId/reject', validateAzureJWT, rejectApprovalStep);

/**
 * @route   POST /api/web/approvals/faculty-selection
 * @desc    Submit faculty selection for extra-curricular organization
 */
router.post('/faculty-selection', validateAzureJWT, submitFacultySelection);

/**
 * @route   GET /api/web/approvals/validate/:applicationId
 * @desc    Check if approval chain is complete
 */
router.get('/validate/:applicationId', validateAzureJWT, validateApprovalChain);

/**
 * @route   GET /api/web/approvals/faculty/by-program/:programId
 * @desc    Get faculty members for program (for extra-curricular selection)
 */
router.get('/faculty/by-program/:programId', validateAzureJWT, getFacultyByProgram);

export default router;
