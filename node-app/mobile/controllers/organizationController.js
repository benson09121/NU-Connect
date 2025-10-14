const fs = require('fs');
const path = require('path');
const { publishToChannel, publishOrgHub } = require('../../web/controllers/sseController');
const organizationModel = require('../models/organizationModel'); 
const userModel = require('../models/userModel');
const webOrganizationsModel = require('../../web/models/organizationsModel'); // Import web model for getPendingOrganizationMembers
const fileProcessor = require('../../utils/fileProcessor'); // File processing utility


async function getOrganizations(req, res) {
    try {
        const user = await userModel.getUser(req.user.email);
        const organizations = await organizationModel.getOrganizations(user.user_id);
        res.json(organizations);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function getUserOrganization(req, res) {
    try {
        const userOrganization = await organizationModel.getUserOrganization();
        res.json(userOrganization);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function getOrganizationQuestion(req,res){
    const { org_id } = req.query;
    try {
        const organizationQuestions = await organizationModel.getOrganizationQuestion(org_id);
        res.json(organizationQuestions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function getOrganizationFee(req, res) {
    const {org_id} = req.query;
    try {
        const organizationFee = await organizationModel.getOrganizationFee(org_id);
        res.json(organizationFee);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function submitOrganizationApplication(req, res) {
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);
    
    const user = await userModel.getUser(req.user.email);
    
    let bodyData;
    
    // Handle different data structures based on whether files are uploaded
    if (req.body.data && typeof req.body.data === 'string') {
        // When files are uploaded, data comes as a string
        bodyData = JSON.parse(req.body.data);
    } else if (req.body.data && Array.isArray(req.body.data)) {
        // When no files, data comes as array
        bodyData = req.body.data;
    } else {
        // Direct object structure
        bodyData = req.body;
    }

    console.log('Parsed bodyData:', bodyData);

    // Extract data based on structure
    let org_id, organization_version_id, answers, paymentData;

    if (Array.isArray(bodyData)) {
        // Array structure (original format)
        const paymentObj = bodyData.find(obj => obj.paymentData);
        const orgObj = bodyData.find(obj => obj.organization_id);
        const reasonObj = bodyData.find(obj => obj.application_reason);

        org_id = orgObj?.organization_id;
        organization_version_id = orgObj?.organization_version_id;
        answers = reasonObj?.application_reason || [];
        paymentData = paymentObj?.paymentData;
    } else {
        // Direct object structure (when files are uploaded)
        org_id = bodyData.organization_id;
        organization_version_id = bodyData.organization_version_id;
        answers = bodyData.application_reason || [];
        paymentData = bodyData.paymentData;
    }

    if (!org_id || answers.length === 0) {
        return res.status(400).json({ message: 'Missing required data' });
    }

    console.log('Organization ID:', org_id);
    console.log('Organization Version ID:', organization_version_id);
    console.log('Answers:', answers);
    console.log('Payment Data:', paymentData);

    try {
        let transactionResult = null;
        const payer = user.f_name + ' ' + user.l_name;

        // Handle payment if provided and not free
        if (paymentData && paymentData !== 'free' && typeof paymentData === 'object') {
            
            // Handle file upload if there's a payment proof
            let uploadedFileName = null;
            if (req.files && req.files.file && paymentData.payment_proof) {
                const uploadedFile = req.files.file;
                
                console.log('[DEBUG] Payment proof file validation:', {
                    fileName: uploadedFile.name,
                    mimetype: uploadedFile.mimetype,
                    size: uploadedFile.size
                });
                
                // Validate file type
                const allowedTypes = [
                    'image/jpeg', 
                    'image/jpg',
                    'image/pjpeg',
                    'image/png', 
                    'application/pdf'
                ];
                const maxSize = 10 * 1024 * 1024; // 10MB (before processing)
                
                const fileExt = uploadedFile.name.toLowerCase().split('.').pop();
                const allowedExtensions = ['jpg', 'jpeg', 'png', 'pdf'];
                
                const mimeTypeValid = allowedTypes.includes(uploadedFile.mimetype);
                const extensionValid = allowedExtensions.includes(fileExt);
                
                if (!mimeTypeValid && !extensionValid) {
                    console.log(`[DEBUG] Payment proof file rejected - invalid type. MIME: ${uploadedFile.mimetype}, Extension: ${fileExt}`);
                    return res.status(400).json({ 
                        message: `Invalid payment proof file type. Only JPEG, PNG, and PDF files are allowed. Received MIME type: ${uploadedFile.mimetype}, Extension: ${fileExt}` 
                    });
                }
                
                if (uploadedFile.size > maxSize) {
                    console.log(`[DEBUG] Payment proof file rejected - size too large: ${uploadedFile.size} bytes`);
                    return res.status(400).json({ 
                        message: 'Payment proof file size must be less than 10MB' 
                    });
                }
                
                // Create directory if it doesn't exist
                const uploadDir = `/app/organizations/${org_id}/${organization_version_id}/transactions`;
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }
                
                // 🎯 PROCESS FILE: Resize and compress images
                let processedFile;
                try {
                    console.log('📦 [FileProcessor] Processing payment proof...');
                    processedFile = await fileProcessor.processUploadedFile(uploadedFile, 'receipt');
                    console.log('✅ [FileProcessor] Processing complete:', processedFile.stats);
                } catch (procError) {
                    console.warn('⚠️ [FileProcessor] Processing failed, using original:', procError.message);
                    // Fallback to original file (backward compatibility)
                    processedFile = {
                        buffer: uploadedFile.data,
                        filename: uploadedFile.name,
                        stats: { processed: false, error: procError.message }
                    };
                }
                
                // Generate unique filename
                const timestamp = Date.now();
                const randomString = Math.random().toString(36).substring(2, 8);
                const fileExtension = path.extname(processedFile.filename);
                uploadedFileName = `payment-proof-${timestamp}-${randomString}${fileExtension}`;
                
                const uploadPath = path.join(uploadDir, uploadedFileName);
                
                // Write processed file
                fs.writeFileSync(uploadPath, processedFile.buffer);
                console.log('💾 Payment proof saved:', uploadPath);
                if (processedFile.stats.processed) {
                    console.log(`💰 Storage saved: ${processedFile.stats.savings} (${((processedFile.stats.originalSize - processedFile.stats.processedSize) / 1024).toFixed(2)} KB)`);
                }
            }

            // Create membership transaction
            transactionResult = await organizationModel.createMembershipTransaction(
                user.email,
                payer,
                paymentData.membership_fee,
                paymentData.payment_type,
                uploadedFileName,  // Use the same unique filename for database
                org_id,
                organization_version_id
            );
            
            publishToChannel('transactions', { type: 'created', data: transactionResult });
            if (transactionResult && transactionResult.transaction_id) {
                publishToChannel(`transactions:${transactionResult.transaction_id}`, { type: 'created', data: transactionResult });
            }
        }

        // Apply for membership - create one application with all answers
        const membershipResult = await organizationModel.submitOrganizationApplication(
            org_id, 
            organization_version_id,
            user.user_id, 
            answers  // Pass all answers at once
        );
        
        console.log('Membership application result:', membershipResult);
        
        // 🔧 FIX: Changed channel name to match web real-time subscriptions
        // Was: pending_organization_members_${org_id}_${organization_version_id}
        // Now: organization_pendingMembers_${org_id}_${organization_version_id}
        
        // Fetch updated pending members list for real-time broadcast
        try {
            const updatedPendingMembers = await webOrganizationsModel.getPendingOrganizationMembers(org_id, organization_version_id);
            const pendingMembersArray = Array.isArray(updatedPendingMembers) ? updatedPendingMembers : [];
            publishOrgHub({
                orgId: org_id,
                orgVersionId: organization_version_id,
                entity: 'organization_pendingMembers',
                operation: 'UPDATE',
                data: pendingMembersArray
            });
            console.log(`📱 [MOBILE] 📡 Published pending members to hub - ${pendingMembersArray.length} items`);
        } catch (publishError) {
            console.error('❌ [MOBILE] Failed to publish pending members:', publishError);
        }

        console.log('Final membership result:', membershipResult);
        console.log('Transaction result:', transactionResult);
        
        res.status(200).json({
            message: "Application submitted successfully",
            membership: membershipResult,
            transaction: transactionResult,
            organization_version_id: organization_version_id
        });
    } catch (error) {
        console.error('Submission error:', error);
        res.status(500).json({ message: error.message });
    }
}

async function leaveOrganization(req, res) {
    try {
        console.log('📱 [MOBILE] Leave organization request received');
        console.log('Request body:', req.body);
        
        const user = await userModel.getUser(req.user.email);
        const { organization_id, organization_version_id, leave_reason } = req.body;
        
        // Validate required fields
        if (!organization_id || !organization_version_id || !leave_reason) {
            console.log('❌ Missing required fields');
            return res.status(400).json({ 
                success: false,
                message: 'Missing required fields: organization_id, organization_version_id, and leave_reason are required' 
            });
        }
        
        // Validate leave_reason length
        if (leave_reason.trim().length < 10) {
            console.log('❌ Leave reason too short');
            return res.status(400).json({ 
                success: false,
                message: 'Leave reason must be at least 10 characters long' 
            });
        }
        
        console.log(`Processing leave request for user ${user.user_id} from org ${organization_id}`);
        const result = await organizationModel.leaveOrganization(organization_id, organization_version_id, user.user_id, leave_reason);
        
        console.log('Leave application created:', result);
        publishToChannel(`organization_leaveApplications_${organization_id}_${organization_version_id}`, {
            operation: 'CREATE',
            data: Array.isArray(result) ? result : [result],
            timestamp: new Date()
        });
        console.log(`📱 [MOBILE] 📡 Leave Application Published to channel - 1 item`);
        
        res.status(200).json({ 
            success: true,
            message: "Leave application submitted successfully"
        });
    } catch (error) {
        console.error('❌ Error leaving organization:', error);
        res.status(500).json({ 
            success: false,
            message: error.message 
        });
    }
}

async function getOrganizationLogo(req, res) {
    let organization_id = req.query.organization_id;
    let organization_version_id = req.query.organization_version_id;
    let logo = req.query.logo_name;
    try {
        // Set Content-Disposition so browser handles as image (inline) 
        res.setHeader('Content-Disposition', `inline; filename="${logo}"`);
        // X-Accel-Redirect for Nginx internal serving
        res.setHeader('X-Accel-Redirect', `/protected-organization-requirements/${organization_id}/${organization_version_id}/logo/${logo}`);
        res.end();
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the logo.",
        });
    }
}

async function getUserTransactions(req, res) {
    try {
        const user = await userModel.getUser(req.user.email);
        const transactions = await organizationModel.getUserTransactions(user.user_id);
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function checkLeaveStatus(req, res) {
    try {
        const {organization_id, organization_version_id} = req.query;
        const user = await userModel.getUser(req.user.email);
        const leaveStatus = await organizationModel.checkLeaveStatus(organization_id, organization_version_id,user.user_id);
        res.json(leaveStatus);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports = {
    getOrganizations,
    getUserOrganization,
    getOrganizationQuestion,
    getOrganizationFee,
    submitOrganizationApplication,
    getOrganizationLogo,
    leaveOrganization,
    getUserTransactions,
    checkLeaveStatus
};
