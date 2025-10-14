const express = require('express');
const router = express.Router();
const approvalController = require('../controllers/approvalController');
const middleware = require('../../middlewares/middleWare');

// =====================================================================
// APPROVAL CHAIN ROUTES
// =====================================================================

/**
 * @route   GET /api/approvals/my-pending
 * @desc    Get all pending approvals for current user
 * @access  Private (Approver roles)
 */
router.get(
    '/my-pending',
    middleware.validateAzureJWT,
    approvalController.getMyPendingApprovals
);

/**
 * @route   GET /api/approvals/chain/:applicationId
 * @desc    Get complete approval chain for application
 * @access  Private
 */
router.get(
    '/chain/:applicationId',
    middleware.validateAzureJWT,
    approvalController.getApprovalChain
);

/**
 * @route   POST /api/approvals/chain/:chainId/receive
 * @desc    Mark approval step as received
 * @access  Private (Must be the assigned approver)
 */
router.post(
    '/chain/:chainId/receive',
    middleware.validateAzureJWT,
    approvalController.markApprovalReceived
);

/**
 * @route   POST /api/approvals/chain/:chainId/sign
 * @desc    Sign approval step with e-signature
 * @access  Private (Must be the assigned approver with e-signature uploaded)
 * @body    { notes: string (optional) }
 */
router.post(
    '/chain/:chainId/sign',
    middleware.validateAzureJWT,
    approvalController.signApprovalStep
);

/**
 * @route   POST /api/approvals/chain/:chainId/approve
 * @desc    Approve approval step (for FINAL approvers only: SDAO Rank 2 & Academic Director)
 * @access  Private (Must be assigned approver with is_final_approval = TRUE)
 * @body    { remarks: string (REQUIRED for final approvers) }
 */
router.post(
    '/chain/:chainId/approve',
    middleware.validateAzureJWT,
    approvalController.approveApprovalStep
);

/**
 * @route   POST /api/approvals/chain/:chainId/reject
 * @desc    Reject approval step - sends application back to applicant for resubmission
 * @access  Private (Must be the assigned approver - ANY approver can reject)
 * @body    { reason: string (REQUIRED - minimum 10 characters) }
 */
router.post(
    '/chain/:chainId/reject',
    middleware.validateAzureJWT,
    approvalController.rejectApprovalStep
);

/**
 * @route   POST /api/approvals/faculty-selection
 * @desc    Submit faculty selection for extra-curricular organization
 * @access  Private (Must be application student)
 * @body    { application_id: number, period_id: number, faculty_ids: [string, string] }
 */
router.post(
    '/faculty-selection',
    middleware.validateAzureJWT,
    approvalController.submitFacultySelection
);

/**
 * @route   GET /api/approvals/validate/:applicationId
 * @desc    Check if approval chain is complete
 * @access  Private
 */
router.get(
    '/validate/:applicationId',
    middleware.validateAzureJWT,
    approvalController.validateApprovalChain
);

/**
 * @route   GET /api/faculty/by-program/:programId
 * @desc    Get faculty members for program (for extra-curricular selection)
 * @access  Private
 */
router.get(
    '/faculty/by-program/:programId',
    middleware.validateAzureJWT,
    approvalController.getFacultyByProgram
);

/**
 * @route   GET /api/approvals/check-esignature
 * @desc    Check if current user has uploaded e-signature
 * @access  Private
 */
router.get(
    '/check-esignature',
    middleware.validateAzureJWT,
    approvalController.checkUserESignature
);

module.exports = router;
