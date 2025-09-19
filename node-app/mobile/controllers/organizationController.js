const fs = require('fs');
const path = require('path');
const { publishToChannel } = require('../../web/controllers/sseController');
const organizationModel = require('../models/organizationModel'); 
const userModel = require('../models/userModel');


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
                
                // Create directory if it doesn't exist
                const uploadDir = `/app/organizations/${org_id}/${organization_version_id}/transactions`;
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }
                
                // Generate unique filename for both database and file storage
                const timestamp = Date.now();
                const randomString = Math.random().toString(36).substring(2, 8);
                const fileExtension = path.extname(uploadedFile.name);
                uploadedFileName = `payment-proof-${timestamp}-${randomString}${fileExtension}`;
                
                const uploadPath = path.join(uploadDir, uploadedFileName);
                
                // Move the uploaded file
                await uploadedFile.mv(uploadPath);
                console.log('File uploaded to:', uploadPath);
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
        
        publishToChannel(`pending_organization_members_${org_id}_${organization_version_id}`, {
            operation: 'CREATE',
            data: membershipResult,
        });

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
        
        const user = await userModel.getUser(req.user.email);
        const { organization_id, organization_version_id, leave_reason } = req.query;
        const result = await organizationModel.leaveOrganization(organization_id, organization_version_id, user.user_id, leave_reason);
        publishToChannel(`leave_organization_${organization_id}_${organization_version_id}`,
            {
                operation: 'CREATE',
                data: result,
            }
        );
        res.status(200).json({ message: "Leave application submitted successfully"});
    } catch (error) {
        console.error('Error leaving organization:', error);
        res.status(500).json({ message: error.message });
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
