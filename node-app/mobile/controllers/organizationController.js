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
    let bodyArr = req.body.data;
    console.log(bodyArr);
    console.log(req.file);
    const user = await userModel.getUser(req.user.email);
    
    // Parse data if needed
    if (bodyArr && typeof bodyArr.data === 'string') {
        bodyArr = JSON.parse(bodyArr.data);
    } else if (typeof bodyArr === 'string') {
        bodyArr = JSON.parse(bodyArr);
    }

    const paymentObj = bodyArr.find(obj => obj.paymentData);
    const orgObj = bodyArr.find(obj => obj.organization_id);
    const reasonObj = bodyArr.find(obj => obj.application_reason);

    const org_id = orgObj?.organization_id;
    const organization_version_id = orgObj?.organization_version_id; // Extract organization_version_id
    const answers = reasonObj?.application_reason || [];
    
    if (!org_id || answers.length === 0) {
        return res.status(400).json({ message: 'Missing required data' });
    }

    // Log the organization_version_id for reference
    console.log('Organization Version ID:', organization_version_id);

    try {
        // Apply for membership first
        const membershipResult = await organizationModel.submitOrganizationApplication(
            org_id, 
            user.user_id, 
            answers[0].question_id, 
            answers[0].answer
        );
        console.log('Membership application result:', membershipResult);
        publishToChannel(`pending_organization_members_${org_id}_${organization_version_id}`,{
            operation: 'CREATE',
            data: membershipResult,
        });

        let transactionResult = null;
        
        // Handle payment if provided and not free
        if (paymentObj && paymentObj.paymentData !== 'free') {
            const paymentData = JSON.stringify(paymentObj.paymentData);
            transactionResult = await organizationModel.createMembershipTransaction(
                org_id, 
                user.user_id, 
                paymentData
            );
        }

        console.log('Membership result:', membershipResult);
        console.log('Transaction result:', transactionResult);
        
        res.status(200).json({
            message: "Application submitted successfully",
            membership: membershipResult,
            transaction: transactionResult,
            organization_version_id: organization_version_id // Include in response for reference
        });
    } catch (error) {
        console.error('Submission error:', error);
        res.status(500).json({ message: error.message });
    }
}

async function leaveOrganization(req, res) {
    try {
        
        const user = await userModel.getUser(req.user.email);
        const { organization_id } = req.query;
        const result = await organizationModel.leaveOrganization(organization_id, user.user_id);
        publishToChannel(`user_organizations_${user.user_id}`, {
            operation: 'DELETE',
            data: result,
        });
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

module.exports = {
    getOrganizations,
    getUserOrganization,
    getOrganizationQuestion,
    getOrganizationFee,
    submitOrganizationApplication,
    getOrganizationLogo,
    leaveOrganization
};
