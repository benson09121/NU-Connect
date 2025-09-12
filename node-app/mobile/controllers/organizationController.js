const organizationModel = require('../models/organizationModel'); 



async function getOrganizations(req, res) {
    try {
        const organizations = await organizationModel.getOrganizations();
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
    // req.body may be { data: '[...]' } or an array
    let bodyArr = req.body;
    console.log('Raw req.body:', req.body);

    // If bodyArr has a 'data' property, parse it
    if (bodyArr && typeof bodyArr.data === 'string') {
        try {
            bodyArr = JSON.parse(bodyArr.data);
            console.log('Parsed bodyArr from data:', bodyArr);
        } catch (e) {
            console.error('JSON parse error:', e);
            return res.status(400).json({ message: 'Invalid JSON format in data' });
        }
    } else if (typeof bodyArr === 'string') {
        try {
            bodyArr = JSON.parse(bodyArr);
            console.log('Parsed bodyArr:', bodyArr);
        } catch (e) {
            console.error('JSON parse error:', e);
            return res.status(400).json({ message: 'Invalid JSON format' });
        }
    } else {
        console.log('bodyArr is already an object/array:', bodyArr);
    }

    const paymentObj = bodyArr.find(obj => obj.paymentData);
    console.log('paymentObj:', paymentObj);
    let paymentData = null;
    let json = null;
    let paymentDataString = null;
    if (paymentObj && paymentObj.paymentData !== 'free') {
        paymentData = paymentObj.paymentData;
        let membership_fee = null, payment_type = null, payment_proof = null;
        membership_fee = paymentData.membership_fee;
        payment_type = paymentData.payment_type;
        payment_proof = paymentData.payment_proof;
        json = {
            membership_fee: membership_fee,
            payment_type: payment_type,
            payment_proof: payment_proof
        };
        paymentDataString = JSON.stringify(json);
    }
    
    
    console.log('paymentData:', paymentData);

    const orgObj = bodyArr.find(obj => obj.organization_id);
    console.log('orgObj:', orgObj);
    const reasonObj = bodyArr.find(obj => obj.application_reason);
    console.log('reasonObj:', reasonObj);

    const org_id = orgObj ? orgObj.organization_id : null;
    const answers = reasonObj ? reasonObj.application_reason : [];
    
    const question_id = answers.map(answer => answer.question_id);
    const answer = answers.map(answer => answer.answer);
    console.log('org_id:', org_id);
    console.log('question_id:', question_id[0]);

    try {
        if (typeof organizationModel.submitOrganizationApplication !== 'function') {
            console.error('organizationModel.submitOrganizationApplication is not a function');
            return res.status(500).json({ message: 'Server error: submitOrganizationApplication is not implemented in organizationModel.' });
        }
        const result = await organizationModel.submitOrganizationApplication(org_id, question_id[0], answer[0],paymentDataString);
        console.log('Submission result:', result);
        res.status(200).json({"message": "Application submitted successfully"});
    } catch (error) {
        console.error('Submission error:', error);
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
    getOrganizationLogo
};
