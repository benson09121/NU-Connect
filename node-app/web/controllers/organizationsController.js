const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { subscribeToChannel, publishToChannel } = require('./sseController');
const organizationsModel = require('../models/organizationsModel');
const userCacheModel = require('../models/userCacheModel');

async function getOrganizations(req, res) {
    const { sessionId, user_role, org_name, status } = req.query;
    const program_id = req.query.program_id || null;

    try {
        if (sessionId) {
           if (user_role === 'Program Chair') {
                const organizations = await organizationsModel.getOrganizationByProgram(program_id);
                subscribeToChannel(sessionId, `organizations_${user_role}_${program_id}`);
                res.json(organizations);
            } else if (user_role === 'Adviser') {
                const organizations = await organizationsModel.getOrganizationByName(org_name);
                subscribeToChannel(sessionId, `organizations_${user_role}_${org_name}`);
                res.json(organizations);
            } else if (user_role === 'Student') {
                // Get the organization associated with the student
                const user = await organizationsModel.getUserByEmail(req.user.email);
                if (!user || !user.user_id) {
                    return res.status(404).json({ message: 'User not found.' });
                }
                const userOrganizations = await organizationsModel.getUserOrganization(user.user_id);
                subscribeToChannel(sessionId, `organizations_${user_role}_${user.user_id}`);
                res.json(userOrganizations);
            } else {
                const organizations = await organizationsModel.getAllOrganizations();
                subscribeToChannel(sessionId, `organizations_all`);
                res.json(organizations);
            }
        }
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching organizations.",
        });
    }
}

async function getOrganizationDetails(req, res) {
    try {
        const { org_id, org_version_id } = req.query;
        const organizationDetails = await organizationsModel.getOrganizationDetails(org_id, org_version_id);
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
    try {
        const { org_id, org_version_id, sessionId } = req.query;
        const officers = await organizationsModel.getOrganizationOfficers(org_id, org_version_id);
        if (sessionId) {
            subscribeToChannel(sessionId, `organization_officers_${org_id}_${org_version_id}`);
        }
        res.status(200).json(officers);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the organization officers.",
        });
    }
}

async function getOrganizationMembers(req, res) {
    try {
        const { org_id, org_version_id, sessionId } = req.query;
        const members = await organizationsModel.getOrganizationMembers(org_id, org_version_id);
        if (sessionId) {
            subscribeToChannel(sessionId, `organization_members_${org_id}_${org_version_id}`);
        }
        res.status(200).json(members);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the organization members.",
        });
    }
}


async function createOrganizationApplication(req, res) {
    try {
        // File type configuration
        const ALLOWED_MIME_TYPES = {
            'application/pdf': ['.pdf'],
            'application/msword': ['.doc'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            'application/vnd.ms-excel': ['.xls'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'image/jpeg': ['.jpg', '.jpeg'],
            'image/png': ['.png']
        };

        const ALLOWED_LOGO_TYPES = {
            'image/jpeg': ['.jpg', '.jpeg'],
            'image/png': ['.png']
        };
        
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
        const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5MB for logos

        // Parse request body
        const organization = JSON.parse(req.body.organization);
        const executives = JSON.parse(req.body.executives);
        const requirements = JSON.parse(req.body.requirements);

        // Validate logo file
        const logoFile = req.files?.logo;
        if (!logoFile) {
            return res.status(400).json({ error: 'Organization logo is required' });
        }

        // Validate logo MIME type
        if (!Object.keys(ALLOWED_LOGO_TYPES).includes(logoFile.mimetype)) {
            return res.status(400).json({ 
                error: 'Logo must be JPG or PNG format' 
            });
        }

        // Validate logo file extension
        const logoExt = path.extname(logoFile.name).toLowerCase();
        if (!ALLOWED_LOGO_TYPES[logoFile.mimetype].includes(logoExt)) {
            return res.status(400).json({ 
                error: 'Logo file extension does not match its content type' 
            });
        }

        // Validate logo file size
        if (logoFile.size > MAX_LOGO_SIZE) {
            return res.status(400).json({ 
                error: `Logo file size exceeds ${MAX_LOGO_SIZE / (1024 * 1024)}MB limit` 
            });
        }

        // Process and validate requirement files
        const requirementFiles = {};
        const validationErrors = [];

        for (const reqItem of requirements) {
            const fileKey = `requirement_${reqItem.requirement_id}`;
            const file = req.files?.[fileKey];
            
            if (file) {
                // Validate MIME type
                if (!Object.keys(ALLOWED_MIME_TYPES).includes(file.mimetype)) {
                    validationErrors.push({
                        requirement_id: reqItem.requirement_id,
                        error: `Invalid file type. Allowed: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG`
                    });
                    continue;
                }

                // Validate file extension
                const ext = path.extname(file.name).toLowerCase();
                const allowedExts = ALLOWED_MIME_TYPES[file.mimetype];
                if (!allowedExts.includes(ext)) {
                    validationErrors.push({
                        requirement_id: reqItem.requirement_id,
                        error: `File extension (${ext}) does not match its content type`
                    });
                    continue;
                }

                // Validate file size
                if (file.size > MAX_FILE_SIZE) {
                    validationErrors.push({
                        requirement_id: reqItem.requirement_id,
                        error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`
                    });
                    continue;
                }

                // Sanitize filename to prevent path traversal
                const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                file.sanitizedName = sanitizedName;

                requirementFiles[reqItem.requirement_id] = file;
            }
        }

        // If there are validation errors, return them
        if (validationErrors.length > 0) {
            return res.status(400).json({ 
                error: 'File validation failed',
                details: validationErrors 
            });
        }

        // Generate secure filenames for requirements
        const requirementFilePaths = requirements.map(req => {
            const file = requirementFiles[req.requirement_id];
            if (file) {
                // Generate secure filename with timestamp and sanitized original name
                const timestamp = Date.now();
                const randomString = Math.random().toString(36).substring(2, 8);
                const ext = path.extname(file.sanitizedName);
                const filename = `requirement-${timestamp}-${randomString}${ext}`;
                
                return {
                    requirement_id: req.requirement_id,
                    requirement_path: filename,
                    original_name: file.name
                };
            } else {
                return {
                    requirement_id: req.requirement_id,
                    requirement_path: req.requirement_path
                };
            }
        });

        // Lookup user_id by email
        const user = await organizationsModel.getUserByEmail(req.user.email);
        if (!user || !user.user_id) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Generate secure logo filename
        const logoTimestamp = Date.now();
        const logoRandomString = Math.random().toString(36).substring(2, 8);
        const logoExtension = path.extname(logoFile.name);
        const logoFilename = `logo-${logoTimestamp}-${logoRandomString}${logoExtension}`;

        // Create organization application in database
        let dbResult;
        try {
            dbResult = await organizationsModel.createOrganizationApplication(
                { ...organization, organization_logo: logoFilename },
                executives,
                requirementFilePaths,
                user.user_id
            );
        } catch (dbError) {
            console.error('Database error:', dbError);
            return res.status(500).json({ 
                error: 'Failed to create organization application in database' 
            });
        }

        // Validate database result
        if (!dbResult || !dbResult[0] || !dbResult[0].application_id) {
            console.error('Invalid database result:', dbResult);
            return res.status(500).json({ 
                error: 'Failed to create organization application - invalid response' 
            });
        }

        const appId = dbResult[0].application_id;
        console.log(`Creating directories for application ID: ${appId}`);

        // Create directory structure
        const appDir = path.join('/app/applications', String(appId));
        const logoDir = path.join(appDir, 'logo');
        const requirementsDir = path.join(appDir, 'requirements');

        try {
            // Create directories with error handling
            [appDir, logoDir, requirementsDir].forEach(dir => {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                    console.log(`Created directory: ${dir}`);
                }
            });
        } catch (dirError) {
            console.error('Failed to create directories:', dirError);
            // Attempt to rollback database entry
            try {
                await organizationsModel.deleteApplication(appId);
            } catch (rollbackError) {
                console.error('Failed to rollback application:', rollbackError);
            }
            return res.status(500).json({ 
                error: 'Failed to create application directories' 
            });
        }

        // File write operations with individual error handling
        const fileWriteErrors = [];

        // Write logo file
        try {
            const logoPath = path.join(logoDir, logoFilename);
            fs.writeFileSync(logoPath, logoFile.data);
            console.log(`Logo saved: ${logoPath}`);
        } catch (fileErr) {
            console.error('Failed to write logo file:', fileErr);
            fileWriteErrors.push({ file: 'logo', error: fileErr.message });
        }

        // Write requirement files
        for (const reqPath of requirementFilePaths) {
            const file = requirementFiles[reqPath.requirement_id];
            if (file) {
                try {
                    const filePath = path.join(requirementsDir, reqPath.requirement_path);
                    fs.writeFileSync(filePath, file.data);
                    console.log(`Requirement saved: ${filePath}`);
                } catch (fileErr) {
                    console.error(`Failed to write requirement file (${reqPath.requirement_path}):`, fileErr);
                    fileWriteErrors.push({ 
                        file: reqPath.requirement_path, 
                        requirement_id: reqPath.requirement_id,
                        error: fileErr.message 
                    });
                }
            }
        }

        // If critical files failed to save, return error
        if (fileWriteErrors.length > 0) {
            // Log detailed errors
            console.error('File write errors:', fileWriteErrors);
            
            // Attempt cleanup
            try {
                if (fs.existsSync(appDir)) {
                    fs.rmSync(appDir, { recursive: true, force: true });
                }
                await organizationsModel.deleteApplication(appId);
            } catch (cleanupError) {
                console.error('Failed to cleanup after file write errors:', cleanupError);
            }

            return res.status(500).json({ 
                error: 'Failed to save some files',
                details: fileWriteErrors 
            });
        }

        // Fetch complete application data
        let result;
        try {
            result = await organizationsModel.getApplication(appId);
            if (!result) {
                throw new Error('Application created but could not be retrieved');
            }
        } catch (fetchError) {
            console.error('Failed to fetch created application:', fetchError);
            return res.status(500).json({ 
                error: 'Application created but could not retrieve details' 
            });
        }

        // Publish to channel with error handling
        try {
            publishToChannel('organization-applications', {
                operation: 'CREATE',
                data: result
            });
        } catch (publishError) {
            console.error('Failed to publish to channel:', publishError);
            // Don't fail the request if publishing fails
        }

        console.log('Application created successfully:', result);
        console.log(`Application ID: ${appId}, User ID: ${user.user_id}`);

        // Initiate approval process with enhanced error handling
        try {
            await organizationsModel.initiateApprovalProcess(appId, user.user_id);
            console.log('Approval process initiated successfully');
        } catch (approvalError) {
            console.error('Failed to initiate approval process:', approvalError);
            // Don't fail the application creation if approval process fails
            // But log it for monitoring
        }

        // Prepare successful response
        const responseData = {
            ...dbResult[0],
            logo_url: `/apps/applications/${appId}/logo/${logoFilename}`,
            requirement_files: requirementFilePaths.map(req => ({
                requirement_id: req.requirement_id,
                file_url: req.requirement_path ? `/apps/applications/${appId}/requirements/${req.requirement_path}` : null,
                original_name: req.original_name
            }))
        };

        // Send success response
        res.status(201).json({
            message: 'Organization application submitted successfully',
            data: responseData
        });

    } catch (error) {
        // Log unexpected errors
        console.error('Unexpected error in createOrganizationApplication:', error);
        
        // Send generic error response
        res.status(500).json({
            error: error.message || "An unexpected error occurred while creating the organization application."
        });
    }
}

// Optional: Add a helper function to validate file safety
function isFileSafe(file) {
    // Additional security checks
    const dangerousPatterns = [
        /\.exe$/i,
        /\.bat$/i,
        /\.cmd$/i,
        /\.sh$/i,
        /\.ps1$/i,
        /\.vbs$/i,
        /\.js$/i,
        /\.jar$/i,
        /\.com$/i,
        /\.scr$/i,
        /\.msi$/i
    ];

    const filename = file.name.toLowerCase();
    return !dangerousPatterns.some(pattern => pattern.test(filename));
}

// Optional: Add cleanup function for failed applications
async function cleanupFailedApplication(appId) {
    try {
        const appDir = path.join('/app/applications', String(appId));
        if (fs.existsSync(appDir)) {
            fs.rmSync(appDir, { recursive: true, force: true });
        }
        await organizationsModel.deleteApplication(appId);
        console.log(`Cleaned up failed application: ${appId}`);
    } catch (error) {
        console.error(`Failed to cleanup application ${appId}:`, error);
    }
}

async function getSpecificApplication(req, res) {
    try {
        const { org_name, app_id } = req.query;

        // Lookup user_id by email (optimized)
        const user = await organizationsModel.getUserByEmail(req.user.email);
        if (!user || !user.user_id) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const application = await organizationsModel.getSpecificApplication(user.user_id, org_name, app_id);
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
        const notification = await organizationsModel.sendApprovalNotification(result?.application?.id, application_id);
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
    let organization_id = req.query.organization_id;
    let organization_version_id = req.query.organization_version_id;
    let logo_name = req.query.logo_name;
    try {
        res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
        // Set Content-Disposition so browser handles as image (inline) 
        res.setHeader('Content-Disposition', `inline; filename="${logo_name}"`);
        // X-Accel-Redirect for Nginx internal serving
        res.setHeader('X-Accel-Redirect', `/protected-organization-requirements/${organization_id}/${organization_version_id}/logo/${logo_name}`);
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
        const { president_email } = req.body;
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
        const exists = await organizationsModel.checkOrganizationEmails(jsonEmails, president_email);
        res.json({ exists });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while checking the organization emails.",
        });
    }   
}



async function archiveOrganization(req, res) {
    try {
        // Log the incoming request body for debugging
        console.log('[archiveOrganization] Received:', JSON.stringify(req.body, null, 2));

        const { organization_id, reason, user_email } = req.body;
        if (!organization_id) {
            return res.status(400).json({ message: 'Organization ID is required.' });
        }
        if (!reason || reason.trim().length < 3) {
            return res.status(400).json({ message: 'Archive reason is required.' });
        }

        // Use user_email from body if provided, else fallback to req.user.email
        const emailToUse = user_email || req.user?.email;
        const user = await organizationsModel.getUserByEmail(emailToUse);
        if (!user || !user.user_id) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const result = await organizationsModel.archiveOrganization(organization_id, user.user_id, reason.trim());

        // Real-time notification: treat archive as a DELETE operation for consumers
        const channels = [
            'organizations_all',
            `organizations_Program Chair_${result?.base_program_id || ''}`,
            `organizations_Adviser_${result?.name || ''}`,
            `organizations_Student_${result?.name || ''}`
        ];
        channels.forEach(channel => {
            publishToChannel(channel, {
                operation: 'DELETE',
                data: {
                    organization_id,
                    archived_by: user.user_id,
                    archived_reason: reason.trim(),
                    result
                }
            });
        });

        res.status(200).json({ message: 'Organization archived successfully.', result });
    } catch (error) {
        console.error('[archiveOrganization] Error:', error);
        if (error.sqlMessage) {
            console.error('[archiveOrganization] SQL Error:', error.sqlMessage);
        }
        res.status(500).json({
            error: error.message || error.sqlMessage || "An error occurred while archiving the organization.",
        });
    }
}

async function unarchiveOrganization(req, res) {
    try {
        // Log the incoming request body for debugging
        console.log('[unarchiveOrganization] Received:', JSON.stringify(req.body, null, 2));

        const { organization_id, reason, user_email } = req.body;
        if (!organization_id) {
            return res.status(400).json({ message: 'Organization ID is required.' });
        }

        // Use user_email from body if provided, else fallback to req.user.email
        const emailToUse = user_email || req.user?.email;
        const user = await organizationsModel.getUserByEmail(emailToUse);
        if (!user || !user.user_id) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const result = await organizationsModel.unarchiveOrganization(organization_id, user.user_id, reason ? reason.trim() : null);

        // Real-time notification: notify clients that organization was restored
        const channels = [
            'organizations_all',
            `organizations_Program Chair_${result?.base_program_id || ''}`,
            `organizations_Adviser_${result?.name || ''}`,
            `organizations_Student_${result?.name || ''}`
        ];
        channels.forEach(channel => {
            publishToChannel(channel, {
                operation: 'CREATE',
                data: {
                    organization_id,
                    unarchived_by: user.user_id,
                    unarchived_reason: reason || null,
                    result
                }
            });
        });

        res.status(200).json({ message: 'Organization unarchived successfully.', result });
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
        const { email, program_name, role_title, rank_level, orgId, orgVersionId } = req.body;
        const action_by_email = req.user.email;

        const result = await organizationsModel.createExecutiveMember({
            orgId,
            email,
            program_name,
            role_title,
            rank_level,
            action_by_email,
            orgVersionId
        });

        publishToChannel(`organization_officers_${orgId}_${orgVersionId}`, {
            operation: 'CREATE',
            data: result
        });

        res.status(201).json({ message: result.message });
    } catch (error) {
        const sqlMessage = error.sqlMessage || error.message || 'An error occurred while adding executive member.';
        res.status(400).json({ error: sqlMessage });
    }
}

async function updateExecutiveMember(req, res) {
    try {
        const { orgId, email, program_name, role_title, rank_level, orgVersionId } = req.body;
        const action_by_email = req.user.email;

        const result = await organizationsModel.updateExecutiveMember({
            orgId,
            email,
            program_name,
            role_title,
            rank_level,
            action_by_email
        });

        publishToChannel(`organization_officers_${orgId}_${orgVersionId}`, {
            operation: 'UPDATE',
            data: result
        });

        res.status(200).json({ message: "Update Successful" });
    } catch (error) {
        const sqlMessage = error.sqlMessage || error.message || 'An error occurred while updating executive member.';
        res.status(400).json({ error: sqlMessage });
    }
}
async function archiveExecutiveMember(req, res) {
    try {
        const { organization_id, email, orgVersionId } = req.body;
        const action_by_email = req.user.email;

        const result = await organizationsModel.archiveExecutiveMember({
            organization_id,
            email,
            action_by_email
        });

        publishToChannel(`organization_officers_${organization_id}_${orgVersionId}`, {
            operation: 'DELETE',
            data: result
        });

        res.status(200).json({ message: "Archive Successful" });
    } catch (error) {
        const sqlMessage = error.sqlMessage || error.message || 'An error occurred while archiving executive member.';
        res.status(400).json({ error: sqlMessage });
    }
}

async function getOrganizationCommittees(req, res) {
    try {
        const { org_id, org_version_id, sessionId } = req.query;
        const committees = await organizationsModel.getOrganizationCommittees(org_id, org_version_id);
        if (sessionId) {
            subscribeToChannel(sessionId, `organization_committees_${org_id}_${org_version_id}`);
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
        const { committee_name, description, orgId, orgVersionId } = req.body;
        const action_by_email = req.user.email;

        const result = await organizationsModel.createCommittee({
            orgId,
            committee_name,
            description,
            action_by_email,
        });

        publishToChannel(`organization_committees_${orgId}_${orgVersionId}`, {
            operation: 'CREATE',
            data: result
        });

        res.status(201).json({ message: 'Committee created successfully.' });
    } catch (error) {
        const sqlMessage = error.sqlMessage || error.message || 'An error occurred while creating the committee.';
        res.status(400).json({ error: sqlMessage });
    }
}
async function updateCommittee(req, res) {
    try {
        const { committee_id, new_name, new_description, orgId, orgVersionId } = req.body;
        const action_by_email = req.user.email;

        const result = await organizationsModel.updateCommittee({
            committee_id,
            new_name,
            new_description,
            action_by_email
        });

        publishToChannel(`organization_committees_${orgId}_${orgVersionId}`, {
            operation: 'UPDATE',
            data: result
        });

        res.status(200).json({ message: 'Committee updated successfully.' });
    } catch (error) {
        const sqlMessage = error.sqlMessage || error.message || 'An error occurred while updating the committee.';
        res.status(400).json({ error: sqlMessage });
    }
}
async function archiveCommittee(req, res) {
    try {
        const { committee_id, reason, orgId, orgVersionId } = req.body;
        const archived_by_email = req.user.email;

        const result = await organizationsModel.archiveCommittee({
            committee_id,
            reason,
            archived_by_email
        });

        publishToChannel(`organization_committees_${orgId}_${orgVersionId}`, {
            operation: 'DELETE',
            data: result
        });

        res.status(200).json({
            message: 'Committee archived successfully.',
            committees_archived: result
        });
    } catch (error) {
        const sqlMessage = error.sqlMessage || error.message || 'An error occurred while archiving the committee.';
        res.status(400).json({ error: sqlMessage });
    }
}


async function getAllCommitteeMembers(req, res) {
    try {
        const { org_id, org_version_id, sessionId } = req.query;
        const committees = await organizationsModel.getAllCommitteeMembers(org_id, org_version_id);
        if (sessionId) {
            subscribeToChannel(sessionId, `committee_members_${org_id}_${org_version_id}`);
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
        // Destructure action_by_email from req.body (sent from frontend)
        const { committee_id, user_email, role, action_by_email, orgId, orgVersionId } = req.body;
        
        // Validate that action_by_email is provided from frontend
        if (!action_by_email) {
            return res.status(400).json({ error: 'action_by_email is required' });
        }

        // Validate that user_email is provided from frontend
        if (!user_email) {
            return res.status(400).json({ error: 'user_email is required from frontend' });
        }

        const result = await organizationsModel.addCommitteeMember({
            committee_id,
            user_email,
            role,
            action_by_email
        });

        // Remove from plain members if they existed there
        const emailUpdate = await organizationsModel.getSingleOrganizationMember(result[0].member_id, orgId);
        const emailSSuggestionOrganizationUpdate = await organizationsModel.GetSingleOrganizationUser(result[0].member_id);
        await userCacheModel.cacheSingleOrganizationUser(orgId, orgVersionId, emailSSuggestionOrganizationUpdate[0]);

        publishToChannel(`committee_members_${orgId}_${orgVersionId}`, {
            operation: 'CREATE',
            data: result
        });
        publishToChannel(`organization_members_${orgId}_${orgVersionId}`, {
            operation: 'DELETE',
            data: emailUpdate
        });

        res.status(201).json({
            message: 'Committee member added successfully.',
            data: result
        });
    } catch (error) {
        const sqlMessage = error.sqlMessage || error.message || 'An error occurred while adding committee member.';
        res.status(400).json({ error: sqlMessage });
    }
}

async function updateCommitteeMember(req, res) {
    try {
        const { committee_member_id, new_role, orgId, orgVersionId } = req.body;  // Removed committee_id from destructuring
        const action_by_email = req.user.email;

        const result = await organizationsModel.updateCommitteeMember({
            committee_member_id,
            new_role,
            action_by_email
        });  // Removed committee_id from call

        publishToChannel(`committee_members_${orgId}_${orgVersionId}`, {
            operation: 'UPDATE',
            data: result
        });

        res.status(200).json({
            message: 'Committee member updated successfully.',
            rows_affected: result
        });
    } catch (error) {
        const sqlMessage = error.sqlMessage || error.message || 'An error occurred while updating committee member.';
        res.status(400).json({ error: sqlMessage });
    }
}

async function archiveCommitteeMember(req, res) {
    try {
        const { committee_member_id, reason, orgId, orgVersionId } = req.body;
        const action_by_email = req.user.email;

        const result = await organizationsModel.archiveCommitteeMember({
            committee_member_id,
            reason,
            action_by_email
        });

        publishToChannel(`committee_members_${orgId}_${orgVersionId}`, {
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
        const { org_id, org_version_id, sessionId } = req.query;
        const members = await organizationsModel.getPendingOrganizationMembers(org_id, org_version_id);
        if (sessionId) {
            subscribeToChannel(sessionId, `pending_organization_members_${org_id}_${org_version_id}`);
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
        const { application_id, remarks, organization_id, organization_version_id } = req.body;
        const reviewer_email = req.user.email;
        if (!application_id) {
            return res.status(400).json({ error: "application_id is required." });
        }
        const result = await organizationsModel.approveMembershipApplication(application_id, reviewer_email, remarks || null);
        publishToChannel(`pending_organization_members_${organization_id}_${organization_version_id}`,{
            operation: 'DELETE',
            data: result,
        });

        const updateMembers = await organizationsModel.getSingleOrganizationMember(result[0].id, organization_id);

        publishToChannel(`organization_members_${organization_id}_${organization_version_id}`, {
            operation: 'CREATE',
            data: updateMembers,
        });

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
        const { orgName, email, program_name, orgId, orgVersionId } = req.body;
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

        // Cache org user (uses id+version when available)
        if (orgId && orgVersionId) {
            await userCacheModel.cacheSingleOrganizationUser(orgId, orgVersionId, emailSUggestionOrganizationUpdate[0]);
        } else {
            await userCacheModel.cacheSingleOrganizationUser(orgName, emailSUggestionOrganizationUpdate[0]); // backward compat
        }

        // Prefer id+version channel; fallback to name-based for legacy
        if (orgId && orgVersionId) {
            publishToChannel(`organization_members_${orgId}_${orgVersionId}`, {
                operation: 'CREATE',
                data: result
            });
        } else {
            publishToChannel(`organization_members_${orgName}`, {
                operation: 'CREATE',
                data: result
            });
        }

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

async function getArchivedOrganizationMembers(req, res) {
    try {
        const { org_id, org_version_id, sessionId } = req.query;
        if (!org_id || !org_version_id) {
            return res.status(400).json({ message: 'org_id and org_version_id are required.' });
        }
        const archivedMembers = await organizationsModel.getArchivedOrganizationMembers(org_id, org_version_id);
        if (sessionId) {
            subscribeToChannel(sessionId, `archived_organization_members_${org_id}_${org_version_id}`);
        }
        res.status(200).json(archivedMembers);
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching archived organization members.",
        });
    }
}

async function archiveOrganizationMember(req, res) {
    try {
        const { member_id, reason, orgId, orgVersionId } = req.body;
        if (!member_id) {
            return res.status(400).json({ error: "member_id is required." });
        }
        const archived_by_email = req.user.email;
        const result = await organizationsModel.archiveOrganizationMember({ member_id, archived_by_email, reason, orgId, orgVersionId });

        // Real-time removal from members list
        if (orgId && orgVersionId) {
            publishToChannel(`organization_members_${orgId}_${orgVersionId}`, {
                operation: 'DELETE',
                data: result
            });
        }

        res.status(200).json({ message: 'Organization member archived successfully.' });
    } catch (error) {
        res.status(400).json({
            error: error.sqlMessage || error.message || "An error occurred while archiving the organization member."
        });
    }
}

async function unarchiveOrganizationMember(req, res) {
    try {
        const { member_id, reason, orgId, orgVersionId } = req.body;
        if (!member_id || !orgId || !orgVersionId) {
            return res.status(400).json({ message: 'member_id, orgId, and orgVersionId are required.' });
        }
        const unarchivedByEmail = req.user.email;
        const result = await organizationsModel.unarchiveOrganizationMember(
            member_id,
            unarchivedByEmail,
            reason || null,
            orgId,
            orgVersionId
        );

        // Real-time notification: notify clients that member was restored
        publishToChannel(`organization_members_${orgId}_${orgVersionId}`, {
            operation: 'CREATE',
            data: result
        });

        res.status(200).json({ message: 'Organization member unarchived successfully.' });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while unarchiving the organization member."
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

async function getApprovedOrganizationLogos(req, res) {
    try {
        const logos = await organizationsModel.getApprovedOrganizationLogos();

        // Use org_id in the URL instead of orgNameEncoded
        const data = logos.map(row => {
            const logoFilename = row.logo || null;
            const orgId = row.organization_id;
            const cycle_number = row.current_org_version_id || 0;
            return {
                organization_id: orgId,
                organization_name: row.organization_name,
                logo: logoFilename,
                current_org_version_id: cycle_number,
                logo_url: logoFilename
                    ? `/protected-organization-requirements/${orgId}/${cycle_number}/logo/${logoFilename}`
                    : null
            };
        });

        res.status(200).json(data);
    } catch (error) {
        console.error('[getApprovedOrganizationLogos] error:', error);
        res.status(500).json({
            error: error.message || 'An error occurred while fetching organization logos.'
        });
    }
}
async function checkOrgRenewalStatus(req, res){
    try{
        const {org_id, sessionId, org_version_id } = req.query;
        if (!org_id) {
            return res.status(400).json({ error: "org_id is required." });
        }
        const result = await organizationsModel.checkOrgRenewalStatus(org_id);

        publishToChannel(`organizations_renewal_status_${org_id}_${org_version_id}`, {
            sessionId,
            status: result
        });
        res.status(200).json(result);
    } catch (error) {
        console.error('[checkOrgRenewalStatus] error:', error);
        res.status(500).json({
            error: error.message || 'An error occurred while checking organization renewal status.'
        });
    }
}

async function getAllApplicationsByOrganization(req, res) {
    try {
        const { organization_id } = req.query;
        
        if (!organization_id) {
            return res.status(400).json({ error: "organization_id is required." });
        }

        const applications = await organizationsModel.getAllApplicationsByOrganization(organization_id);
        res.json(applications);
    } catch (error) {
        console.error('Error fetching applications by organization:', error);
        res.status(500).json({
            error: error.message || "An error occurred while fetching applications by organization.",
        });
    }
}

async function getOrganizationDashboardOverview(req, res) {
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

        const overview = await organizationsModel.getOrganizationDashboardOverview(organization_id);
        res.json(overview);
    } catch (error) {
        console.error('Error fetching organization dashboard overview:', error);
        res.status(500).json({
            error: error.message || "An error occurred while fetching organization dashboard overview.",
        });
    }
}

async function getAllOrganizations(req, res) {
    try {
        const { sessionId } = req.query;
        const organizations = await organizationsModel.getAllOrganizations();
        
        if (sessionId) {
            subscribeToChannel(sessionId, 'organizations_all');
        }
        
        res.json(organizations);
    } catch (error) {
        console.error('Error fetching all organizations:', error);
        res.status(500).json({
            error: error.message || "An error occurred while fetching all organizations.",
        });
    }
}

async function getOrganizationCommitteeRoles(req, res) {
    try{
        const {sessionId, organization_id, organization_version_id} = req.query;

        const roles = await organizationsModel.getOrganizationCommitteeRoles(organization_id, organization_version_id);

        if(sessionId){
            subscribeToChannel(sessionId, `committee_roles_${organization_id}_${organization_version_id}`);
        }
        res.json(roles);
    } catch (error) {
        console.error('Error fetching organization committee roles:', error);
        res.status(500).json({
            error: error.message || "An error occurred while fetching organization committee roles.",
        });
    }
}

async function getOrganizationExecutives(req, res) {
    try {
        const { organization_id, organization_version_id, sessionId } = req.query;
        const executives = await organizationsModel.getOrganizationExecutives(organization_id, organization_version_id);
        if (sessionId) {
            subscribeToChannel(sessionId, `executives_${organization_id}_${organization_version_id}`);
        }
        res.json(executives);
    } catch (error) {
        console.error('Error fetching organization executives:', error);
        res.status(500).json({
            error: error.message || "An error occurred while fetching organization executives.",
        });
    }
}

async function getOrganizationPermissions(req, res) {
    try{
        const organization_permissions = await organizationsModel.getOrganizationPermissions();
        res.json(organization_permissions);
    } catch (error) {
        console.error('Error fetching organization permissions:', error);
        res.status(500).json({
            error: error.message || "An error occurred while fetching organization permissions.",
        });
    }
};

async function updateCommitteePermissions(req, res) {
    try {
        const { committee_role_id, committee_id, role_type, permissions, organization_id, organization_version_id } = req.body;
        
        // Use committee_role_id if provided, otherwise fall back to committee_id
        const targetCommitteeId = committee_role_id || committee_id;
        
        // Validate required fields
        if (!targetCommitteeId || !role_type || !Array.isArray(permissions)) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: committee_role_id (or committee_id), role_type, and permissions array'
            });
        }

        // Map frontend role_type to database values
        let dbRoleType;
        if (role_type.toLowerCase() === 'head') {
            dbRoleType = 'Committee Head';
        } else if (role_type.toLowerCase() === 'officer') {
            dbRoleType = 'Committee Officer';
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid role_type. Must be "head" or "officer"'
            });
        }

        // Update committee permissions
        const result = await organizationsModel.updateCommitteePermissions(targetCommitteeId, dbRoleType, permissions);
        console.log(result);

        publishToChannel(`committee_roles_${organization_id}_${organization_version_id}`, {
            operation: 'UPDATE',
            data: result
        });

        res.json({
            success: true,
            message: `Committee ${role_type} permissions updated successfully`,
            data: result
        });

    } catch (error) {
        console.error('Error updating committee permissions:', error);
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while updating committee permissions."
        });
    }
}
async function updateExecutivePermissions(req, res) {
    try {
        const { executive_id, permissions, organization_id, organization_version_id } = req.body;
        
        // Validate required fields
        if (!executive_id || !Array.isArray(permissions)) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: executive_id and permissions array'
            });
        }

        // Update executive permissions
        const result = await organizationsModel.updateExecutivePermissions(executive_id, permissions);
        console.log('Raw result from stored procedure:', result);
        
        // Extract the actual data from the wrapper object
        let formattedResult;
        if (result && result.executive_roles) {
            // If stored procedure returns with 'executive_roles' key
            formattedResult = result.executive_roles;
        } else if (result && result.updated_executive_role) {
            // If stored procedure returns with 'updated_executive_role' key, wrap in array
            formattedResult = [result.updated_executive_role];
        } else if (Array.isArray(result)) {
            // If result is already an array
            formattedResult = result;
        } else {
            // Fallback - wrap single object in array
            formattedResult = [result];
        }

        console.log('Formatted result for pub/sub:', formattedResult);
        
        publishToChannel(`executives_${organization_id}_${organization_version_id}`, {
            operation: 'UPDATE',
            data: formattedResult
        });

        res.json({
            success: true,
            message: 'Executive permissions updated successfully',
            data: formattedResult
        });

    } catch (error) {
        console.error('Error updating executive permissions:', error);
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while updating executive permissions."
        });
    }
}

async function getMemberPermissionOverrides(req, res){
    try{
        const {  organization_id, organization_version_id, sessionId } = req.query;

        const overrides = await organizationsModel.getMemberPermissionOverrides(organization_id, organization_version_id);
        
        if(sessionId){
            subscribeToChannel(sessionId, `member_permission_${organization_id}_${organization_version_id}`);
        }
        
        res.status(200).json(overrides);
    } catch (error) {
        console.error('Error fetching member permission overrides:', error);
        res.status(500).json({
            error: error.message || "An error occurred while fetching member permission overrides.",
        });
    }
}

async function getEmailSuggestionOverride(req, res) {
    try {
        const { organization_id, organization_version_id, pattern } = req.query;


        // Get email suggestions for users not in permission overrides
        const suggestions = await organizationsModel.getEmailSuggestionOverride(
            parseInt(organization_id), 
            parseInt(organization_version_id),
            pattern
        );

        res.json({
            success: true,
            message: 'Email suggestion override retrieved successfully',
            data: suggestions || []
        });

    } catch (error) {
        console.error('Error getting email suggestion override:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'An error occurred while fetching email suggestion override'
        });
    }
}

async function addMemberPermissionOverride(req, res) {
    try {
        const { email, permissions, organization_id, organization_version_id, user_details } = req.body;
        const action_by_email = req.user.email;

        // Validate required fields
        if (!email || !Array.isArray(permissions) || !organization_id || !organization_version_id) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: email, permissions array, organization_id, and organization_version_id'
            });
        }

        // Validate permissions array format
        for (const permission of permissions) {
            if (!permission.permission_name || typeof permission.is_allowed !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    message: 'Each permission must have permission_name and is_allowed (boolean) properties'
                });
            }
        }

        // Add member permission overrides
        const result = await organizationsModel.addMemberPermissionOverride(
            email,
            permissions,
            parseInt(organization_id),
            parseInt(organization_version_id),
            action_by_email
        );

        // Publish to real-time channel
        publishToChannel(`member_permission_${organization_id}_${organization_version_id}`, {
            operation: 'CREATE',
            data: result,
            user_details: user_details || null
        });

        res.json({
            success: true,
            message: 'Member permission overrides added successfully',
            data: result
        });

    } catch (error) {
        console.error('Error adding member permission override:', error);
        
        // Handle specific error messages from stored procedure
        let errorMessage = error.message;
        if (error.sqlMessage) {
            errorMessage = error.sqlMessage;
        }

        res.status(500).json({
            success: false,
            error: errorMessage || 'An error occurred while adding member permission overrides'
        });
    }
}

async function updateMemberPermissionOverride(req, res) {
    try {
        const { member_id, organization_id, organization_version_id, permission_lists } = req.body;
        const action_by_email = req.user.email;

        // Validate required fields
        if (!member_id || !organization_id || !organization_version_id || !Array.isArray(permission_lists)) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: member_id, organization_id, organization_version_id, and permission_lists array'
            });
        }

        // Validate permission_lists array format
        for (const permission of permission_lists) {
            if (!permission.permission_name || typeof permission.is_allowed !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    message: 'Each permission must have permission_name and is_allowed (boolean) properties'
                });
            }
        }

        // Update member permission overrides
        const result = await organizationsModel.updateMemberPermissionOverride(
            parseInt(member_id),
            parseInt(organization_id),
            parseInt(organization_version_id),
            permission_lists,
            action_by_email
        );

        // Publish to real-time channel
        publishToChannel(`member_permission_${organization_id}_${organization_version_id}`, {
            operation: 'UPDATE',
            data: result
        });

        res.json({
            success: true,
            message: 'Member permission overrides updated successfully',
            data: result
        });

    } catch (error) {
        console.error('Error updating member permission override:', error);
        
        // Handle specific error messages from stored procedure
        let errorMessage = error.message;
        if (error.sqlMessage) {
            errorMessage = error.sqlMessage;
        }

        res.status(500).json({
            success: false,
            error: errorMessage || 'An error occurred while updating member permission overrides'
        });
    }
}

async function removeMemberPermissionOverride(req, res) {
    try {
        const { member_id, organization_id, organization_version_id } = req.body;
        const action_by_email = req.user.email;

        // Validate required fields
        if (!member_id || !organization_id || !organization_version_id) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: member_id, organization_id, and organization_version_id'
            });
        }

        // Remove all member permission overrides
        const result = await organizationsModel.removeMemberPermissionOverride(
            parseInt(member_id),
            parseInt(organization_id),
            parseInt(organization_version_id),
            action_by_email
        );
        console.log(result);
        // Publish to real-time channel
        publishToChannel(`member_permission_${organization_id}_${organization_version_id}`, {
            operation: 'DELETE',
            data: result
        });

        res.json({
            success: true,
            message: 'All member permission overrides removed successfully',
            data: result
        });

    } catch (error) {
        console.error('Error removing member permission override:', error);
        
        // Handle specific error messages from stored procedure
        let errorMessage = error.message;
        if (error.sqlMessage) {
            errorMessage = error.sqlMessage;
        }

        res.status(500).json({
            success: false,
            error: errorMessage || 'An error occurred while removing member permission overrides'
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
    getOrganizationLogoApplication,
    getApprovedOrganizationLogos,
    checkOrgRenewalStatus,
    getAllApplicationsByOrganization,
    getOrganizationDashboardOverview,
    getAllOrganizations,
    getOrganizationCommitteeRoles,
    getOrganizationExecutives,
    getOrganizationPermissions,
    updateCommitteePermissions,
    updateExecutivePermissions,
    getMemberPermissionOverrides,
    getEmailSuggestionOverride,
    addMemberPermissionOverride,
    updateMemberPermissionOverride,
    removeMemberPermissionOverride,
    getArchivedOrganizationMembers,
    unarchiveOrganizationMember
};