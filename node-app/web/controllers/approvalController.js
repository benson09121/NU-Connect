const pool = require('../../config/db');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const copyFileAsync = promisify(fs.copyFile);
const axios = require('axios');
const { publishToChannel, publishOrgHub } = require('./sseController');
const { getApprovalChain: getApprovalChainModel } = require('../models/organizationsModel');
const { notifyOrganizationApproved } = require('../utils/organizationEvents');

// =====================================================================
// APPROVAL CHAIN CONTROLLER
// Handles organization approval workflow with e-signatures
// =====================================================================

/**
 * Get all pending approvals for current user
 * @route GET /api/approvals/my-pending
 */
exports.getMyPendingApprovals = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const userId = req.user.user_id;
        
        // Call stored procedure to get pending approvals
        const [result] = await connection.query(
            'CALL sp_GetMyPendingApprovals(?)',
            [userId]
        );
        
        const pendingApprovals = result[0];
        
        res.status(200).json({
            success: true,
            count: pendingApprovals.length,
            data: pendingApprovals.map(approval => ({
                chain_id: approval.chain_id,
                org_version_id: approval.org_version_id,
                org_name: approval.org_name,
                category: approval.category,
                program_name: approval.program_name,
                program_abbrev: approval.program_abbrev,
                approval_order: approval.approval_order,
                status: approval.status,
                created_at: approval.created_at,
                can_sign: approval.previous_unsigned_count === 0 && approval.has_signature > 0,
                has_signature: approval.has_signature > 0,
                previous_unsigned_count: approval.previous_unsigned_count
            }))
        });
        
    } catch (error) {
        console.error('❌ Error fetching pending approvals:', error);
        res.status(500).json({
            error: 'Failed to fetch pending approvals',
            message: error.message
        });
    } finally {
        connection.release();
    }
};

/**
 * Get complete approval chain for organization version
 * @route GET /api/approvals/chain/:applicationId
 */
exports.getApprovalChain = async (req, res) => {
    try {
        const { applicationId } = req.params;
        
        // Use model function instead of direct query
        const approvalChain = await getApprovalChainModel(applicationId);
        
        res.status(200).json({
            success: true,
            application_id: parseInt(applicationId),
            count: approvalChain.length,
            data: approvalChain.map(step => ({
                chain_id: step.chain_id,
                application_id: step.application_id,
                period_id: step.period_id,
                approver_user_id: step.approver_user_id,
                approver_name: step.approver_name,  // Already concatenated from procedure
                approver_email: step.approver_email,
                approver_role: step.approver_role,
                approval_order: step.approval_order,
                status: step.status,
                status_description: step.status_description,
                signature_path: step.signature_path,
                signature_url: step.signature_path ? `/${step.signature_path}` : null,
                is_final_approval: step.is_final_approval === 1,
                uses_endorsed: step.uses_endorsed === 1,
                has_signature: step.has_signature === 1,
                remarks: step.remarks,
                received_at: step.received_at,
                endorsed_at: step.endorsed_at,
                signed_at: step.signed_at,
                approved_at: step.approved_at,
                notes: step.notes,
                created_at: step.created_at
            }))
        });
        
    } catch (error) {
        console.error('❌ Error fetching approval chain:', error);
        res.status(500).json({
            error: 'Failed to fetch approval chain',
            message: error.message
        });
    }
};

/**
 * Mark approval step as received
 * @route POST /api/approvals/chain/:chainId/receive
 */
/**
 * Mark approval as received WITH e-signature (COMBINED ACTION)
 * @route POST /api/approvals/chain/:chainId/receive
 */
exports.markApprovalReceived = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { chainId } = req.params;
        const { notes } = req.body;
        const userEmail = req.user.email; // Use email, stored procedure will look up user_id
        
        console.log('🔐 [RECEIVE+SIGN] Request:', { chainId, userEmail, has_notes: !!notes });
        
        // Call NEW combined stored procedure: sp_ReceiveAndSignApproval
        // This marks as Received AND applies e-signature in ONE action
        const [result] = await connection.query(
            'CALL sp_ReceiveAndSignApproval(?, ?, ?)',
            [chainId, userEmail, notes || '']
        );
        
        const spResult = result[0][0];
        
        console.log('🔐 [RECEIVE+SIGN] Stored procedure result:', spResult);
        
        if (spResult.status === 'error') {
            return res.status(400).json({
                success: false,
                error: spResult.message
            });
        }
        
        // No file copying needed - we use the same user signature file
        console.log('✅ [RECEIVE+SIGN] Using signature filename:', spResult.signature_filename);
        
        // Get updated approval chain for real-time notification
        const [chainResult] = await connection.query(
            `SELECT ac.application_id, a.submitted_org_name 
             FROM tbl_organization_approval_chain ac
             JOIN tbl_application a ON ac.application_id = a.application_id
             WHERE ac.chain_id = ?`,
            [chainId]
        );
        
        if (chainResult.length > 0) {
            const { application_id, submitted_org_name } = chainResult[0];
            
            // Fetch fresh approval chain
            const [approvalChain] = await connection.query(
                'CALL sp_GetApprovalChain(?)',
                [application_id]
            );
            
            // Publish real-time update
            try {
                publishToChannel(`application_approval_timeline_${submitted_org_name}_${application_id}`, {
                    type: 'approval_received_and_signed',
                    chain_id: chainId,
                    application_id: application_id,
                    org_name: submitted_org_name,
                    approver_email: userEmail,
                    data: approvalChain[0]
                });
            } catch (sseError) {
                console.error('⚠️ Failed to publish real-time update:', sseError);
            }
        }
        
        res.status(200).json({
            success: true,
            message: 'Approval received with e-signature successfully',
            chain_id: chainId,
            signature_path: spResult.signature_filename
        });
        
    } catch (error) {
        console.error('❌ [RECEIVE+SIGN] Error:', error);
        res.status(500).json({
            error: 'Failed to receive approval with e-signature',
            message: error.message
        });
    } finally {
        connection.release();
    }
};

/**
 * Sign approval step with e-signature
 * @route POST /api/approvals/chain/:chainId/sign
 */
exports.signApprovalStep = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { chainId } = req.params;
        const userId = req.user.user_id;
        const { notes } = req.body;
        
        // Call stored procedure to sign approval
        const [result] = await connection.query(
            'CALL sp_SignApprovalStep(?, ?, ?)',
            [chainId, userId, notes || null]
        );
        
        const spResult = result[0][0];
        
        if (spResult.status === 'error') {
            return res.status(400).json({
                success: false,
                error: spResult.message
            });
        }
        
        // Copy user's e-signature to approval-signatures directory
        if (spResult.user_signature_path && spResult.approval_signature_path) {
            try {
                const sourcePath = path.join(__dirname, '../../../', spResult.user_signature_path);
                const destPath = path.join(__dirname, '../../../', spResult.approval_signature_path);
                
                // Ensure approval-signatures directory exists
                const destDir = path.dirname(destPath);
                if (!fs.existsSync(destDir)) {
                    fs.mkdirSync(destDir, { recursive: true });
                }
                
                // Copy signature file
                await copyFileAsync(sourcePath, destPath);
                console.log(`✅ Copied e-signature: ${spResult.user_signature_path} → ${spResult.approval_signature_path}`);
            } catch (copyError) {
                console.error('⚠️ Failed to copy e-signature file:', copyError);
                // Don't fail the request if file copy fails - signature is stored in DB
            }
        }
        
        // Get application_id and submitted_org_name for real-time notification
        const [chainResult] = await connection.query(
            `SELECT ac.application_id, a.submitted_org_name 
             FROM tbl_organization_approval_chain ac
             JOIN tbl_application a ON ac.application_id = a.application_id
             WHERE ac.chain_id = ?`,
            [chainId]
        );
        
        if (chainResult.length > 0) {
            const { application_id, submitted_org_name } = chainResult[0];
            
            // Fetch fresh approval chain
            const [approvalChain] = await connection.query(
                'CALL sp_GetApprovalChain(?)',
                [application_id]
            );
            
            // Check if approval chain is complete
            const [validationResult] = await connection.query(
                'CALL sp_ValidateApprovalChain(?)',
                [application_id]
            );
            
            const validation = validationResult[0][0];
            
            // Publish real-time update
            try {
                publishToChannel(`application_approval_timeline_${submitted_org_name}_${application_id}`, {
                    type: 'approval_signed',
                    chain_id: chainId,
                    application_id: application_id,
                    org_name: submitted_org_name,
                    approver_id: userId,
                    is_complete: validation.is_complete,
                    data: approvalChain[0]
                });
            } catch (sseError) {
                console.error('⚠️ Failed to publish real-time update:', sseError);
            }
        }
        
        res.status(200).json({
            success: true,
            message: 'Approval signed successfully',
            chain_id: chainId,
            signature_path: spResult.approval_signature_path
        });
        
    } catch (error) {
        console.error('❌ Error signing approval:', error);
        res.status(500).json({
            error: 'Failed to sign approval',
            message: error.message
        });
    } finally {
        connection.release();
    }
};

/**
 * Validate if approval chain is complete
 * @route GET /api/approvals/validate/:orgVersionId
 */
exports.validateApprovalChain = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { orgVersionId } = req.params;
        
        // Call stored procedure to validate
        const [result] = await connection.query(
            'CALL sp_ValidateApprovalChain(?)',
            [orgVersionId]
        );
        
        const validation = result[0][0];
        
        res.status(200).json({
            success: true,
            data: {
                is_complete: validation.is_complete === 1,
                total_steps: validation.total_steps,
                signed_steps: validation.signed_steps,
                remaining_steps: validation.remaining_steps,
                message: validation.message
            }
        });
        
    } catch (error) {
        console.error('❌ Error validating approval chain:', error);
        res.status(500).json({
            error: 'Failed to validate approval chain',
            message: error.message
        });
    } finally {
        connection.release();
    }
};

/**
 * Approve approval step (for FINAL approvers only)
 * @route POST /api/approvals/chain/:chainId/approve
 */
exports.approveApprovalStep = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { chainId } = req.params;
        const userId = req.user.user_id;
        const userEmail = req.user.email;
        const { remarks } = req.body;
        
        console.log('🔐 [APPROVE] Starting approval with e-signature:', { 
            chainId, 
            userId, 
            userEmail,
            hasRemarks: !!remarks 
        });
        
        // Get approval chain details and user's e-signature
        const [chainInfo] = await connection.query(
            `SELECT 
                ac.chain_id,
                ac.application_id,
                ac.approver_user_id,
                ac.is_final_approval,
                ac.approval_order,
                es.signature_path as user_signature_path,
                a.submitted_org_name
             FROM tbl_organization_approval_chain ac
             LEFT JOIN tbl_user_esignature es ON ac.approver_user_id = es.user_id
             LEFT JOIN tbl_application a ON ac.application_id = a.application_id
             WHERE ac.chain_id = ?`,
            [chainId]
        );
        
        if (chainInfo.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Approval chain step not found'
            });
        }
        
        const chainData = chainInfo[0];
        
        // Verify user has e-signature
        if (!chainData.user_signature_path) {
            return res.status(400).json({
                success: false,
                error: 'E-signature not found. Please upload your e-signature first.'
            });
        }
        
        // Extract just the filename from the user's signature path
        const signatureFilename = path.basename(chainData.user_signature_path);
        console.log('🔐 [APPROVE] Using e-signature filename:', signatureFilename);
        
        // STEP 1: Update signature_path BEFORE calling stored procedure
        // This ensures the signature is saved regardless of approval outcome
        await connection.query(
            `UPDATE tbl_organization_approval_chain 
             SET signature_path = ?
             WHERE chain_id = ?`,
            [signatureFilename, chainId]
        );
        console.log('✅ [APPROVE] Signature saved to approval chain');
        
        // STEP 2: Call stored procedure to approve (with remarks parameter)
        console.log('📞 [APPROVE] Calling sp_ApproveApplicationStep with:', { chainId, remarks: remarks || null });
        const [result] = await connection.query(
            'CALL sp_ApproveApplicationStep(?, ?)',
            [chainId, remarks || null]
        );
        
        let spResult = result[0][0];
        
        // COMPATIBILITY FIX: Handle old stored procedure format
        // Old format: { result: { organization: {...}, other: {...} } }
        // New format: { organization_created: true, organization_id: ..., ... }
        if (spResult && spResult.result) {
            const oldResult = spResult.result;
            spResult = {
                message: 'Application fully approved - organization created successfully',
                organization_created: !!(oldResult.organization && oldResult.organization.id),
                organization_id: oldResult.organization?.id || null,
                org_version_id: oldResult.other?.org_version_id || null,
                organization_name: oldResult.organization?.name || null,
                organization_logo: oldResult.other?.organization_logo || oldResult.organization?.logo || null,
                application_id: oldResult.application?.id || null,
                _original: oldResult  // Keep original for reference
            };
            console.log('✅ [APPROVE] Converted to new format:', JSON.stringify(spResult, null, 2));
        }
        
        if (spResult && spResult.status === 'error') {
            return res.status(400).json({
                success: false,
                error: spResult.message
            });
        }
        
        // Fetch fresh approval chain
        const [approvalChain] = await connection.query(
            'CALL sp_GetApprovalChain(?)',
            [chainData.application_id]
        );
        
        // Check if this was a final approval
        const isFinalApproval = chainData.is_final_approval === 1;
        
        // DEBUG: Log approval step completion details
        console.log('🔍 [DEBUG] Approval step completion details:', {
            isFinalApproval,
            chainData_is_final_approval: chainData.is_final_approval,
            spResult_exists: !!spResult,
            spResult_organization_created: spResult?.organization_created,
            spResult_full: JSON.stringify(spResult, null, 2)
        });
        
        // Publish real-time update
        try {
            publishToChannel(`application_approval_timeline_${chainData.submitted_org_name}_${chainData.application_id}`, {
                type: 'approval_approved',
                chain_id: chainId,
                application_id: chainData.application_id,
                org_name: chainData.submitted_org_name,
                approver_id: userId,
                approver_email: userEmail,
                is_final_approval: isFinalApproval,
                data: approvalChain[0]
            });
        } catch (sseError) {
            console.error('⚠️ [APPROVE] Failed to publish real-time update:', sseError);
        }
        
        // =====================================================================
        // POST-APPROVAL PROCESSING (FINAL APPROVER ONLY)
        // Restore missing functionality from old approval system
        // =====================================================================
        console.log('🔍 [DEBUG] Checking post-approval conditions:', {
            condition1_isFinalApproval: isFinalApproval,
            condition2_spResult_exists: !!spResult,
            condition3_organization_created: spResult?.organization_created,
            will_execute_post_approval: isFinalApproval && spResult?.organization_created
        });
        
        if (isFinalApproval && spResult?.organization_created) {
            console.log('🎉 [POST-APPROVAL] Starting post-approval processing for final approval...');
            const orgId = spResult.organization_id;
            const orgVersionId = spResult.org_version_id;
            const appId = chainData.application_id;
            const logoName = spResult.organization_logo;
            const orgName = chainData.submitted_org_name;
            
            console.log('🔍 [POST-APPROVAL] Extracted values from spResult:', {
                orgId,
                orgVersionId,
                appId,
                logoName,
                orgName,
                spResult_keys: Object.keys(spResult || {})
            });
            
            // ADDITIONAL CHECK: Query database directly to verify logo filename
            try {
                const [appData] = await connection.query(
                    'SELECT application_id, submitted_org_logo FROM tbl_application WHERE application_id = ?',
                    [appId]
                );
                console.log('🔍 [POST-APPROVAL] Application data from database:', appData[0]);
                
                const [orgData] = await connection.query(
                    'SELECT organization_id, logo FROM tbl_organization WHERE organization_id = ?',
                    [orgId]
                );
                console.log('🔍 [POST-APPROVAL] Organization data from database:', orgData[0]);
            } catch (dbCheckError) {
                console.error('❌ [POST-APPROVAL] Error checking database:', dbCheckError);
            }
            
            // 1. COPY LOGO FILE from application temp folder to organization folder
            try {
                console.log('📁 [LOGO-COPY] Checking requirements for logo copy...');
                console.log('📁 [LOGO-COPY] Required values:', {
                    appId: { value: appId, type: typeof appId, truthy: !!appId },
                    orgId: { value: orgId, type: typeof orgId, truthy: !!orgId },
                    orgVersionId: { value: orgVersionId, type: typeof orgVersionId, truthy: !!orgVersionId },
                    logoName: { value: logoName, type: typeof logoName, truthy: !!logoName }
                });
                
                if (appId && orgId && orgVersionId && logoName) {
                    const srcLogoPath = path.join('/app/applications', String(appId), 'logo', logoName);
                    const destLogoDir = path.join('/app/organizations', String(orgId), String(orgVersionId), 'logo');
                    const destLogoPath = path.join(destLogoDir, logoName);
                    
                    console.log('📁 [LOGO-COPY] Starting logo copy operation:', {
                        appId,
                        orgId,
                        orgVersionId,
                        logoName,
                        from: srcLogoPath,
                        to: destLogoPath
                    });
                    
                    // Check if application directory exists
                    const appDir = path.join('/app/applications', String(appId));
                    if (fs.existsSync(appDir)) {
                        console.log('✅ [LOGO-COPY] Application directory exists:', appDir);
                        
                        // List contents of application directory
                        try {
                            const appDirContents = fs.readdirSync(appDir);
                            console.log('📋 [LOGO-COPY] Application directory contents:', appDirContents);
                            
                            const logoDir = path.join(appDir, 'logo');
                            if (fs.existsSync(logoDir)) {
                                const logoDirContents = fs.readdirSync(logoDir);
                                console.log('📋 [LOGO-COPY] Logo directory contents:', logoDirContents);
                            } else {
                                console.warn('⚠️ [LOGO-COPY] Logo directory does not exist:', logoDir);
                            }
                        } catch (listErr) {
                            console.error('❌ [LOGO-COPY] Error listing directory:', listErr);
                        }
                    } else {
                        console.warn('⚠️ [LOGO-COPY] Application directory does not exist:', appDir);
                    }
                    
                    // Check if source file exists
                    if (!fs.existsSync(srcLogoPath)) {
                        console.warn('⚠️ [LOGO-COPY] Source logo file does not exist:', srcLogoPath);
                        console.log('🔍 [LOGO-COPY] Looking for any logo files with similar names...');
                        const logoDir = path.join('/app/applications', String(appId), 'logo');
                        if (fs.existsSync(logoDir)) {
                            const files = fs.readdirSync(logoDir);
                            console.log('📋 [LOGO-COPY] Available logo files:', files);
                        }
                    } else {
                        console.log('✅ [LOGO-COPY] Source logo file found:', srcLogoPath);
                        
                        // Create all parent directories recursively
                        fs.mkdirSync(destLogoDir, { recursive: true });
                        console.log('✅ [LOGO-COPY] Destination directory created/verified:', destLogoDir);
                        
                        // Copy logo file
                        fs.copyFileSync(srcLogoPath, destLogoPath);
                        console.log('✅ [LOGO-COPY] Logo file copied successfully to:', destLogoPath);
                        
                        // Verify the copied file exists
                        if (fs.existsSync(destLogoPath)) {
                            const stats = fs.statSync(destLogoPath);
                            console.log('✅ [LOGO-COPY] Verification successful - File size:', stats.size, 'bytes');
                        } else {
                            console.error('❌ [LOGO-COPY] Verification failed - Destination file not found after copy');
                        }
                    }
                } else {
                    console.warn('⚠️ [LOGO-COPY] Missing required info for logo copy:', { 
                        appId, orgId, orgVersionId, logoName 
                    });
                }
            } catch (copyErr) {
                console.error('❌ [LOGO-COPY] Error copying logo file:', copyErr);
                console.error('❌ [LOGO-COPY] Error stack:', copyErr.stack);
                // Don't fail the request - logo copy is best-effort
            }
            
            // 2. SEND INVITATION EMAILS to officers with status='Pending'
            try {
                const organizationsModel = require('../models/organizationsModel');
                const emailService = require('../../services/emailService');
                const msal = require('@azure/msal-node');
                
                const officers = await organizationsModel.getApplicationOfficers(appId);
                console.log('📧 [EMAIL] Retrieved officers for email invitations:', {
                    total: officers ? officers.length : 0,
                    pendingCount: officers ? officers.filter(o => o.status === 'Pending').length : 0
                });
                
                if (officers && officers.length > 0) {
                    const cca = new msal.ConfidentialClientApplication({
                        auth: {
                            clientId: process.env.AZURE_CLIENT_ID,
                            clientSecret: process.env.AZURE_CLIENT_SECRET,
                            authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
                        },
                    });
                    
                    async function getAccessToken(cca) {
                        const response = await cca.acquireTokenByClientCredential({
                            scopes: ['https://graph.microsoft.com/.default'],
                        });
                        return response.accessToken;
                    }
                    
                    for (const officer of officers) {
                        if (officer.email && officer.email.includes('@') && officer.status === 'Pending') {
                            try {
                                console.log(`📧 [EMAIL] Sending invitation to: ${officer.email}`);
                                const accessToken = await getAccessToken(cca);
                                const response = await axios.post(
                                    'https://graph.microsoft.com/v1.0/invitations',
                                    {
                                        invitedUserEmailAddress: officer.email,
                                        inviteRedirectUrl: process.env.FRONTEND_URL || 'https://nuconnect.azurewebsites.net',
                                        sendInvitationMessage: false,
                                    },
                                    { headers: { Authorization: `Bearer ${accessToken}` } }
                                );
                                const redemptionUrl = response.data.inviteRedeemUrl;
                                await emailService.sendInvitationEmail(officer.email, redemptionUrl);
                                console.log(`✅ [EMAIL] Invitation sent successfully to: ${officer.email}`);
                            } catch (emailError) {
                                console.error(`❌ [EMAIL] Failed to send email to ${officer.email}:`, emailError);
                                // Continue with other emails - don't fail the request
                            }
                        }
                    }
                } else {
                    console.log('⚠️ [EMAIL] No officers found for email invitations');
                }
            } catch (emailError) {
                console.error('❌ [EMAIL] Error sending invitation emails:', emailError);
                // Don't fail the request - emails are best-effort
            }
            
            // 3. SEND REAL-TIME SSE NOTIFICATIONS to organization members
            try {
                const organizationsModel = require('../models/organizationsModel');
                const officers = await organizationsModel.getApplicationOfficers(appId);
                
                console.log('🔔 [SSE] Preparing real-time approval notifications:', {
                    orgId,
                    orgVersionId,
                    orgName,
                    officersFound: officers ? officers.length : 0
                });
                
                if (officers && officers.length > 0) {
                    const memberEmails = officers.map(officer => officer.email).filter(email => email && email.includes('@'));
                    
                    // Delay notifications to ensure database consistency
                    setTimeout(async () => {
                        try {
                            const completeOrgData = {
                                organization_id: orgId,
                                organization_version_id: orgVersionId,
                                name: orgName,
                                status: 'Approved',
                                ...spResult
                            };
                            
                            console.log('🚀 [SSE] Sending organization approval notifications...');
                            await notifyOrganizationApproved(completeOrgData, memberEmails);
                            console.log('✅ [SSE] Organization approval notifications sent successfully');
                        } catch (delayedNotificationError) {
                            console.error('❌ [SSE] Failed to send delayed organization approval notifications:', delayedNotificationError);
                        }
                    }, 1000); // 1 second delay
                } else {
                    console.log('⚠️ [SSE] No officers found for SSE notifications');
                }
            } catch (notificationError) {
                console.error('❌ [SSE] Failed to prepare organization approval notifications:', notificationError);
                // Don't fail the request - notifications are best-effort
            }
            
            // 4. GENERATE APPLICATION FORM DOCUMENTS ASYNCHRONOUSLY (non-blocking)
            console.log('🚀 [ASYNC] Document generation will run in background for application:', appId);
            
            // Use setImmediate to ensure response is sent to client first
            setImmediate(async () => {
                const docConnection = await pool.getConnection();
                try {
                    const documentGenerationService = require('../services/documentGenerationService');
                    const { publishToChannel } = require('./sseController');
                    
                    // Mark as processing
                    await documentGenerationService.updateDocumentStatus(appId, 'docx', null, 'processing');
                    
                    // Generate DOCX
                    const docxPath = await documentGenerationService.generateApplicationForm(appId, 'docx');
                    
                    // Send SSE event for DOCX completion
                    publishToChannel(`application_${appId}`, {
                        type: 'document-generation-progress',
                        application_id: appId,
                        format: 'docx',
                        status: 'completed',
                        download_url: `/api/web/download-application-form/${appId}?format=docx`
                    });
                    
                    // Generate PDF
                    const pdfPath = await documentGenerationService.generateApplicationForm(appId, 'pdf');
                    
                    // Send SSE event for complete generation
                    publishToChannel(`application_${appId}`, {
                        type: 'document-generation-complete',
                        application_id: appId,
                        documents: {
                            docx: {
                                available: true,
                                download_url: `/api/web/download-application-form/${appId}?format=docx`
                            },
                            pdf: {
                                available: true,
                                download_url: `/api/web/download-application-form/${appId}?format=pdf`
                            }
                        }
                    });
                    
                    console.log('✅ [ASYNC-DOC-GEN] Background document generation completed successfully');
                    
                } catch (docError) {
                    console.error('❌ [ASYNC-DOC-GEN] Error in background document generation:', docError);
                    
                    // Mark as failed in database
                    try {
                        const documentGenerationService = require('../services/documentGenerationService');
                        await documentGenerationService.updateDocumentStatus(appId, 'docx', null, 'failed');
                        await documentGenerationService.updateDocumentStatus(appId, 'pdf', null, 'failed');
                    } catch (updateError) {
                        console.error('❌ [ASYNC-DOC-GEN] Failed to update error status:', updateError);
                    }
                    
                    // Send SSE event for failure
                    const { publishToChannel } = require('./sseController');
                    publishToChannel(`application_${appId}`, {
                        type: 'document-generation-failed',
                        application_id: appId,
                        error: docError.message
                    });
                } finally {
                    docConnection.release();
                }
            });
            
            console.log('✅ [POST-APPROVAL] Post-approval processing completed (emails sent, SSE notifications queued, document generation queued)');
        } else {
            console.log('ℹ️ [POST-APPROVAL] Skipped post-approval processing:', {
                reason: !isFinalApproval ? 'Not final approval' : 'Organization not created yet',
                isFinalApproval,
                organization_created: spResult?.organization_created
            });
        }
        // =====================================================================
        
        // Return the stored procedure response (not hardcoded message)
        res.status(200).json({
            success: true,
            ...spResult,  // Include ALL fields from stored procedure
            signature_path: signatureFilename  // Add signature path
        });
        
    } catch (error) {
        console.error('❌ [APPROVE] Error approving approval step:', error);
        // Only send error response if we haven't already sent a response
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Failed to approve approval step',
                message: error.message
            });
        } else {
            console.error('❌ [APPROVE] Cannot send error response - headers already sent');
        }
    } finally {
        connection.release();
    }
};

/**
 * Submit faculty selection for extra-curricular organization
 * @route POST /api/approvals/faculty-selection
 */
exports.submitFacultySelection = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { application_id, period_id, faculty_ids } = req.body;  // ← CHANGED: application_id + period_id
        const userId = req.user.user_id;
        
        // Validate request
        if (!application_id || !period_id || !faculty_ids || !Array.isArray(faculty_ids)) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: application_id, period_id, and faculty_ids array'
            });
        }
        
        // Validate exactly 2 faculty members
        if (faculty_ids.length !== 2) {
            return res.status(400).json({
                success: false,
                error: 'Exactly 2 faculty members must be selected'
            });
        }
        
        // Validate faculty members are different
        if (faculty_ids[0] === faculty_ids[1]) {
            return res.status(400).json({
                success: false,
                error: 'Both faculty members must be different'
            });
        }
        
        // Verify application exists and is extra-curricular
        const [applicationCheck] = await connection.query(
            `SELECT a.application_id, a.category, a.status, a.student_id
             FROM tbl_application a
             WHERE a.application_id = ?`,
            [application_id]
        );
        
        if (applicationCheck.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Application not found'
            });
        }
        
        const appData = applicationCheck[0];
        
        // Verify organization is extra-curricular
        if (appData.category !== 'Extra Curricular Organization') {
            return res.status(400).json({
                success: false,
                error: 'Faculty selection is only for extra-curricular organizations'
            });
        }
        
        // Verify user is the applicant (student)
        if (appData.student_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized: Only the applicant can select faculty advisors'
            });
        }
        
        // Check if approval chain already exists
        const [existingChain] = await connection.query(
            `SELECT chain_id FROM tbl_organization_approval_chain 
             WHERE application_id = ? LIMIT 1`,
            [application_id]
        );
        
        if (existingChain.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Approval chain already exists for this application'
            });
        }
        
        // Create approval chain with selected faculty using updated stored procedure
        await connection.query(
            'CALL sp_SubmitFacultySelection(?, ?, ?, ?)',
            [application_id, period_id, faculty_ids[0], faculty_ids[1]]
        );
        
        // Fetch created approval chain
        const [approvalChain] = await connection.query(
            'CALL sp_GetApprovalChain(?)',
            [application_id]
        );
        
        // Publish real-time update
        try {
            publishToChannel(`approval_chain_${application_id}`, {
                type: 'approval_chain_created',
                application_id: application_id,
                period_id: period_id,
                faculty_ids: faculty_ids,
                data: approvalChain[0]
            });
        } catch (sseError) {
            console.error('⚠️ Failed to publish real-time update:', sseError);
        }
        
        res.status(201).json({
            success: true,
            message: 'Faculty selection submitted successfully',
            application_id: application_id,
            approval_chain: approvalChain[0]
        });
        
    } catch (error) {
        console.error('❌ Error submitting faculty selection:', error);
        res.status(500).json({
            error: 'Failed to submit faculty selection',
            message: error.message
        });
    } finally {
        connection.release();
    }
};

/**
 * Get faculty members by program (for extra-curricular selection)
 * @route GET /api/faculty/by-program/:programId
 */
exports.getFacultyByProgram = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { programId } = req.params;
        
        // Call stored procedure to get faculty
        const [result] = await connection.query(
            'CALL sp_GetFacultyByProgram(?)',
            [programId]
        );
        
        const faculty = result[0];
        
        res.status(200).json({
            success: true,
            program_id: parseInt(programId),
            count: faculty.length,
            data: faculty.map(f => ({
                user_id: f.user_id,
                email: f.email,
                first_name: f.first_name,
                last_name: f.last_name,
                full_name: f.full_name,
                program_id: f.program_id,
                program_name: f.program_name,
                program_abbrev: f.program_abbrev,
                college_id: f.college_id,
                college_name: f.college_name,
                role_name: f.role_name
            }))
        });
        
    } catch (error) {
        console.error('❌ Error fetching faculty by program:', error);
        res.status(500).json({
            error: 'Failed to fetch faculty',
            message: error.message
        });
    } finally {
        connection.release();
    }
};

/**
 * Check if user has uploaded e-signature
 * @route GET /api/approvals/check-esignature
 */
exports.checkUserESignature = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const userEmail = req.user?.email;
        
        if (!userEmail) {
            return res.status(401).json({ 
                success: false, 
                error: 'User not authenticated.' 
            });
        }
        
        console.log('🔍 [CHECK-ESIG] Checking e-signature for:', userEmail);
        
        // Get user_id from email first
        const [userResult] = await connection.query(
            'SELECT user_id FROM tbl_user WHERE email = ? LIMIT 1',
            [userEmail]
        );
        
        if (userResult.length === 0) {
            return res.status(401).json({ 
                success: false, 
                error: 'User not found.' 
            });
        }
        
        const userId = userResult[0].user_id;
        
        // Check if user has uploaded e-signature
        const [result] = await connection.query(
            'SELECT signature_path FROM tbl_user_esignature WHERE user_id = ?',
            [userId]
        );
        
        const hasSignature = result.length > 0 && result[0].signature_path !== null;
        
        console.log('🔍 [CHECK-ESIG] Result:', { userEmail, userId, hasSignature });
        
        res.status(200).json({ 
            success: true, 
            hasSignature,
            message: hasSignature 
                ? 'User has uploaded e-signature' 
                : 'User needs to upload e-signature first'
        });
        
    } catch (error) {
        console.error('❌ [CHECK-ESIG] Error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'An error occurred while checking e-signature.' 
        });
    } finally {
        connection.release();
    }
};

/**
 * Reject approval step - sends application back for resubmission
 * @route POST /api/approvals/chain/:chainId/reject
 * @body { reason: string (REQUIRED - minimum 10 characters) }
 */
exports.rejectApprovalStep = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { chainId } = req.params;
        const { reason } = req.body;
        const userEmail = req.user?.email;
        const userId = req.user?.user_id;

        console.log('❌ [REJECT] Starting rejection:', {
            chainId,
            userEmail,
            userId,
            reasonLength: reason?.length
        });

        // Validate reason
        if (!reason || reason.trim().length < 10) {
            return res.status(400).json({
                success: false,
                error: 'Rejection reason is required and must be at least 10 characters'
            });
        }

        // Get approval chain details to verify approver and get application_id
        const [chainRows] = await connection.query(
            `SELECT ac.*, u.email as approver_email, ac.application_id
             FROM tbl_organization_approval_chain ac
             JOIN tbl_user u ON ac.approver_user_id = u.user_id
             WHERE ac.chain_id = ?`,
            [chainId]
        );

        if (chainRows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Approval chain step not found'
            });
        }

        const chainStep = chainRows[0];

        // Verify user is the assigned approver
        if (chainStep.approver_email !== userEmail) {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to reject this approval step'
            });
        }

        // Call the rejectApplication stored procedure
        const orgModel = require('../models/organizationsModel');
        const result = await orgModel.rejectApplication(
            parseInt(chainId),
            reason.trim(),
            parseInt(chainStep.application_id)
        );

        console.log('✅ [REJECT] Application rejected successfully:', {
            chainId,
            applicationId: chainStep.application_id,
            rejectedBy: userEmail
        });

        // Broadcast real-time update
        try {
            publishOrgHub('approval-rejected', {
                applicationId: chainStep.application_id,
                chainId: parseInt(chainId),
                rejectedBy: userEmail,
                reason: reason.trim(),
                timestamp: new Date().toISOString()
            });
            console.log('📡 [REJECT] Broadcasted rejection event');
        } catch (broadcastError) {
            console.error('⚠️ [REJECT] Broadcast failed:', broadcastError);
        }

        res.status(200).json({
            success: true,
            message: 'Application rejected successfully. The applicant will be notified and can resubmit.',
            data: {
                chain_id: parseInt(chainId),
                application_id: parseInt(chainStep.application_id),
                rejected_by: userEmail,
                reason: reason.trim(),
                rejected_at: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ [REJECT] Error rejecting approval:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reject approval',
            message: error.message
        });
    } finally {
        connection.release();
    }
};
