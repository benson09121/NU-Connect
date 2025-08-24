const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { subscribeToChannel, publishToChannel } = require('./sseController');
const organizationsModel = require('../models/organizationsModel');
const userCacheModel = require('../models/userCacheModel');

async function getOrganizations(req, res) {
    const { sessionId, user_role, org_name } = req.query;
    const program_id = req.query.program_id || null;

  try {
      if(sessionId) {
            if(user_role === 'SDAO'){
               const organizations = await organizationsModel.getOrganizationByRole(user_role);
               subscribeToChannel(sessionId, `organizations_${user_role}`);
               res.json(organizations);
               console.log(organizations);
            } else if (user_role ==='Program Chair'){
                const organizations = await organizationsModel.getOrganizationByProgram(program_id);
                subscribeToChannel(sessionId, `organizations_${user_role}_${program_id}`);
                res.json(organizations);
            } else if (user_role === 'Adviser'){
               const organizations = await organizationsModel.getOrganizationByName(org_name);
                subscribeToChannel(sessionId, `organizations_${user_role}_${org_name}`);
                res.json(organizations);
            } else if (user_role === 'Student'){
                const organizations = await organizationsModel.getOrganizationByName(org_name);
                subscribeToChannel(sessionId, `organizations_${user_role}_${org_name}`);
                res.json(organizations);
            }
        // const getOrganizations = await organizationsModel.getOrganizations(req.user.user_id);
        //  res.json(getOrganizations);
      }
     } catch (error) {
         res.status(500).json({
             error: error.message || "An error occurred while fetching the active application period.",
         });
     }
}

async function getOrganizationDetails(req, res) {
    try {
        const { org_name } = req.query;
        const organizationDetails = await organizationsModel.getOrganizationDetails(org_name);
        if (organizationDetails.length === 0) {
            return res.status(404).json({ message: 'Organization not found' });
        }
        res.json(organizationDetails);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the organization details.",
        });
    }
}

async function getOrganizationOfficers(req,res){
    try{
        const { org_name, sessionId } = req.query;
        const officers = await organizationsModel.getOrganizationOfficers(org_name);
        if( sessionId ) {
            subscribeToChannel(sessionId, `organization_officers_${org_name}`);
        }
        res.status(200).json(officers);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the organization officers.",
        });

    }
}

async function getOrganizationMembers(req, res) {
    try{
        const { org_name, sessionId } = req.query;
        const members = await organizationsModel.getOrganizationMembers(org_name);
        if( sessionId ) {
            subscribeToChannel(sessionId, `organizations_members_${org_name}`);
        }
        res.status(200).json(members);
    }
    catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the organization members.",
        });
    }
}


async function createOrganizationApplication(req, res) {
    try {
        const organization = JSON.parse(req.body.organization);
        const executives = JSON.parse(req.body.executives);
        const requirements = JSON.parse(req.body.requirements);

        const logoFile = req.files?.logo;
        const requirementFiles = {};

        requirements.forEach(reqItem => {
            const fileKey = `requirement_${reqItem.requirement_id}`;
            if (req.files[fileKey]) {
                requirementFiles[reqItem.requirement_id] = req.files[fileKey];
            }
        });

        if (!logoFile) {
            throw new Error('Organization logo is required');
        }

        // Generate filenames for requirements and use them for both DB and file upload
        const requirementFilePaths = requirements.map(req => {
            const file = requirementFiles[req.requirement_id];
            if (file) {
                const filename = `requirement-${Date.now()}-${req.requirement_path}`;
                return {
                    requirement_id: req.requirement_id,
                    requirement_path: filename
                };
            } else {
                return {
                    requirement_id: req.requirement_id,
                    requirement_path: req.requirement_path
                };
            }
        });

        const dbResult = await organizationsModel.createOrganizationApplication(
            { ...organization, organization_logo: logoFile.name },
            executives,
            requirementFilePaths,
            req.user.user_id
        );

        // New folder structure: /apps/applications/{app_id}/
        console.log('dbResult[0]:', dbResult[0]);
        const appId = dbResult[0].application_id;
        console.log(`Creating directories for application ID: ${appId}`);
        const appDir = path.join('/app/applications', String(appId));
        const logoDir = path.join(appDir, 'logo');
        const requirementsDir = path.join(appDir, 'requirements');

        // Only create each directory once
        if (!fs.existsSync(appDir)) {
            fs.mkdirSync(appDir, { recursive: true });
        }
        if (!fs.existsSync(logoDir)) {
            fs.mkdirSync(logoDir, { recursive: true });
        }
        if (!fs.existsSync(requirementsDir)) {
            fs.mkdirSync(requirementsDir, { recursive: true });
        }
        console.log(dbResult[0].logo_path);
        const logoFilename = path.basename(dbResult[0].logo_path);

        // File write logic with error handling
        try {
            fs.writeFileSync(
                path.join(logoDir, logoFilename),
                logoFile.data
            );
        } catch (fileErr) {
            console.error('Failed to write logo file:', fileErr);
            return res.status(500).json({ error: 'Failed to save organization logo.' });
        }

        for (const req of requirements) {
            const file = requirementFiles[req.requirement_id];
            if (file) {
                const filename = requirementFilePaths.find(r => r.requirement_id === req.requirement_id)?.requirement_path;
                try {
                    fs.writeFileSync(
                        path.join(requirementsDir, filename),
                        file.data
                    );
                } catch (fileErr) {
                    console.error(`Failed to write requirement file (${filename}):`, fileErr);
                    return res.status(500).json({ error: `Failed to save requirement file: ${filename}` });
                }
            }
        }

        const result = await organizationsModel.getApplication(appId);

        publishToChannel('organization-applications', {
            operation: 'CREATE',
            data: result
        });

        // Initiate approval process with enhanced logging
        try {
            await organizationsModel.initiateApprovalProcess(appId, req.user.email);
        } catch (approvalError) {
            console.error('Failed to initiate approval process:', approvalError);
            // Don't fail the application creation if approval process fails
        }

        res.status(201).json({
            message: 'Organization application submitted successfully',
            data: {
                ...dbResult[0],
                logo_url: `/apps/applications/${appId}/logo/${logoFilename}`
            }
        });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while creating the organization."
        });
    }
}

async function getSpecificApplication(req, res) {
    try {
        const { org_name, app_id } = req.query;

        const application = await organizationsModel.getSpecificApplication(req.user.user_id, org_name, app_id);
        if (application.length === 0) {
            return res.status(404).json({ message: 'No application found' });
        }
        res.json(application);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the application.",
        });
    }
}
async function approveApplication(req, res) {
    try {
        const { approval_id, comments, application_id, organization_id, appName } = req.body;
        const approvalRow = await organizationsModel.approveApplication(
            approval_id,
            comments,
            organization_id,
            application_id
        );
        console.log('Approval Row:', approvalRow);
        const result = approvalRow[0]?.result;
        publishToChannel(`application_approval_timeline_${appName}_${application_id}`, {
            operation: 'UPDATE',
            data: result.application
        });
        if (result.application.step === result?.other.last_step) {
            const update_data = await organizationsModel.getUpdateApplication(application_id);
            publishToChannel('organization-applications', {
                operation: 'UPDATE',
                data: update_data
            });

            // Copy logo file to organization directory
            try {
                const appId = application_id;
                const orgId = result?.organization?.id || organization_id;
                const orgVersionId = result?.other?.org_version_id;
                const logoName = result?.other?.organization_logo || result?.organization?.logo;
                if (appId && orgId && orgVersionId && logoName) {
                    const srcLogoPath = path.join('/app/applications', String(appId), 'logo', logoName);
                    const destLogoDir = path.join('/app/organizations', String(orgId), String(orgVersionId), 'logo');
                    const destLogoPath = path.join(destLogoDir, logoName);
                    if (!fs.existsSync(destLogoDir)) {
                        fs.mkdirSync(destLogoDir, { recursive: true });
                    }
                    fs.copyFileSync(srcLogoPath, destLogoPath);
                    console.log(`Logo copied from ${srcLogoPath} to ${destLogoPath}`);
                } else {
                    console.warn('Missing required info for logo copy:', { appId, orgId, orgVersionId, logoName });
                }
            } catch (copyErr) {
                console.error('Error copying logo file:', copyErr);
            }
        }
        res.json({
            message: 'Application approved successfully',
            approval: approvalRow
        });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while approving the application.",
        });
    }
}

async function rejectApplication(req, res) {
    try {
        const { approval_id, comments, application_id, appName } = req.body;
        const approvalRow = await organizationsModel.rejectApplication(
            approval_id,
            comments,
            application_id
        );
        publishToChannel(`application_approval_timeline_${appName}_${application_id}`, {
            operation: 'UPDATE',
            data: approvalRow
        });
        res.json({
            message: 'Application rejected successfully',
            approval: approvalRow
        });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while rejecting the application.",
        });
    }
}

async function getOrganizationRequirement(req, res) {
    const requirement_name  = req.query.requirement_name;
    const app_id = req.query.app_id;

    try {
        res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
        res.setHeader('X-Accel-Redirect', `/protected-applications/${app_id}/requirements/${requirement_name}`);
        const match = requirement_name.match(/requirement-(\d+)-(.+)/);
        const downloadName = match[0];
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
        res.end();
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the requirements.",
        });
    }
}

async function getOrganizationLogo(req, res) {
    let org_name = req.query.org_name;
    let logo_name = req.query.logo_name;
    const org_name_encoded = encodeURIComponent(org_name);
    const cycle_number = req.query.cycle_number;
    try {
        res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
        // Set Content-Disposition so browser handles as image (inline) 
        res.setHeader('Content-Disposition', `inline; filename="${logo_name}"`);
        // X-Accel-Redirect for Nginx internal serving
        res.setHeader('X-Accel-Redirect', `/protected-organization-requirements/${org_name_encoded}/${cycle_number}/logo/${logo_name}`);
        res.end();
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the logo.",
        });
    }
}

async function getOrganizationLogoApplication(req, res){
    let {app_id, logo_name, org_name } = req.query;
    const org_name_encoded = encodeURIComponent(org_name);
    const logo_name_encoded = encodeURIComponent(logo_name);
    try {
        res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
        // Set Content-Disposition so browser handles as image (inline) 
        res.setHeader('Content-Disposition', `inline; filename="${org_name}_logo"`);
        // X-Accel-Redirect for Nginx internal serving
        res.setHeader('X-Accel-Redirect', `/protected-applications/${app_id}/logo/${logo_name}`);
        res.end();
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the logo.",
        });
    }
}

async function getOrganizationApplications(req, res) {
    const { sessionId } = req.query;
    try {
        const applications = await organizationsModel.getOrganizationApplications();
        if( sessionId ) {
        subscribeToChannel(sessionId, 'organization-applications');
        }
        res.json(applications);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the organization applications.",
        });
    }
}

async function checkOrganizationName(req, res) {
    try {
        const { org_name } = req.query;
        const exists = await organizationsModel.checkOrganizationName(org_name);
        res.json({ exists });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while checking the organization name.",
        });
    }
}

async function checkOrganizationEmails(req, res) {
    try {
        const { emails } = req.body;
        // Fix: flatten if double-wrapped (array in array)
        let emailList = emails;
        if (Array.isArray(emails) && emails.length === 1 && Array.isArray(emails[0])) {
            emailList = emails[0];
        }
        // Ensure emailList is a real array of strings
        if (!Array.isArray(emailList)) {
            return res.status(400).json({ message: 'Emails must be an array' });
        }
        // Pass as a JSON string (not a stringified array string)
        const jsonEmails = JSON.stringify(emailList);
        // Remove any extra escaping (should not be present if JSON.stringify is used on an array)
        const exists = await organizationsModel.checkOrganizationEmails(jsonEmails);
        res.json({ exists });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while checking the organization emails.",
        });
    }   
}

async function archiveOrganization(req, res) {
    try {
        const { organization_id } = req.body;
        if (!organization_id) {
            return res.status(400).json({ message: 'Organization ID is required.' });
        }
        // Lookup user_id by email (optimized)
        const user = await organizationsModel.getUserByEmail(req.user.email);
        if (!user || !user.user_id) {
            return res.status(404).json({ message: 'User not found.' });
        }
        await organizationsModel.archiveOrganization(organization_id, user.user_id);
        res.status(200).json({ message: 'Organization archived successfully.' });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while archiving the organization.",
        });
    }
}

async function unarchiveOrganization(req, res) {
    try {
        const { organization_id } = req.body;
        if (!organization_id) {
            return res.status(400).json({ message: 'Organization ID is required.' });
        }
        // Lookup user_id by email (optimized)
        const user = await organizationsModel.getUserByEmail(req.user.email);
        if (!user || !user.user_id) {   
            return res.status(404).json({ message: 'User not found.' });
        }
        await organizationsModel.unarchiveOrganization(organization_id, user.user_id);
        res.status(200).json({ message: 'Organization unarchived successfully.' });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while unarchiving the organization.",
        });
    }
}

async function getOrganizationsByStatus(req, res) {
    try {
        const { status } = req.query;
        if (!status) {
            return res.status(400).json({ error: "Status is required." });
        }
        const organizations = await organizationsModel.getOrganizationsByStatus(status);
        res.json(organizations);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching organizations by status.",
        });
    }
}

async function getOrganizationEventApplications(req, res) {
    try {
        const org_name = req.query.org_name;
        if (!org_name) {
            return res.status(400).json({ message: 'org_name is required.' });
        }
        const result = await organizationsModel.getOrganizationEventApplications(org_name);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching organization event applications.",
        });
    }
}

async function getEventRequirementSubmissionsByOrganization(req, res) {
    try {
        let organization_id = parseInt(req.query.organization_id);
        const org_name = req.query.org_name;

        // If org_name is provided, look up organization_id using the model function
        if (!organization_id && org_name) {
            organization_id = await organizationsModel.getOrganizationIdByName(org_name);
            if (!organization_id) {
                return res.status(404).json({ message: 'Organization not found.' });
            }
        }

        if (!organization_id) {
            return res.status(400).json({ message: 'organization_id or org_name is required.' });
        }

        const submissions = await organizationsModel.getEventRequirementSubmissionsByOrganization(organization_id);
        res.json(submissions);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching event requirement submissions by organization.",
        });
    }
}

async function getOrganizationDashboardStats(req, res) {
    try {
        let organization_id = parseInt(req.query.organization_id);
        const org_name = req.query.org_name;

        // If org_name is provided, look up organization_id using the model function
        if (!organization_id && org_name) {
            organization_id = await organizationsModel.getOrganizationIdByName(org_name);
            if (!organization_id) {
                return res.status(404).json({ message: 'Organization not found.' });
            }
        }

        if (!organization_id) {
            return res.status(400).json({ message: 'organization_id or org_name is required.' });
        }

        const stats = await organizationsModel.getOrganizationDashboardStats(organization_id);
        res.json(stats);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching organization dashboard stats.",
        });
    }
}

async function createExecutiveMember(req, res) {
    try {
        // Log the incoming request body and user
        console.log('Add Executive Member Request:', {
            body: req.body,
            user: req.user
        });

        const {
            organization_id,
            email,
            program_name,
            role_title,
            rank_level,
            org_name
        } = req.body;

        const action_by_email = req.user.email;

        const result = await organizationsModel.createExecutiveMember({
            organization_id,
            email,
            program_name,
            role_title,
            rank_level,
            action_by_email
        });

        publishToChannel(`organization_officers_${org_name}`, {
            operation: 'CREATE',
            data: result
        });

        res.status(201).json({
            message: result.message
        });
    } catch (error) {
        const sqlMessage = error.sqlMessage || error.message || 'An error occurred while adding executive member.';
        res.status(400).json({ error: sqlMessage });
    }
}

async function updateExecutiveMember(req, res) {
    try {
        console.log('Update Executive Member Request:', {
            body: req.body,
            user: req.user
        });

        const {
            organization_id,
            email,
            program_name,
            role_title,
            rank_level,
            org_name
        } = req.body;

        const action_by_email = req.user.email;

        const result = await organizationsModel.updateExecutiveMember({
            organization_id,
            email,
            program_name,
            role_title,
            rank_level,
            action_by_email
        });

        console.log(result);

        publishToChannel(`organization_officers_${org_name}`, {
            operation: 'UPDATE',
            data: result
        });

        res.status(200).json({
            message: "Update Successful"
        });
    } catch (error) {
        const sqlMessage = error.sqlMessage || error.message || 'An error occurred while updating executive member.';
        res.status(400).json({ error: sqlMessage });
    }
}

async function archiveExecutiveMember(req, res) {
    try {
        console.log('Archive Executive Member Request:', {
            body: req.body,
            user: req.user
        });

        const {
            organization_id,
            email,
            org_name
        } = req.body;

        const action_by_email = req.user.email;

        const result = await organizationsModel.archiveExecutiveMember({
            organization_id,
            email,
            action_by_email
        });

        publishToChannel(`organization_officers_${org_name}`, {
            operation: 'DELETE',
            data: result
        });


        res.status(200).json({
            message: "Archive Successful"
        });
    } catch (error) {
        const sqlMessage = error.sqlMessage || error.message || 'An error occurred while archiving executive member.';
        res.status(400).json({ error: sqlMessage });
    }
}

async function getOrganizationCommittees(req, res) {
    try {
        const { org_name, sessionId } = req.query;
        const committees = await organizationsModel.getOrganizationCommittees(org_name);
        if( sessionId ) {
        subscribeToChannel(sessionId,`organization_committees_${org_name}`);
        }
        res.json(committees);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching organization committees.",
        });
    }
}

async function createCommittee(req, res) {
    try {
        const {
            committee_name,
            description,
            orgName,
        } = req.body;

        const action_by_email = req.user.email;

        const result = await organizationsModel.createCommittee({
            orgName,
            committee_name,
            description,
            action_by_email,
            
        });

        publishToChannel(`organization_committees_${orgName}`, {
            operation: 'CREATE',
            data: result
        });

        res.status(201).json({
            message: 'Committee created successfully.',
        });
    } catch (error) {
        const sqlMessage = error.sqlMessage || error.message || 'An error occurred while creating the committee.';
        res.status(400).json({ error: sqlMessage });
    }
}

async function updateCommittee(req, res) {
    try {

        const {
            committee_id,
            new_name,
            new_description,
            orgName
        } = req.body;
        const action_by_email = req.user.email;

        const result = await organizationsModel.updateCommittee({
            committee_id,
            new_name,
            new_description,
            action_by_email
        });
        publishToChannel(`organization_committees_${orgName}`, {
            operation: 'UPDATE',
            data: result
        });
        console.log('[UpdateCommittee] Result:', result);
        res.status(200).json({
            message: 'Committee updated successfully.'
        });
    } catch (error) {
        console.error('[UpdateCommittee] SQL/Error:', error.sqlMessage || error.message, error);
        const sqlMessage = error.sqlMessage || error.message || 'An error occurred while updating the committee.';
        res.status(400).json({ error: sqlMessage });
    }
}

async function archiveCommittee(req, res) {
    try {
        const {
            committee_id,
            reason,
            orgName
        } = req.body;

        const archived_by_email = req.user.email;

        const result = await organizationsModel.archiveCommittee({
            committee_id,
            reason,
            archived_by_email
        });
        console.log(result);
        publishToChannel(`organization_committees_${orgName}`, {
            operation: 'DELETE',
            data: result
        });

        res.status(200).json({
            message: 'Committee archived successfully.',
            committees_archived: result
        });
    } catch (error) {
        console.error('[ArchiveCommittee] SQL/Error:', error.sqlMessage || error.message, error);
        const sqlMessage = error.sqlMessage || error.message || 'An error occurred while archiving the committee.';
        res.status(400).json({ error: sqlMessage });
    }
}

async function getAllCommitteeMembers(req, res) {
       try {
        const { org_name, sessionId } = req.query;
        const committees = await organizationsModel.getAllCommitteeMembers(org_name);
        if (sessionId) {
            subscribeToChannel(sessionId, `organizations_committeesMembers_${org_name}`);
        }
        res.status(200).json(committees);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the organization committees.",
        });
    }
}

async function addCommitteeMember(req, res) {
    try {
        const {
            committee_id,
            user_email,
            role,
            orgName
        } = req.body;

        const action_by_email = req.user.email;

        const result = await organizationsModel.addCommitteeMember({
            committee_id,
            user_email,
            role,
            action_by_email
        });
        const emailUpdate = await organizationsModel.getSingleOrganizationMember(result[0].member_id, orgName);
        const emailSUggestionOrganizationUpdate = await organizationsModel.GetSingleOrganizationUser(result[0].member_id);
        await userCacheModel.cacheSingleOrganizationUser(orgName,emailSUggestionOrganizationUpdate[0]);
        console.log();
        publishToChannel(`organizations_members_${orgName}`, {
            operation: 'DELETE',
            data: emailUpdate
        });
        publishToChannel(`organizations_committeesMembers_${orgName}`, {
            operation: 'CREATE',
            data: result
        });
        res.status(201).json({
            message: 'Committee member added successfully.',
            data: result
        });
    } catch (error) {
        console.error('[AddCommitteeMember] SQL/Error:', error.sqlMessage || error.message, error);
        const sqlMessage = error.sqlMessage || error.message || 'An error occurred while adding committee member.';
        res.status(400).json({ error: sqlMessage });
    }
}

async function updateCommitteeMember(req, res) {
    try {
        const { committee_member_id, new_role, orgName } = req.body;
        const action_by_email = req.user.email;
        const result = await organizationsModel.updateCommitteeMember({
            committee_member_id,
            new_role,
            action_by_email,
        });
        publishToChannel(`organizations_committeesMembers_${orgName}`, {
            operation: 'UPDATE',
            data: result
        });
        res.status(200).json({
            message: 'Committee member updated successfully.',
            rows_affected: result.rows_affected
        });
    } catch (error) {
        const sqlMessage = error.sqlMessage || error.message || 'An error occurred while updating committee member.';
        res.status(400).json({ error: sqlMessage });
    }
}

async function archiveCommitteeMember(req, res) {
    try {
        const { committee_member_id, reason, orgName } = req.body;
        const action_by_email = req.user.email;
        const result = await organizationsModel.archiveCommitteeMember({
            committee_member_id,
            reason,
            action_by_email
        });
        publishToChannel(`organizations_committeesMembers_${orgName}`, {
            operation: 'DELETE',
            data: result
        });
        res.status(200).json({
            message: 'Committee member archived successfully.',
            rows_archived: result
        });
    } catch (error) {
        const sqlMessage = error.sqlMessage || error.message || 'An error occurred while archiving committee member.';
        res.status(400).json({ error: sqlMessage });
    }
}

async function getPendingOrganizationMembers(req, res) {
    try {
        const {sessionId, org_name } = req.query;
        const members = await organizationsModel.getPendingOrganizationMembers(org_name);
        if( sessionId ) {
         subscribeToChannel(sessionId, `organizations_members_pending_${org_name}`);
        }
        res.json(members);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching pending organization members.",
        });
    }
}
async function approveMembershipApplication(req, res) {
    try {
        const { application_id, remarks, org_name } = req.body;
        const reviewer_email = req.user.email;
        if (!application_id) {
            return res.status(400).json({ error: "application_id is required." });
        }
        await organizationsModel.approveMembershipApplication(application_id, reviewer_email, remarks || null, org_name);
        
        res.json({ message: 'Membership application approved successfully.' });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while approving the membership application.",
        });
    }
}

async function rejectMembershipApplication(req, res) {
    try {
        const { application_id, remarks } = req.body;
        const reviewer_email = req.user.email;
        if (!application_id) {
            return res.status(400).json({ error: "application_id is required." });
        }
        await organizationsModel.rejectMembershipApplication(application_id, reviewer_email, remarks || null);
        res.json({ message: 'Membership application rejected successfully.' });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while rejecting the membership application.",
        });
    }
}

async function addOrganizationMember(req, res) {
    try {
        const {
            orgName,
            email,
            program_name
        } = req.body;
        const action_by_email = req.user.email;

        const result = await organizationsModel.addOrganizationMember({
            orgName,
            email,
            action_by_email,
            program_name
        });
        const emailSuggestionUpdate = await organizationsModel.getSingleUser(result[0].id);
        await userCacheModel.cacheSingleUser(emailSuggestionUpdate[0]);
        const emailSUggestionOrganizationUpdate = await organizationsModel.GetSingleOrganizationUser(result[0].id);
        await userCacheModel.cacheSingleOrganizationUser(orgName,emailSUggestionOrganizationUpdate[0]);
        publishToChannel(`organizations_members_${orgName}`, {
            operation: 'CREATE',
            data: result
        });
        console.log('Add Organization Member Result:', result);
        
        res.status(201).json({ message: 'Organization member added successfully.' });
    } catch (error) {
        res.status(400).json({
            error: error.sqlMessage || error.message || "An error occurred while adding the organization member."
        });
    }
}

async function editOrganizationMember(req, res) {
    try {
        const { current_email, new_email, new_program_name } = req.body;
        if (!current_email || !new_email) {
            return res.status(400).json({ error: "current_email and new_email are required." });
        }
        await organizationsModel.editOrganizationMember({
            current_email,
            new_email,
            new_program_name
        });
        res.status(200).json({ message: 'Organization member updated successfully.' });
    } catch (error) {
        res.status(400).json({
            error: error.sqlMessage || error.message || "An error occurred while editing the organization member."
        });
    }
}

async function archiveOrganizationMember(req, res) {
    try {
        const { member_id } = req.body;
        if (!member_id) {
            return res.status(400).json({ error: "member_id is required." });
        }
        const archived_by_email = req.user.email;
        await organizationsModel.archiveOrganizationMember({ member_id, archived_by_email });
        res.status(200).json({ message: 'Organization member archived successfully.' });
    } catch (error) {
        res.status(400).json({
            error: error.sqlMessage || error.message || "An error occurred while archiving the organization member."
        });
    }
}

async function GetApprovalTimeline(req, res){
    try{
        const { sessionId, org_name, app_id} = req.query;
        const result = await organizationsModel.GetApprovalTimeline(org_name, app_id);
        if (sessionId) {
            subscribeToChannel(sessionId, `application_approval_timeline_${org_name}_${app_id}`);
        }
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the approval timeline.",
        });
    }
}


async function getProgram(req, res) {
    try {

        const program = await organizationsModel.getProgram();
        res.json(program);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the program.",
        });
    }
}

async function getAllExecutiveRanks(req, res) {
    try {
        const ranks = await organizationsModel.getAllExecutiveRanks();
        res.status(200).json(ranks);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching executive ranks.",
        });
    }
}

// Enhanced application period management functions
async function addApplicationPeriod(req, res) {
    try {
        const { start_date, end_date, start_time, end_time } = req.body;
        
        if (!start_date || !end_date || !start_time || !end_time) {
            return res.status(400).json({ 
                error: "All fields (start_date, end_date, start_time, end_time) are required." 
            });
        }

        const result = await organizationsModel.addApplicationPeriod(
            start_date,
            end_date,
            start_time,
            end_time,
            req.user.email
        );

        res.status(201).json({
            success: true,
            message: "Application period created successfully.",
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while creating the application period."
        });
    }
}

async function updateApplicationPeriod(req, res) {
    try {
        const { start_date, end_date, start_time, end_time, period_id } = req.body;
        
        if (!start_date || !end_date || !start_time || !end_time || !period_id) {
            return res.status(400).json({ 
                error: "All fields (start_date, end_date, start_time, end_time, period_id) are required." 
            });
        }

        const result = await organizationsModel.updateApplicationPeriod(
            start_date,
            end_date,
            start_time,
            end_time,
            period_id,
            req.user.email
        );

        res.status(200).json({
            success: true,
            message: "Application period updated successfully.",
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while updating the application period."
        });
    }
}

async function initiateApprovalProcess(req, res) {
    try {
        const { application_id } = req.body;
        
        if (!application_id) {
            return res.status(400).json({ 
                error: "application_id is required." 
            });
        }

        const result = await organizationsModel.initiateApprovalProcess(
            application_id,
            req.user.email
        );

        res.status(200).json({
            success: true,
            message: "Approval process initiated successfully.",
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while initiating the approval process."
        });
    }
}



module.exports = {
    getOrganizations,
    createOrganizationApplication,
    getSpecificApplication,
    approveApplication,
    rejectApplication,
    getOrganizationRequirement,
    getOrganizationLogo,
    getOrganizationApplications,
    checkOrganizationName,
    checkOrganizationEmails,
    getOrganizationDetails,
    archiveOrganization,
    unarchiveOrganization,
    getOrganizationsByStatus,
    getOrganizationEventApplications,
    getEventRequirementSubmissionsByOrganization,
    getOrganizationDashboardStats,
    createExecutiveMember,
    updateExecutiveMember,
    archiveExecutiveMember,
    createCommittee,
    getOrganizationCommittees,
    updateCommittee,
    archiveCommittee,
    getAllCommitteeMembers,
    addCommitteeMember,
    updateCommitteeMember,
    archiveCommitteeMember,
    getPendingOrganizationMembers,
    approveMembershipApplication,
    rejectMembershipApplication,
    addOrganizationMember,
    editOrganizationMember,
    archiveOrganizationMember,
    GetApprovalTimeline,
    getOrganizationOfficers,
    getOrganizationMembers,
    getProgram,
    getAllExecutiveRanks,
    // Enhanced functions
    addApplicationPeriod,
    updateApplicationPeriod,
    initiateApprovalProcess,
    getOrganizationLogoApplication
};