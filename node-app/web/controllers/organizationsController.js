const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { subscribeToChannel, publishToChannel, publishOrgHub } = require('./sseController');
const organizationsModel = require('../models/organizationsModel');
const userCacheModel = require('../models/userCacheModel');
const { TermPaymentModel } = require('../models/simplifiedTermPaymentModel');
const userModel = require('../models/userModel'); // 🆕 For real-time user organizations
const pool = require('../../config/db');
const { notifyOrganizationApproved, notifyMembershipGranted, notifyMembershipRevoked } = require('../utils/organizationEvents'); // 🆕 Real-time org events

//////////////////   

// Helper function for standardized real-time endpoints
const handleRealtimeEndpoint = async (req, res, dataFetcher, entity) => {
  try {
    const { org_id, org_version_id, sessionId, hub } = req.query;
    
    // Always fetch and return data immediately
    const data = await dataFetcher(org_id, org_version_id);
    
    // If sessionId is provided, set up the subscription for real-time updates
    if (sessionId) {
      subscribeToChannel(sessionId, `${entity}_${org_id}_${org_version_id}`);
    }
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

async function getOrganizationHubData(req, res) {
  try {
    const { org_id, org_version_id, sessionId } = req.query;
    
    if (!org_id || !org_version_id) {
      return res.status(400).json({ error: 'org_id and org_version_id are required' });
    }
    
    // Fetch all data in parallel
    const [
      officers,
      members,
      committees,
      committeeMembers,
      pendingMembers,
      archivedMembers,
      leaveApplications,
      termPayments
    ] = await Promise.all([
      organizationsModel.getOrganizationOfficers(org_id, org_version_id).catch(() => []),
      organizationsModel.getOrganizationMembers(org_id, org_version_id).catch(() => []),
      organizationsModel.getOrganizationCommittees(org_id, org_version_id).catch(() => []),
      organizationsModel.getAllCommitteeMembers(org_id, org_version_id).catch(() => []),
      organizationsModel.getPendingOrganizationMembers(org_id, org_version_id).catch(() => []),
      organizationsModel.getArchivedOrganizationMembers(org_id, org_version_id).catch(() => []),
      organizationsModel.getLeaveApplications(org_id, org_version_id).catch(() => []),
      TermPaymentModel.getOrganizationPaymentSubmissions(org_id, org_version_id).catch(() => [])
    ]);
    
    // If sessionId is provided, set up subscriptions for all organization channels
    if (sessionId) {
      subscribeToChannel(sessionId, `orghub_${org_id}_${org_version_id}`);
      subscribeToChannel(sessionId, `organization_officers_${org_id}_${org_version_id}`);
      subscribeToChannel(sessionId, `organization_members_${org_id}_${org_version_id}`);
      subscribeToChannel(sessionId, `organization_committees_${org_id}_${org_version_id}`);
      subscribeToChannel(sessionId, `organization_committeeMembers_${org_id}_${org_version_id}`);
      subscribeToChannel(sessionId, `organization_pendingMembers_${org_id}_${org_version_id}`);
      subscribeToChannel(sessionId, `organization_archivedMembers_${org_id}_${org_version_id}`);
      subscribeToChannel(sessionId, `organization_leaveApplications_${org_id}_${org_version_id}`);
      subscribeToChannel(sessionId, `organization_termPayments_${org_id}_${org_version_id}`);
      
      // Publish initial term payments data using hub pattern
      try {
        publishOrgHub({
          orgId: org_id,
          orgVersionId: org_version_id,
          entity: 'organization_termPayments',
          operation: 'UPDATE',
          data: termPayments
        });
        console.log(`� [TERM-PAYMENTS] Published to hub - ${termPayments.length} payments`);
      } catch (sseError) {
        console.error('❌ [TERM-PAYMENTS] Failed to publish:', sseError);
      }
    }
    
    // Return all data at once
    res.json({
      officers,
      members,
      committees,
      committeeMembers,
      pendingMembers,
      archivedMembers,
      leaveApplications,
      termPayments
    });
    
  } catch (error) {
    console.error('Error fetching organization hub data:', error);
    res.status(500).json({
      error: error.message || 'An error occurred while fetching organization hub data'
    });
  }
}

async function getOrganizations(req, res) {
  const { sessionId, user_role, org_name, status } = req.query;
  const program_id = req.query.program_id || null;

  try {
    if (sessionId) {
      if (user_role === 'Program Chair') {
        const organizations = await organizationsModel.getOrganizationByProgram(parseInt(program_id));
        subscribeToChannel(sessionId, `organizations_${user_role}_${program_id}`);
        return res.json(organizations);
      } else if (user_role === 'Adviser') {
        const organizations = await organizationsModel.getOrganizationByName(org_name);
        subscribeToChannel(sessionId, `organizations_${user_role}_${org_name}`);
        return res.json(organizations);
      } else if (user_role === 'Student') {
        // Get the organization associated with the student
        const user = await organizationsModel.getUserByEmail(req.user.email);
        if (!user || !user.user_id) {
          return res.status(404).json({ message: 'User not found.' });
        }
        const userOrganizations = await organizationsModel.getUserOrganization(user.user_id);
        subscribeToChannel(sessionId, `organizations_${user_role}_${user.user_id}`);
        return res.json(userOrganizations);
      } else {
        const organizations = await organizationsModel.getAllOrganizations();
        subscribeToChannel(sessionId, `organizations_all`);
        return res.json(organizations);
      }
    } else {
      // no realtime, just return
      if (user_role === 'Program Chair') {
        return res.json(await organizationsModel.getOrganizationByProgram(program_id));
      } else if (user_role === 'Adviser') {
        return res.json(await organizationsModel.getOrganizationByName(org_name));
      } else if (user_role === 'Student') {
        const user = await organizationsModel.getUserByEmail(req.user.email);
        if (!user || !user.user_id) return res.status(404).json({ message: 'User not found.' });
        return res.json(await organizationsModel.getUserOrganization(user.user_id));
      }
      return res.json(await organizationsModel.getAllOrganizations());
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

async function getOrganizationOfficers(req, res) {
  return handleRealtimeEndpoint(
    req, 
    res, 
    organizationsModel.getOrganizationOfficers,
    'organization_officers'
  );
}

async function getOrganizationMembers(req, res) {
  return handleRealtimeEndpoint(
    req, 
    res, 
    organizationsModel.getOrganizationMembers,
    'organization_members'
  );
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
    const MAX_LOGO_SIZE = 10 * 1024 * 1024; // 10MB for logos

    // Parse request body
    const organization = JSON.parse(req.body.organization);
    const executives = JSON.parse(req.body.executives);
    const requirements = JSON.parse(req.body.requirements);

    // Validate logo file
    const logoFile = req.files?.logo;
    console.log('[DEBUG] Logo file validation:', {
      exists: !!logoFile,
      name: logoFile?.name,
      mimetype: logoFile?.mimetype,
      size: logoFile?.size,
      allowedTypes: Object.keys(ALLOWED_LOGO_TYPES)
    });
    
    if (!logoFile) {
      return res.status(400).json({ error: 'Organization logo is required' });
    }
    if (!Object.keys(ALLOWED_LOGO_TYPES).includes(logoFile.mimetype)) {
      console.log('[DEBUG] Logo MIME type rejected:', logoFile.mimetype);
      return res.status(400).json({ 
        error: 'Logo must be JPG or PNG format',
        debug: {
          received: logoFile.mimetype,
          allowed: Object.keys(ALLOWED_LOGO_TYPES)
        }
      });
    }
    const logoExt = path.extname(logoFile.name).toLowerCase();
    console.log('[DEBUG] Logo extension check:', {
      extension: logoExt,
      allowedForMime: ALLOWED_LOGO_TYPES[logoFile.mimetype]
    });
    
    if (!ALLOWED_LOGO_TYPES[logoFile.mimetype].includes(logoExt)) {
      return res.status(400).json({ 
        error: 'Logo file extension does not match its content type',
        debug: {
          extension: logoExt,
          mimetype: logoFile.mimetype,
          allowedExtensions: ALLOWED_LOGO_TYPES[logoFile.mimetype]
        }
      });
    }
    if (logoFile.size > MAX_LOGO_SIZE) {
      return res.status(400).json({ error: `Logo file size exceeds ${MAX_LOGO_SIZE / (1024 * 1024)}MB limit` });
    }

    // Process and validate requirement files
    const requirementFiles = {};
    const validationErrors = [];

    console.log('[DEBUG] Processing requirement files:', {
      totalFiles: Object.keys(req.files || {}).length,
      fileKeys: Object.keys(req.files || {}),
      requirements: requirements.map(r => ({ id: r.requirement_id, expectedKey: `requirement_${r.requirement_id}` }))
    });

    for (const reqItem of requirements) {
      const fileKey = `requirement_${reqItem.requirement_id}`;
      const file = req.files?.[fileKey];
      
      console.log(`[DEBUG] Processing requirement ${reqItem.requirement_id}:`, {
        fileKey,
        fileExists: !!file,
        fileName: file?.name,
        mimetype: file?.mimetype,
        size: file?.size
      });
      
      if (file) {
        if (!Object.keys(ALLOWED_MIME_TYPES).includes(file.mimetype)) {
          console.log(`[DEBUG] Requirement file MIME type rejected:`, {
            requirement_id: reqItem.requirement_id,
            received: file.mimetype,
            allowed: Object.keys(ALLOWED_MIME_TYPES)
          });
          validationErrors.push({
            requirement_id: reqItem.requirement_id,
            error: `Invalid file type. Allowed: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG`,
            debug: {
              received: file.mimetype,
              allowed: Object.keys(ALLOWED_MIME_TYPES)
            }
          });
          continue;
        }
        const ext = path.extname(file.name).toLowerCase();
        const allowedExts = ALLOWED_MIME_TYPES[file.mimetype];
        
        console.log(`[DEBUG] Requirement file extension check:`, {
          requirement_id: reqItem.requirement_id,
          extension: ext,
          mimetype: file.mimetype,
          allowedForMime: allowedExts
        });
        
        if (!allowedExts.includes(ext)) {
          validationErrors.push({
            requirement_id: reqItem.requirement_id,
            error: `File extension (${ext}) does not match its content type`,
            debug: {
              extension: ext,
              mimetype: file.mimetype,
              allowedExtensions: allowedExts
            }
          });
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          validationErrors.push({
            requirement_id: reqItem.requirement_id,
            error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
          });
          continue;
        }
        // Sanitize filename
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        file.sanitizedName = sanitizedName;
        requirementFiles[reqItem.requirement_id] = file;
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({ error: 'File validation failed', details: validationErrors });
    }

    // Generate secure filenames for requirements
    const requirementFilePaths = requirements.map(reqr => {
      const file = requirementFiles[reqr.requirement_id];
      if (file) {
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 8);
        const ext = path.extname(file.sanitizedName);
        const filename = `requirement-${timestamp}-${randomString}${ext}`;
        return {
          requirement_id: reqr.requirement_id,
          requirement_path: filename,
          original_name: file.name
        };
      }
      return {
        requirement_id: reqr.requirement_id,
        requirement_path: reqr.requirement_path
      };
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
      return res.status(500).json({ error: 'Failed to create organization application in database' });
    }

    if (!dbResult || !dbResult[0] || !dbResult[0].application_id) {
      console.error('Invalid database result:', dbResult);
      return res.status(500).json({ error: 'Failed to create organization application - invalid response' });
    }

    const appId = dbResult[0].application_id;

    // Create directory structure
    const appDir = path.join('/app/applications', String(appId));
    const logoDir = path.join(appDir, 'logo');
    const requirementsDir = path.join(appDir, 'requirements');

    try {
      [appDir, logoDir, requirementsDir].forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      });
    } catch (dirError) {
      console.error('Failed to create directories:', dirError);
      try { await organizationsModel.deleteApplication(appId); } catch (rollbackError) { console.error('Failed to rollback application:', rollbackError); }
      return res.status(500).json({ error: 'Failed to create application directories' });
    }

    // File write operations
    const fileWriteErrors = [];

    try {
      const logoPath = path.join(logoDir, logoFilename);
      fs.writeFileSync(logoPath, logoFile.data);
    } catch (fileErr) {
      console.error('Failed to write logo file:', fileErr);
      fileWriteErrors.push({ file: 'logo', error: fileErr.message });
    }

    for (const reqPath of requirementFilePaths) {
      const file = requirementFiles[reqPath.requirement_id];
      if (file) {
        try {
          const filePath = path.join(requirementsDir, reqPath.requirement_path);
          fs.writeFileSync(filePath, file.data);
        } catch (fileErr) {
          console.error(`Failed to write requirement file (${reqPath.requirement_path}):`, fileErr);
          fileWriteErrors.push({ file: reqPath.requirement_path, requirement_id: reqPath.requirement_id, error: fileErr.message });
        }
      }
    }

    if (fileWriteErrors.length > 0) {
      try {
        if (fs.existsSync(appDir)) fs.rmSync(appDir, { recursive: true, force: true });
        await organizationsModel.deleteApplication(appId);
      } catch (cleanupError) {
        console.error('Failed to cleanup after file write errors:', cleanupError);
      }
      return res.status(500).json({ error: 'Failed to save some files', details: fileWriteErrors });
    }

    // Fetch complete application data
    let result;
    try {
      result = await organizationsModel.getApplication(appId);
      if (!result) throw new Error('Application created but could not be retrieved');
    } catch (fetchError) {
      console.error('Failed to fetch created application:', fetchError);
      return res.status(500).json({ error: 'Application created but could not retrieve details' });
    }

    // Publish to channel (CREATE)
    try {
      publishToChannel('organization-applications', {
        operation: 'CREATE',
        data: Array.isArray(result) ? result : [result],
        timestamp: new Date()
      });
    } catch (publishError) {
      console.error('Failed to publish to channel:', publishError);
    }

    // Initiate approval process (non-blocking for response)
    try {
      await organizationsModel.createApprovalChain(appId, user.email);
    } catch (approvalError) {
      console.error('Failed to initiate approval process:', approvalError);
    }

    // Response payload
    const responseData = {
      ...dbResult[0],
      logo_url: `/apps/applications/${appId}/logo/${logoFilename}`,
      requirement_files: requirementFilePaths.map(reqf => ({
        requirement_id: reqf.requirement_id,
        file_url: reqf.requirement_path ? `/apps/applications/${appId}/requirements/${reqf.requirement_path}` : null,
        original_name: reqf.original_name
      }))
    };

    res.status(201).json({
      message: 'Organization application submitted successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Unexpected error in createOrganizationApplication:', error);
    res.status(500).json({
      error: error.message || "An unexpected error occurred while creating the organization application."
    });
  }
}

async function getSpecificApplication(req, res) {
  try {
    const { org_name, app_id } = req.query;

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
    const { chain_id, comments, application_id, organization_id, appName } = req.body;
    const userEmail = req.user?.email; // Use EMAIL (approver_user_id is email format)
    
    console.log('🔐 [E-SIG] Approving application:', { chain_id, application_id, userEmail, has_comments: !!comments });
    
    if (!userEmail) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const approvalRow = await organizationsModel.approveApplication(
      chain_id,
      comments,
      organization_id,
      application_id,
      userEmail  // Pass user EMAIL for e-signature workflow
    );
    const result = approvalRow[0]?.result;

    // Get the updated approval timeline after the approval
    const updatedTimeline = await organizationsModel.GetApprovalTimeline(appName, application_id);
    
    // Publish the complete updated timeline
    publishToChannel(`application_approval_timeline_${appName}_${application_id}`, {
      operation: 'UPDATE',
      data: Array.isArray(updatedTimeline) ? updatedTimeline : [updatedTimeline],
      timestamp: new Date()
    });

    console.log('🔍 [RT-DEBUG] Checking if organization is fully approved:', {
      currentStep: result.application.step,
      lastStep: result?.other.last_step,
      isFullyApproved: result.application.step === result?.other.last_step,
      result: result
    });

    if (result.application.step === result?.other.last_step) {
      console.log('🎉 [RT-DEBUG] Organization is FULLY APPROVED - triggering notifications!');
      
      const update_data = await organizationsModel.getUpdateApplication(application_id);
      publishToChannel('organization-applications', {
        operation: 'UPDATE',
        data: Array.isArray(update_data) ? update_data : [update_data],
        timestamp: new Date()
      });

      // 🆕 REAL-TIME: Notify organization members of approval
      try {
        console.log('🔍 [RT-DEBUG] Starting organization approval notification process...');
        const officers = await organizationsModel.getApplicationOfficers(application_id);
        console.log('🔍 [RT-DEBUG] Retrieved officers:', {
          officersFound: officers ? officers.length : 0,
          officers: officers ? officers.map(o => ({ email: o.email, name: `${o.f_name} ${o.l_name}` })) : 'none'
        });
        
        if (officers && officers.length > 0) {
          const memberEmails = officers.map(officer => officer.email).filter(email => email && email.includes('@'));
          const organizationName = result?.organization?.name || result?.other?.organization_name || 'Organization';
          const orgId = result?.organization?.id || organization_id;
          
          console.log('🎉 [Real-time] Organization fully approved - preparing notifications:', {
            organizationId: orgId,
            organizationName,
            totalOfficers: officers.length,
            validEmails: memberEmails.length,
            memberEmails: memberEmails,
            resultData: {
              organization: result?.organization,
              other: result?.other,
              providedOrgId: organization_id
            }
          });

          // 🆕 Add immediate debug logging before delay
          console.log('🔄 [RT-DEBUG] About to call notifyOrganizationApproved with:', {
            orgId,
            organizationName,
            memberEmails,
            functionExists: typeof notifyOrganizationApproved === 'function'
          });
          
          // 🕒 Enhanced delay with better error handling and logging
          setTimeout(async () => {
            try {
              console.log('🕒 [RT-DEBUG] Delay completed, sending organization approval notifications...');
              
              // 🔍 Debug: Log the complete result structure to identify correct field names
              console.log('🔍 [RT-DEBUG] Available result fields:', {
                organizationFields: result?.organization ? Object.keys(result.organization) : 'null',
                otherFields: result?.other ? Object.keys(result.other) : 'null',
                organizationSample: result?.organization,
                otherSample: result?.other
              });
              
              // 🎯 Pass complete organization data instead of just ID and name
              const completeOrgData = {
                organization_id: orgId,
                organization_version_id: result?.organization?.current_org_version_id || result?.other?.current_org_version_id,
                name: organizationName,
                description: result?.organization?.description,
                status: result?.organization?.status || 'Active',
                ...result?.organization // Include all organization fields
              };
              
              console.log('🔍 [RT-DEBUG] Complete organization data for notification:', completeOrgData);
              console.log('🚀 [RT-DEBUG] Calling notifyOrganizationApproved NOW!');
              
              const notificationResult = await notifyOrganizationApproved(completeOrgData, memberEmails);
              console.log('✅ [RT-DEBUG] Organization approval notifications sent successfully:', notificationResult);
              
              // 📧 Send organization approval email
              try {
                const emailService = require('../../services/emailService');
                const presidentOfficer = officers.find(o => o.rank_name && o.rank_name.toLowerCase().includes('president'));
                const recipientEmail = presidentOfficer ? presidentOfficer.email : memberEmails[0];
                
                // Get adviser email from organization data
                let adviserEmail = null;
                if (result?.organization?.adviser_id) {
                  try {
                    const userModel = require('../models/userModel');
                    const adviserUser = await userModel.getUserById(result.organization.adviser_id);
                    adviserEmail = adviserUser?.email;
                    console.log(`📧 Found adviser email: ${adviserEmail}`);
                  } catch (adviserError) {
                    console.warn('⚠️ Could not fetch adviser email:', adviserError.message);
                  }
                }
                
                const emailDetails = {
                  name: organizationName,
                  application_id: application_id,
                  approved_date: new Date().toISOString(),
                  organization_id: orgId,
                  cycle_number: result?.other?.cycle_number,
                  adviser_email: adviserEmail // ✅ Include adviser
                };
                
                const emailResult = await emailService.sendOrganizationApprovalEmail(recipientEmail, emailDetails);
                if (emailResult.success) {
                  console.log(`✅ Organization approval email sent to ${recipientEmail}${adviserEmail ? ` and adviser ${adviserEmail}` : ''}`);
                } else {
                  console.warn(`⚠️ Failed to send organization approval email: ${emailResult.error || emailResult.message}`);
                }
              } catch (emailError) {
                console.error('❌ Error sending organization approval email:', emailError.message);
              }
              
            } catch (delayedNotificationError) {
              console.error('❌ [Real-time] Failed to send delayed organization approval notifications:', {
                error: delayedNotificationError.message,
                stack: delayedNotificationError.stack,
                orgId,
                organizationName,
                memberEmails
              });
            }
          }, 1000); // 1 second delay to ensure database consistency
        } else {
          console.warn('⚠️ [RT-DEBUG] No officers found for organization approval notification');
        }
      } catch (notificationError) {
        console.error('❌ [Real-time] Failed to prepare organization approval notifications:', {
          error: notificationError.message,
          stack: notificationError.stack,
          application_id,
          organization_id
        });
      }

      // Send invitation emails to all officers (best-effort)
      try {
        const emailService = require('../../services/emailService');
        const msal = require('@azure/msal-node');
        const officers = await organizationsModel.getApplicationOfficers(application_id);

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
              } catch (emailError) {
                console.error(`Failed to send email to ${officer.email}:`, emailError);
              }
            }
          }
        }
      } catch (emailError) {
        console.error('Error sending invitation emails:', emailError);
      }

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
          if (!fs.existsSync(destLogoDir)) fs.mkdirSync(destLogoDir, { recursive: true });
          fs.copyFileSync(srcLogoPath, destLogoPath);
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
    console.error('Approval error:', error);
    res.status(500).json({
      error: error.message || "An error occurred while approving the application.",
    });
  }
}

async function rejectApplication(req, res) {
  try {
    const { chain_id, comments, application_id, appName } = req.body;
    const approvalRow = await organizationsModel.rejectApplication(
      chain_id,
      comments,
      application_id
    );

    // Get the updated approval timeline after the rejection
    const updatedTimeline = await organizationsModel.GetApprovalTimeline(appName, application_id);

    // Publish the complete updated timeline
    publishToChannel(`application_approval_timeline_${appName}_${application_id}`, {
      operation: 'UPDATE',
      data: Array.isArray(updatedTimeline) ? updatedTimeline : [updatedTimeline],
      timestamp: new Date()
    });

    // 📧 Send organization rejection email
    try {
      const emailService = require('../../services/emailService');
      const officers = await organizationsModel.getApplicationOfficers(application_id);
      
      if (officers && officers.length > 0) {
        const presidentOfficer = officers.find(o => o.rank_name && o.rank_name.toLowerCase().includes('president'));
        const recipientEmail = presidentOfficer ? presidentOfficer.email : officers[0].email;
        
        // Get application details for email
        const applicationDetails = await organizationsModel.getSpecificApplication(null, null, application_id);
        const orgName = applicationDetails?.[0]?.organization_name || appName;
        
        // Get adviser email if available
        let adviserEmail = null;
        if (applicationDetails?.[0]?.adviser_id) {
          try {
            const userModel = require('../models/userModel');
            const adviserUser = await userModel.getUserById(applicationDetails[0].adviser_id);
            adviserEmail = adviserUser?.email;
            console.log(`📧 Found adviser email: ${adviserEmail}`);
          } catch (adviserError) {
            console.warn('⚠️ Could not fetch adviser email:', adviserError.message);
          }
        }
        
        const rejectionDetails = {
          name: orgName,
          application_id: application_id,
          reason: comments || 'Your application requires revisions before it can be approved.',
          rejector_name: req.user?.name || req.user?.email,
          rejected_date: new Date().toISOString(),
          adviser_email: adviserEmail // ✅ Include adviser
        };
        
        const emailResult = await emailService.sendOrganizationRejectionEmail(recipientEmail, rejectionDetails);
        if (emailResult.success) {
          console.log(`✅ Organization rejection email sent to ${recipientEmail}${adviserEmail ? ` and adviser ${adviserEmail}` : ''}`);
        } else {
          console.warn(`⚠️ Failed to send organization rejection email: ${emailResult.error || emailResult.message}`);
        }
      }
    } catch (emailError) {
      console.error('❌ Error sending organization rejection email:', emailError.message);
      // Don't fail the request if email fails
    }

    res.json({
      message: 'Application rejected successfully',
      approval: approvalRow
    });
  } catch (error) {
    console.error('Rejection error:', error);
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
  const { organization_id, organization_version_id, logo_name } = req.query;
  try {
    res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.setHeader('Content-Disposition', `inline; filename="${logo_name}"`);
    res.setHeader('X-Accel-Redirect', `/protected-organization-requirements/${organization_id}/${organization_version_id}/logo/${logo_name}`);
    res.end();
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while fetching the logo.",
    });
  }
}

async function getOrganizationLogoApplication(req, res){
  const {app_id, logo_name, org_name } = req.query;
  try {
    res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.setHeader('Content-Disposition', `inline; filename="${org_name}_logo"`);
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
    if (sessionId) subscribeToChannel(sessionId, 'organization-applications');
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
    let emailList = emails;
    if (Array.isArray(emails) && emails.length === 1 && Array.isArray(emails[0])) {
      emailList = emails[0];
    }
    if (!Array.isArray(emailList)) {
      return res.status(400).json({ message: 'Emails must be an array' });
    }
    const jsonEmails = JSON.stringify(emailList);
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
    console.log('[archiveOrganization] Received:', JSON.stringify(req.body, null, 2));

    const { organization_id, reason, user_email } = req.body;
    if (!organization_id) return res.status(400).json({ message: 'Organization ID is required.' });
    if (!reason || reason.trim().length < 3) return res.status(400).json({ message: 'Archive reason is required.' });

    const emailToUse = user_email || req.user?.email;
    const user = await organizationsModel.getUserByEmail(emailToUse);
    if (!user || !user.user_id) return res.status(404).json({ message: 'User not found.' });

    const result = await organizationsModel.archiveOrganization(organization_id, user.user_id, reason.trim());

    const channels = [
      'organizations_all',
      `organizations_Program Chair_${result?.base_program_id || ''}`,
      `organizations_Adviser_${result?.name || ''}`,
      `organizations_Student_${result?.name || ''}`
    ];
    channels.forEach(channel => {
        publishToChannel(channel, {
            operation: 'ARCHIVE',
            data: {
            organization_id,
            archived_by: user.user_id,
            archived_reason: reason.trim()
            },
            timestamp: Date.now()
        });
        });

    res.status(200).json({ message: 'Organization archived successfully.', result });
  } catch (error) {
    console.error('[archiveOrganization] Error:', error);
    res.status(500).json({
      error: error.message || error.sqlMessage || "An error occurred while archiving the organization.",
    });
  }
}

async function unarchiveOrganization(req, res) {
  try {
    console.log('[unarchiveOrganization] Received:', JSON.stringify(req.body, null, 2));

    const { organization_id, reason, user_email } = req.body;
    if (!organization_id) return res.status(400).json({ message: 'Organization ID is required.' });

    const emailToUse = user_email || req.user?.email;
    const user = await organizationsModel.getUserByEmail(emailToUse);
    if (!user || !user.user_id) return res.status(404).json({ message: 'User not found.' });

    const result = await organizationsModel.unarchiveOrganization(organization_id, user.user_id, reason ? reason.trim() : null);

    const channels = [
      'organizations_all',
      `organizations_Program Chair_${result?.base_program_id || ''}`,
      `organizations_Adviser_${result?.name || ''}`,
      `organizations_Student_${result?.name || ''}`
    ];
    channels.forEach(channel => {
        publishToChannel(channel, {
            operation: 'UNARCHIVE',
            data: {
            organization_id,
            unarchived_by: user.user_id,
            unarchived_reason: reason || null
            },
            timestamp: Date.now()
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
    if (!status) return res.status(400).json({ error: "Status is required." });
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
    if (!org_name) return res.status(400).json({ message: 'org_name is required.' });
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
    let organization_version_id = parseInt(req.query.organization_version_id);  

    if (!organization_id && organization_version_id) {
      organization_id = await organizationsModel.getOrganizationIdById(organization_id, organization_version_id);
      if (!organization_id) {
        return res.status(404).json({ message: 'Organization not found.' });
      }
    }
    if (!organization_id) return res.status(400).json({ message: 'organization_id or org_name is required.' });

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

    if (!organization_id && org_name) {
      organization_id = await organizationsModel.getOrganizationIdByName(org_name);
      if (!organization_id) {
        return res.status(404).json({ message: 'Organization not found.' });
      }
    }
    if (!organization_id) return res.status(400).json({ message: 'organization_id or org_name is required.' });

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

    // Publish updated officers list for real-time updates (like Term Payments)
    try {
      const updatedOfficers = await organizationsModel.getOrganizationOfficers(orgId, orgVersionId);
      const officersArray = Array.isArray(updatedOfficers) ? updatedOfficers : [];
      publishToChannel(`organization_officers_${orgId}_${orgVersionId}`, officersArray);
      console.log(`Published updated officers list to SSE channel: ${officersArray.length} officers`);
    } catch (publishError) {
      console.error('Failed to publish officer updates:', publishError);
    }

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

    // Publish updated officers list for real-time updates (like Term Payments)
    try {
      const updatedOfficers = await organizationsModel.getOrganizationOfficers(orgId, orgVersionId);
      const officersArray = Array.isArray(updatedOfficers) ? updatedOfficers : [];
      publishToChannel(`organization_officers_${orgId}_${orgVersionId}`, officersArray);
      console.log(`Published updated officers list to SSE channel: ${officersArray.length} officers`);
    } catch (publishError) {
      console.error('Failed to publish officer updates:', publishError);
    }

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

    // Publish updated officers list for real-time updates (like Term Payments)
    try {
      const updatedOfficers = await organizationsModel.getOrganizationOfficers(organization_id, orgVersionId);
      const officersArray = Array.isArray(updatedOfficers) ? updatedOfficers : [];
      publishToChannel(`organization_officers_${organization_id}_${orgVersionId}`, officersArray);
      console.log(`Published updated officers list to SSE channel: ${officersArray.length} officers`);
    } catch (publishError) {
      console.error('Failed to publish officer updates:', publishError);
    }

    res.status(200).json({ message: "Archive Successful" });
  } catch (error) {
    const sqlMessage = error.sqlMessage || error.message || 'An error occurred while archiving executive member.';
    res.status(400).json({ error: sqlMessage });
  }
}

async function getOrganizationCommittees(req, res) {
  return handleRealtimeEndpoint(
    req, 
    res, 
    organizationsModel.getOrganizationCommittees,
    'organization_committees'
  );
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

    // Publish updated committees list for real-time updates (like Term Payments)
    try {
      const updatedCommittees = await organizationsModel.getOrganizationCommittees(orgId, orgVersionId);
      const committeesArray = Array.isArray(updatedCommittees) ? updatedCommittees : [];
      publishToChannel(`organization_committees_${orgId}_${orgVersionId}`, committeesArray);
      console.log(`Published updated committees list to SSE channel: ${committeesArray.length} committees`);
    } catch (publishError) {
      console.error('Failed to publish committee updates:', publishError);
    }

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

    // Publish updated committees list for real-time updates
    try {
      const updatedCommittees = await organizationsModel.getOrganizationCommittees(orgId, orgVersionId);
      const committeesArray = Array.isArray(updatedCommittees) ? updatedCommittees : [];
      
      publishOrgHub({
        orgId,
        orgVersionId,
        entity: 'organization_committees',
        operation: 'UPDATE',
        data: committeesArray
      });
      
      console.log(`📝 [UPDATE-COMMITTEE] Published committees to hub - ${committeesArray.length} committees`);
    } catch (publishError) {
      console.error('❌ [UPDATE-COMMITTEE] Failed to publish committees:', publishError);
    }

    // Also publish updated committee members (their committee_name field needs to be updated)
    try {
      const updatedCommitteeMembers = await organizationsModel.getAllCommitteeMembers(orgId, orgVersionId);
      const committeeMembersArray = Array.isArray(updatedCommitteeMembers) ? updatedCommitteeMembers : [];
      
      publishOrgHub({
        orgId,
        orgVersionId,
        entity: 'organization_committeeMembers',
        operation: 'UPDATE',
        data: committeeMembersArray
      });
      
      console.log(`📝 [UPDATE-COMMITTEE] Published committee members to hub - ${committeeMembersArray.length} members`);
      console.log(`📝 [UPDATE-COMMITTEE] Sample:`, committeeMembersArray.slice(0, 2));
    } catch (publishError) {
      console.error('❌ [UPDATE-COMMITTEE] Failed to publish members:', publishError);
    }

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

    // Publish updated committees list for real-time updates
    try {
      const updatedCommittees = await organizationsModel.getOrganizationCommittees(orgId, orgVersionId);
      const committeesArray = Array.isArray(updatedCommittees) ? updatedCommittees : [];
      const channelName = `organization_committees_${orgId}_${orgVersionId}`;
      publishToChannel(channelName, committeesArray);
      console.log(`�️ [ARCHIVE-COMMITTEE] Published to ${channelName} - ${committeesArray.length} committees remaining`);
    } catch (publishError) {
      console.error('❌ [ARCHIVE-COMMITTEE] Failed to publish:', publishError);
    }

    res.status(200).json({
      message: 'Committee archived successfully.',
      committees_archived: result
    });
  } catch (error) {
    console.error('[archiveCommittee] Controller Error:', error);
    const sqlMessage = error.sqlMessage || error.message || 'An error occurred while archiving the committee.';
    res.status(400).json({ 
      error: sqlMessage,
      details: error.errno ? `Error Code: ${error.errno}` : undefined
    });
  }
}

async function getAllCommitteeMembers(req, res) {
  return handleRealtimeEndpoint(
    req, 
    res, 
    organizationsModel.getAllCommitteeMembers,
    'committee_members'
  );
}

async function addCommitteeMember(req, res) {
  try {
    const { committee_id, user_email, role, action_by_email, orgId, orgVersionId } = req.body;
    if (!action_by_email) return res.status(400).json({ error: 'action_by_email is required' });
    if (!user_email) return res.status(400).json({ error: 'user_email is required from frontend' });

    // Committee Head validation - check if committee already has a head
    if (role === 'Committee Head') {
      try {
        const existingCommitteeMembers = await organizationsModel.getAllCommitteeMembers(orgId, orgVersionId);
        const existingHead = existingCommitteeMembers.find(member => 
          member.committee_id === parseInt(committee_id) && 
          member.role === 'Committee Head' &&
          member.status !== 'Archived'
        );
        
        if (existingHead) {
          return res.status(400).json({ 
            error: `This committee already has a Committee Head: ${existingHead.f_name} ${existingHead.l_name} (${existingHead.email})` 
          });
        }
      } catch (validationError) {
        console.error('Committee Head validation error:', validationError);
        // Continue with the operation if validation check fails (fail-safe)
      }
    }

    const result = await organizationsModel.addCommitteeMember({
      committee_id,
      user_email,
      role,
      action_by_email
    });

    // cache best-effort (kept as-is)
    let emailUpdate = null;
    let emailSSuggestionOrganizationUpdate = null;
    if (result && result.length > 0 && result[0].organization_member_id) {
      try {
        emailUpdate = await organizationsModel.getSingleOrganizationMember(result[0].organization_member_id, orgId);
        emailSSuggestionOrganizationUpdate = await organizationsModel.GetSingleOrganizationUser(result[0].organization_member_id);
        if (emailSSuggestionOrganizationUpdate && emailSSuggestionOrganizationUpdate.length > 0) {
          await userCacheModel.cacheSingleOrganizationUser(orgId, orgVersionId, emailSSuggestionOrganizationUpdate[0]);
        }
      } catch (cacheError) {
        console.warn('[addCommitteeMember] Cache update failed:', cacheError.message);
      }
    }

    // 🔄 SNAPSHOT UPDATE: Refresh both members and committee members lists
    // When a member is added to a committee, they move from members to committeeMembers
    try {
      // Update members list (member is now removed from query since they're in a committee)
      const updatedMembers = await organizationsModel.getOrganizationMembers(orgId, orgVersionId);
      publishOrgHub({
        orgId: orgId,
        orgVersionId: orgVersionId,
        entity: 'organization_members',
        operation: 'UPDATE',
        data: Array.isArray(updatedMembers) ? updatedMembers : []
      });
      
      // Update committee members list (new member added)
      const updatedCommitteeMembers = await organizationsModel.getAllCommitteeMembers(orgId, orgVersionId);
      publishOrgHub({
        orgId: orgId,
        orgVersionId: orgVersionId,
        entity: 'organization_committeeMembers',
        operation: 'UPDATE',
        data: Array.isArray(updatedCommitteeMembers) ? updatedCommitteeMembers : []
      });
      
      console.log(`📡 [COMMITTEE-MEMBER-ADD] Published snapshot updates - ${updatedMembers.length} members, ${updatedCommitteeMembers.length} committee members`);
    } catch (publishError) {
      console.error('❌ [COMMITTEE-MEMBER-ADD] Failed to publish updates:', publishError);
    }

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
    const { committee_member_id, new_role, orgId, orgVersionId } = req.body;
    const action_by_email = req.user.email;

    // Committee Head validation - check if changing to Committee Head and another head exists
    if (new_role === 'Committee Head') {
      try {
        const existingCommitteeMembers = await organizationsModel.getAllCommitteeMembers(orgId, orgVersionId);
        
        // Find the member being updated to get their committee_id
        const memberBeingUpdated = existingCommitteeMembers.find(member => 
          member.id === parseInt(committee_member_id)
        );
        
        if (memberBeingUpdated) {
          const existingHead = existingCommitteeMembers.find(member => 
            member.committee_id === memberBeingUpdated.committee_id && 
            member.role === 'Committee Head' &&
            member.status !== 'Archived' &&
            member.id !== parseInt(committee_member_id) // Exclude the member being updated
          );
          
          if (existingHead) {
            return res.status(400).json({ 
              error: `This committee already has a Committee Head: ${existingHead.f_name} ${existingHead.l_name} (${existingHead.email})` 
            });
          }
        }
      } catch (validationError) {
        console.error('Committee Head validation error:', validationError);
        // Continue with the operation if validation check fails (fail-safe)
      }
    }

    const result = await organizationsModel.updateCommitteeMember({
      committee_member_id,
      new_role,
      action_by_email
    });

    // Publish updated committee members list for real-time updates (like Term Payments)
    try {
      const updatedCommitteeMembers = await organizationsModel.getAllCommitteeMembers(orgId, orgVersionId);
      const committeeMembersArray = Array.isArray(updatedCommitteeMembers) ? updatedCommitteeMembers : [];
      publishToChannel(`organization_committeeMembers_${orgId}_${orgVersionId}`, committeeMembersArray);
      console.log(`Published updated committee members list to SSE channel: ${committeeMembersArray.length} committee members`);
    } catch (publishError) {
      console.error('Failed to publish committee member updates:', publishError);
    }

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

    console.log(`🟢 [ARCHIVE-MEMBER-START] Request received:`, {
      committee_member_id,
      orgId,
      orgVersionId,
      reason: reason?.substring(0, 50)
    });

    const result = await organizationsModel.archiveCommitteeMember({
      committee_member_id,
      reason,
      action_by_email
    });

    console.log(`🟢 [ARCHIVE-MEMBER-DB] Database operation complete:`, {
      rows_archived: result
    });

    // Publish updated committee members list for real-time updates
    try {
      const updatedCommitteeMembers = await organizationsModel.getAllCommitteeMembers(orgId, orgVersionId);
      const committeeMembersArray = Array.isArray(updatedCommitteeMembers) ? updatedCommitteeMembers : [];
      
      console.log(`🟢 [ARCHIVE-MEMBER-FETCH] Fetched ${committeeMembersArray.length} remaining members from DB`);
      console.log(`🟢 [ARCHIVE-MEMBER-DATA] First 2 members:`, committeeMembersArray.slice(0, 2));
      
      publishOrgHub({
        orgId,
        orgVersionId,
        entity: 'organization_committeeMembers',
        operation: 'UPDATE',
        data: committeeMembersArray
      });
      
      console.log(`🗑️ [ARCHIVE-MEMBER] Published to hub - ${committeeMembersArray.length} members remaining`);
      console.log(`🗑️ [ARCHIVE-MEMBER] Archived ID: ${committee_member_id}`);
      console.log(`🗑️ [ARCHIVE-MEMBER] Hub channel: orghub_${orgId}_${orgVersionId}`);
      console.log(`🗑️ [ARCHIVE-MEMBER] Entity channel: organization_committeeMembers_${orgId}_${orgVersionId}`);
      
      // Also publish updated archived members list for archive tab
      const archivedMembers = await organizationsModel.getArchivedOrganizationMembers(orgId, orgVersionId);
      const archivedMembersArray = Array.isArray(archivedMembers) ? archivedMembers : [];
      
      console.log(`🗑️ [ARCHIVE-MEMBER-FETCH] Fetched ${archivedMembersArray.length} archived members from DB`);
      
      publishOrgHub({
        orgId,
        orgVersionId,
        entity: 'organization_archivedMembers',
        operation: 'UPDATE',
        data: archivedMembersArray
      });
      
      console.log(`🗑️ [ARCHIVE-MEMBER] Published archived members to hub - ${archivedMembersArray.length} archived members`);
      console.log(`🗑️ [ARCHIVE-MEMBER] Archived entity channel: organization_archivedMembers_${orgId}_${orgVersionId}`);
    } catch (publishError) {
      console.error('❌ [ARCHIVE-MEMBER] Failed to publish:', publishError);
      console.error('❌ [ARCHIVE-MEMBER] Stack trace:', publishError.stack);
    }

    res.status(200).json({
      message: 'Committee member archived successfully.',
      rows_archived: result
    });
  } catch (error) {
    console.error('[archiveCommitteeMember] Controller Error:', error);
    const sqlMessage = error.sqlMessage || error.message || 'An error occurred while archiving committee member.';
    res.status(400).json({ 
      error: sqlMessage,
      details: error.errno ? `Error Code: ${error.errno}` : undefined
    });
  }
}

async function getPendingOrganizationMembers(req, res) {
  return handleRealtimeEndpoint(req, res, organizationsModel.getPendingOrganizationMembers, 'pending_organization_members');
}

async function approveMembershipApplication(req, res) {
  try {
    const { application_id, remarks, organization_id, organization_version_id } = req.body;
    const reviewer_email = req.user.email;
    if (!application_id) return res.status(400).json({ error: "application_id is required." });

    const result = await organizationsModel.processMembershipApproval(application_id, reviewer_email, remarks || null);
    const approvedApplication = result.approvedApplication?.[0] || null;
    const completedTransaction = result.completedTransaction?.[0] || null;
    const newMember = result.newMember?.[0] || null;
    const archivedMembers = result.archivedMembers || null;

    // Remove from pending members list
    if (approvedApplication) {
      try {
        const updatedPendingMembers = await organizationsModel.getPendingOrganizationMembers(organization_id, organization_version_id);
        const pendingMembersArray = Array.isArray(updatedPendingMembers) ? updatedPendingMembers : [];
        
        publishOrgHub({
          orgId: organization_id,
          orgVersionId: organization_version_id,
          entity: 'organization_pendingMembers',
          operation: 'UPDATE',
          data: pendingMembersArray
        });
        
        console.log(`📡 [PENDING-MEMBERS] Published to hub - ${pendingMembersArray.length} pending members`);
      } catch (publishError) {
        console.error('❌ [PENDING-MEMBERS] Failed to publish:', publishError);
      }
    }

    // transactions (UPDATE)
    if (completedTransaction) {
      publishToChannel('transactions', { operation: 'UPDATE', data: [completedTransaction], timestamp: new Date() });
      if (completedTransaction.transaction_id) {
        publishToChannel(`transactions:${completedTransaction.transaction_id}`, { operation: 'UPDATE', data: [completedTransaction], timestamp: new Date() });
      }
    }

    // Add to members list
    if (newMember) {
      try {
        const updatedMembers = await organizationsModel.getOrganizationMembers(organization_id, organization_version_id);
        const membersArray = Array.isArray(updatedMembers) ? updatedMembers : [];
        publishToChannel(`organization_members_${organization_id}_${organization_version_id}`, membersArray);
        console.log(`Published updated members list to SSE channel: ${membersArray.length} members`);
        
        // 🆕 REAL-TIME: Notify user of membership approval
        try {
          const organizationData = await organizationsModel.getOrganizationDetails(organization_id, organization_version_id);
          const organizationName = organizationData?.name || organizationData?.organization_name || 'Organization';
          const userEmail = newMember.email || approvedApplication?.email;
          const userRole = newMember.role || 'Member';
          
          if (userEmail && userEmail.includes('@')) {
            console.log('👤 [Real-time] Member approved - sending notification:', {
              userEmail,
              organizationId: organization_id,
              organizationName,
              role: userRole
            });
            
            await notifyMembershipGranted(userEmail, organization_id, organizationName, userRole);
          }
        } catch (notificationError) {
          console.error('❌ [Real-time] Failed to send membership granted notification:', notificationError);
        }
        
      } catch (publishError) {
        console.error('Failed to publish member updates:', publishError);
      }
    }

    // Remove from archived members list (reactivation)
    if (archivedMembers && archivedMembers.length > 0) {
      try {
        const updatedArchivedMembers = await organizationsModel.getArchivedOrganizationMembers(organization_id, organization_version_id);
        const archivedMembersArray = Array.isArray(updatedArchivedMembers) ? updatedArchivedMembers : [];
        publishToChannel(`organization_archivedMembers_${organization_id}_${organization_version_id}`, archivedMembersArray);
        console.log(`Published updated archived members list to SSE channel: ${archivedMembersArray.length} archived members`);
      } catch (publishError) {
        console.error('Failed to publish archived member updates:', publishError);
      }
    }

    res.json({ 
      message: 'Membership application approved successfully.',
      approval: approvedApplication ? [approvedApplication] : [],
      transaction: completedTransaction ? [completedTransaction] : [],
      member: newMember ? [newMember] : [],
      archivedMembers: archivedMembers || []
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while approving the membership application.",
    });
  }
}

async function rejectMembershipApplication(req, res) {
  try {
    const { application_id, remarks, organization_id, organization_version_id } = req.body;
    const reviewer_email = req.user.email;
    if (!application_id) return res.status(400).json({ error: "application_id is required." });
    if (!organization_id || !organization_version_id) {
      return res.status(400).json({ error: "organization_id and organization_version_id are required." });
    }

    const result = await organizationsModel.processMembershipRejection(application_id, reviewer_email, remarks || null);
    const rejectedApplication = result.rejectedApplication?.[0] || null;
    const failedTransaction = result.failedTransaction?.[0] || null;

    // Remove rejected application from pending members list (DELETE operation)
    if (rejectedApplication) {
      try {
        publishToChannel(`organization_pendingMembers_${organization_id}_${organization_version_id}`, {
          operation: 'DELETE',
          data: rejectedApplication,
          timestamp: new Date()
        });
        
        console.log(`📡 [PENDING-MEMBERS-REJECTION] Published DELETE to hub - removed application_id: ${rejectedApplication.application_id}`);
      } catch (publishError) {
        console.error('❌ [PENDING-MEMBERS-REJECTION] Failed to publish:', publishError);
      }
    }
    if (failedTransaction) {
      publishToChannel('transactions', { operation: 'UPDATE', data: [failedTransaction], timestamp: new Date() });
      if (failedTransaction.transaction_id) {
        publishToChannel(`transaction_${failedTransaction.transaction_id}`, { operation: 'UPDATE', data: [failedTransaction], timestamp: new Date() });
      }
    }

    res.json({ 
      message: 'Membership application rejected successfully.',
      rejection: rejectedApplication ? [rejectedApplication] : [],
      transaction: failedTransaction ? [failedTransaction] : []
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while rejecting the membership application.",
    });
  }
}

async function approveLeaveApplication(req, res) {
  try {
    const { leave_application_id, organization_id, organization_version_id, remarks } = req.body;
    const reviewer_email = req.user.email;
    if (!leave_application_id || !organization_id || !organization_version_id) {
      return res.status(400).json({ error: "leave_application_id, organization_id, and organization_version_id are required." });
    }

    const result = await organizationsModel.approveLeaveApplication(
      leave_application_id, 
      organization_id, 
      organization_version_id, 
      reviewer_email, 
      remarks || null
    );
    const approvedApplication = result.approvedApplication?.[0] || null;
    const archivedMembers = result.archivedMembers || null;

    if (approvedApplication) {
      // Delete approved application from leave applications list
      try {
        publishToChannel(`organization_leaveApplications_${organization_id}_${organization_version_id}`, {
          operation: 'DELETE',
          data: [approvedApplication],
          timestamp: new Date()
        });
        
        console.log(`📡 [LEAVE-APPS] Published DELETE to channel - removed 1 approved application (ID: ${approvedApplication.id})`);
      } catch (publishError) {
        console.error('❌ [LEAVE-APPS] Failed to publish:', publishError);
      }
      
      // Update members list (remove member who left)
      try {
        const updatedMembers = await organizationsModel.getOrganizationMembers(organization_id, organization_version_id);
        const membersArray = Array.isArray(updatedMembers) ? updatedMembers : [];
        publishToChannel(`organization_members_${organization_id}_${organization_version_id}`, membersArray);
        console.log(`Published updated members list to SSE channel: ${membersArray.length} members`);
      } catch (publishError) {
        console.error('Failed to publish member updates:', publishError);
      }
    }
    if (archivedMembers && archivedMembers.length > 0) {
      // Update archived members list (add member who left)
      try {
        const updatedArchivedMembers = await organizationsModel.getArchivedOrganizationMembers(organization_id, organization_version_id);
        const archivedMembersArray = Array.isArray(updatedArchivedMembers) ? updatedArchivedMembers : [];
        publishToChannel(`organization_archivedMembers_${organization_id}_${organization_version_id}`, archivedMembersArray);
        console.log(`Published updated archived members list to SSE channel: ${archivedMembersArray.length} archived members`);
      } catch (publishError) {
        console.error('Failed to publish archived member updates:', publishError);
      }
    }

    res.json({ 
      message: 'Leave application approved successfully.',
      approvedApplication: approvedApplication ? [approvedApplication] : [],
      archivedMembers: archivedMembers || []
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while approving the leave application.",
    });
  }
}

async function rejectLeaveApplication(req, res) {
  try {
    const { leave_application_id, organization_id, organization_version_id, remarks } = req.body;
    const reviewer_email = req.user.email;
    if (!leave_application_id || !organization_id || !organization_version_id) {
      return res.status(400).json({ error: "leave_application_id, organization_id, and organization_version_id are required." });
    }

    const rejectedApplication = await organizationsModel.rejectLeaveApplication(
      leave_application_id, 
      organization_id, 
      organization_version_id, 
      reviewer_email, 
      remarks || null
    );

    if (rejectedApplication && rejectedApplication.length > 0) {
      // Delete rejected application from leave applications list
      try {
        publishToChannel(`organization_leaveApplications_${organization_id}_${organization_version_id}`, {
          operation: 'DELETE',
          data: rejectedApplication,
          timestamp: new Date()
        });
        
        console.log(`📡 [LEAVE-APPS] Published DELETE to channel - removed 1 rejected application (ID: ${rejectedApplication[0]?.id})`);
      } catch (publishError) {
        console.error('❌ [LEAVE-APPS] Failed to publish:', publishError);
      }
    }

    res.json({ 
      message: 'Leave application rejected successfully.',
      rejectedApplication: rejectedApplication || []
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while rejecting the leave application.",
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

    if (orgId && orgVersionId) {
      await userCacheModel.cacheSingleOrganizationUser(orgId, orgVersionId, emailSUggestionOrganizationUpdate[0]);
    } else {
      await userCacheModel.cacheSingleOrganizationUser(orgName, emailSUggestionOrganizationUpdate[0]); // backward compat
    }

    // Publish updated members list for real-time updates (like Term Payments)
    if (orgId && orgVersionId) {
      try {
        const updatedMembers = await organizationsModel.getOrganizationMembers(orgId, orgVersionId);
        const membersArray = Array.isArray(updatedMembers) ? updatedMembers : [];
        publishToChannel(`organization_members_${orgId}_${orgVersionId}`, membersArray);
        console.log(`Published updated members list to SSE channel: ${membersArray.length} members`);
      } catch (publishError) {
        console.error('Failed to publish member updates:', publishError);
      }
    } else {
      // Backward compatibility for old format
      publishToChannel(`organization_members_${orgName}`, {
        operation: 'CREATE',
        data: Array.isArray(result) ? result : [result],
        timestamp: new Date()
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
  return handleRealtimeEndpoint(req, res, organizationsModel.getArchivedOrganizationMembers, 'archived_organization_members');
}

async function archiveOrganizationMember(req, res) {
  try {
    const { member_id, reason, orgId, orgVersionId } = req.body;
    if (!member_id) return res.status(400).json({ error: "member_id is required." });
    const archived_by_email = req.user.email;
    
    // 🆕 REAL-TIME: Get member details before archiving for notification
    let memberEmail = null;
    let organizationName = null;
    try {
      if (orgId && orgVersionId) {
        const currentMembers = await organizationsModel.getOrganizationMembers(orgId, orgVersionId);
        const memberToArchive = currentMembers?.find(member => member.member_id == member_id);
        memberEmail = memberToArchive?.email;
        
        const organizationData = await organizationsModel.getOrganizationDetails(orgId, orgVersionId);
        organizationName = organizationData?.name || organizationData?.organization_name || 'Organization';
      }
    } catch (memberLookupError) {
      console.warn('⚠️ [Real-time] Could not get member details for notification:', memberLookupError.message);
    }
    
    const result = await organizationsModel.archiveOrganizationMember({ member_id, archived_by_email, reason, orgId, orgVersionId });

    // Publish updated members list for real-time updates
    try {
      const updatedMembers = await organizationsModel.getOrganizationMembers(orgId, orgVersionId);
      const membersArray = Array.isArray(updatedMembers) ? updatedMembers : [];
      publishToChannel(`organization_members_${orgId}_${orgVersionId}`, membersArray);
      console.log(`Published updated members list to SSE channel: ${membersArray.length} members`);
    } catch (publishError) {
      console.error('Failed to publish member updates:', publishError);
    }

    // Publish updated archived members list for real-time updates
    try {
      const updatedArchivedMembers = await organizationsModel.getArchivedOrganizationMembers(orgId, orgVersionId);
      const archivedMembersArray = Array.isArray(updatedArchivedMembers) ? updatedArchivedMembers : [];
      publishToChannel(`organization_archivedMembers_${orgId}_${orgVersionId}`, archivedMembersArray);
      console.log(`Published updated archived members list to SSE channel: ${archivedMembersArray.length} archived members`);
    } catch (publishError) {
      console.error('Failed to publish archived member updates:', publishError);
    }

    if (orgId && orgVersionId) {
      try {
        console.log('🚫 [Real-time] Member archived - sending revocation notification:', {
          memberEmail,
          organizationId: orgId,
          organizationName,
          reason
        });
        
        await notifyMembershipRevoked(memberEmail, orgId, organizationName, reason || 'Membership archived');
      } catch (notificationError) {
        console.error('❌ [Real-time] Failed to send membership revoked notification:', notificationError);
      }
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
    
    console.log('🔄 [UNARCHIVE DEBUG] Database operation result:', result);

    // Publish updated archived members list for real-time updates
    try {
      const updatedArchivedMembers = await organizationsModel.getArchivedOrganizationMembers(orgId, orgVersionId);
      const archivedMembersArray = Array.isArray(updatedArchivedMembers) ? updatedArchivedMembers : [];
      publishToChannel(`organization_archivedMembers_${orgId}_${orgVersionId}`, archivedMembersArray);
      console.log(`🔄 [UNARCHIVE DEBUG] Published updated archived members list to SSE channel: ${archivedMembersArray.length} archived members`);
      console.log('🔄 [UNARCHIVE DEBUG] Archived members data:', archivedMembersArray.map(m => ({ id: m.id, name: m.first_name + ' ' + m.last_name })));
    } catch (publishError) {
      console.error('Failed to publish archived member updates:', publishError);
    }

    // Publish updated members list for real-time updates
    try {
      const updatedMembers = await organizationsModel.getOrganizationMembers(orgId, orgVersionId);
      const membersArray = Array.isArray(updatedMembers) ? updatedMembers : [];
      publishToChannel(`organization_members_${orgId}_${orgVersionId}`, membersArray);
      console.log(`🔄 [UNARCHIVE DEBUG] Published updated members list to SSE channel: ${membersArray.length} members`);
      console.log('🔄 [UNARCHIVE DEBUG] Active members data:', membersArray.map(m => ({ id: m.id, name: m.first_name + ' ' + m.last_name })));
      
      // Check if the unarchived member is in the list
      const unarchivedMember = membersArray.find(m => m.id == member_id);
      if (unarchivedMember) {
        console.log('✅ [UNARCHIVE DEBUG] Unarchived member found in active members list:', unarchivedMember);
      } else {
        console.log('❌ [UNARCHIVE DEBUG] Unarchived member NOT found in active members list! member_id:', member_id);
      }
    } catch (publishError) {
      console.error('Failed to publish member updates:', publishError);
    }

    res.status(200).json({ message: 'Organization member unarchived successfully.' });
  } catch (error) {
    res.status(500).json({
      error: error.message || "An error occurred while unarchiving the organization member."
    });
  }
}

async function getApprovalTimeline(req, res) {
  try {
    const { sessionId, org_name, app_id } = req.query;
    
    if (!org_name || !app_id) {
      return res.status(400).json({ 
        error: 'org_name and app_id are required parameters' 
      });
    }

    const result = await organizationsModel.getApprovalChain(app_id);
    
    // Ensure consistent data structure
    let timelineData = [];
    if (Array.isArray(result)) {
      timelineData = result;
    } else if (result && Array.isArray(result.timeline)) {
      timelineData = result.timeline;
    } else if (result && typeof result === 'object') {
      timelineData = [result];
    }

    if (sessionId) {
      subscribeToChannel(sessionId, `application_approval_timeline_${org_name}_${app_id}`);
    }
    
    res.status(200).json(timelineData); // Return the processed array directly
  } catch (error) {
    console.error('GetApprovalTimeline error:', error);
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

// ----- Application Periods / Approvals (unchanged except for structure)
async function addApplicationPeriod(req, res) {
  try {
    const { start_date, end_date, start_time, end_time } = req.body;
    if (!start_date || !end_date || !start_time || !end_time) {
      return res.status(400).json({ error: "All fields (start_date, end_date, start_time, end_time) are required." });
    }
    const result = await organizationsModel.addApplicationPeriod(start_date, end_date, start_time, end_time, req.user.email);
    res.status(201).json({ success: true, message: "Application period created successfully.", data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "An error occurred while creating the application period." });
  }
}

async function updateApplicationPeriod(req, res) {
  try {
    const { start_date, end_date, start_time, end_time, period_id } = req.body;
    if (!start_date || !end_date || !start_time || !end_time || !period_id) {
      return res.status(400).json({ error: "All fields (start_date, end_date, start_time, end_time, period_id) are required." });
    }
    const result = await organizationsModel.updateApplicationPeriod(start_date, end_date, start_time, end_time, period_id, req.user.email);
    res.status(200).json({ success: true, message: "Application period updated successfully.", data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "An error occurred while updating the application period." });
  }
}

async function createApprovalChain(req, res) {
  try {
    const { application_id } = req.body;
    if (!application_id) return res.status(400).json({ error: "application_id is required." });
    const result = await organizationsModel.createApprovalChain(application_id, req.user.email);
    res.status(200).json({ success: true, message: "Approval chain created successfully.", data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "An error occurred while creating the approval chain." });
  }
}

// New e-signature approval chain controllers
async function uploadApprovalSignature(req, res) {
  try {
    const { chain_id, signature_path } = req.body;
    if (!chain_id || !signature_path) {
      return res.status(400).json({ error: "chain_id and signature_path are required." });
    }
    
    const result = await organizationsModel.uploadApprovalSignature(chain_id, signature_path);
    res.status(200).json({ 
      success: true, 
      message: "Signature uploaded successfully.", 
      data: result 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message || "An error occurred while uploading the signature." 
    });
  }
}

async function markApprovalAsReceived(req, res) {
  try {
    const { chain_id } = req.params;
    const { notes } = req.body;
    const userEmail = req.user?.email; // Use EMAIL (approver_user_id is email format)
    
    console.log('🔐 [RECEIVE+SIGN] Request:', { 
      chain_id, 
      userEmail,
      has_notes: !!notes
    });
    
    if (!chain_id) {
      return res.status(400).json({ error: "chain_id is required." });
    }
    
    if (!userEmail) {
      console.error('❌ [RECEIVE+SIGN] No user email in JWT!', req.user);
      return res.status(401).json({ error: "User not authenticated." });
    }
    
    const result = await organizationsModel.markApprovalAsReceived(chain_id, userEmail, notes);
    
    console.log('✅ [RECEIVE+SIGN] Success:', result);
    
    res.status(200).json({ 
      success: true, 
      message: "Approval received and signed successfully with e-signature.", 
      data: result 
    });
  } catch (error) {
    console.error('❌ [RECEIVE+SIGN] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || "An error occurred while receiving and signing approval." 
    });
  }
}

// Check if user has uploaded e-signature
async function checkUserESignature(req, res) {
  try {
    const userEmail = req.user?.email;
    
    if (!userEmail) {
      return res.status(401).json({ 
        success: false, 
        error: "User not authenticated." 
      });
    }
    
    console.log('🔍 [CHECK-ESIG] Checking e-signature for:', userEmail);
    
    const hasSignature = await organizationsModel.checkUserHasESignature(userEmail);
    
    console.log('🔍 [CHECK-ESIG] Result:', { userEmail, hasSignature });
    
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
      error: error.message || "An error occurred while checking e-signature." 
    });
  }
}

async function markApprovalAsSigned(req, res) {
  try {
    const { chain_id } = req.params;
    const { signature_path, notes } = req.body;
    const user_email = req.user.email;
    
    if (!chain_id || !signature_path) {
      return res.status(400).json({ error: "chain_id and signature_path are required." });
    }
    
    const result = await organizationsModel.markApprovalAsSigned(
      chain_id, 
      user_email, 
      signature_path, 
      notes
    );
    res.status(200).json({ 
      success: true, 
      message: "Approval marked as signed.", 
      data: result 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message || "An error occurred while marking approval as signed." 
    });
  }
}

// Check if user has e-signature for approval chain
async function checkUserSignature(req, res) {
  try {
    const { chain_id } = req.params;
    const user_email = req.user.email;
    
    if (!chain_id) {
      return res.status(400).json({ 
        success: false, 
        error: "chain_id is required." 
      });
    }
    
    const result = await organizationsModel.checkUserSignature(chain_id, user_email);
    res.status(200).json({ 
      success: true, 
      data: result 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message || "An error occurred while checking signature status." 
    });
  }
}

// Upload user e-signature with file handling
async function uploadUserSignatureFile(req, res) {
  try {
    const { chain_id } = req.params;
    const user_email = req.user.email;
    
    if (!chain_id) {
      return res.status(400).json({ 
        success: false, 
        error: "chain_id is required." 
      });
    }
    
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: "E-signature file is required." 
      });
    }
    
    // Validate file type (allow common image formats)
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid file type. Please upload a PNG, JPG, or GIF image." 
      });
    }
    
    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (req.file.size > maxSize) {
      return res.status(400).json({ 
        success: false, 
        error: "File size exceeds 2MB limit." 
      });
    }
    
    // The file path is stored by multer in req.file.path
    const signature_path = req.file.filename; // Just store the filename
    
    const result = await organizationsModel.uploadUserSignature(
      chain_id, 
      user_email, 
      signature_path
    );
    
    res.status(200).json({ 
      success: true, 
      message: "E-signature uploaded successfully.", 
      data: result 
    });
  } catch (error) {
    // Clean up uploaded file if database operation fails
    if (req.file && req.file.path) {
      const fs = require('fs').promises;
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message || "An error occurred while uploading e-signature." 
    });
  }
}

async function getApprovedOrganizationLogos(req, res) {
  try {
    const logos = await organizationsModel.getApprovedOrganizationLogos();
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
    if (!org_id) return res.status(400).json({ error: "org_id is required." });
    const result = await organizationsModel.checkOrgRenewalStatus(org_id);

    // subscribe (not publish) so client receives future pushes consistently
    if (sessionId) subscribeToChannel(sessionId, `organizations_renewal_status_${org_id}_${org_version_id}`);

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
    if (!organization_id) return res.status(400).json({ error: "organization_id is required." });
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

    if (!organization_id && org_name) {
      organization_id = await organizationsModel.getOrganizationIdByName(org_name);
      if (!organization_id) return res.status(404).json({ message: 'Organization not found.' });
    }
    if (!organization_id) return res.status(400).json({ message: 'organization_id or org_name is required.' });

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
    if (sessionId) subscribeToChannel(sessionId, 'organizations_all');
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
    
    if (sessionId) {
      // Subscribe to both old channel (backward compatibility) and new hub
      subscribeToChannel(sessionId, `committee_roles_${organization_id}_${organization_version_id}`);
      subscribeToChannel(sessionId, getOrgHubChannel(organization_id, organization_version_id));
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
      // Subscribe to both old channel (backward compatibility) and new hub
      subscribeToChannel(sessionId, `executives_${organization_id}_${organization_version_id}`);
      subscribeToChannel(sessionId, getOrgHubChannel(organization_id, organization_version_id));
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
}

async function updateCommitteePermissions(req, res) {
  try {
    const { committee_role_id, committee_id, role_type, permissions, organization_id, organization_version_id } = req.body;
    const targetCommitteeId = committee_role_id || committee_id;
    if (!targetCommitteeId || !role_type || !Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: committee_role_id (or committee_id), role_type, and permissions array'
      });
    }

    let dbRoleType;
    if (role_type.toLowerCase() === 'head') dbRoleType = 'Committee Head';
    else if (role_type.toLowerCase() === 'officer') dbRoleType = 'Committee Officer';
    else {
      return res.status(400).json({
        success: false,
        message: 'Invalid role_type. Must be "head" or "officer"'
      });
    }

    const result = await organizationsModel.updateCommitteePermissions(targetCommitteeId, dbRoleType, permissions);

    // Publish updated committee roles for real-time updates
    try {
      const updatedCommitteeRoles = await organizationsModel.getOrganizationCommitteeRoles(organization_id, organization_version_id);
      const committeeRolesArray = Array.isArray(updatedCommitteeRoles) ? updatedCommitteeRoles : [];
      publishToChannel(`committee_roles_${organization_id}_${organization_version_id}`, committeeRolesArray);
      console.log(`Published updated committee roles to SSE channel: ${committeeRolesArray.length} roles`);
    } catch (publishError) {
      console.error('Failed to publish committee roles updates:', publishError);
    }

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
    if (!executive_id || !Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: executive_id and permissions array'
      });
    }

    const result = await organizationsModel.updateExecutivePermissions(executive_id, permissions);
    let formattedResult;
    if (result && result.executive_roles) formattedResult = result.executive_roles;
    else if (result && result.updated_executive_role) formattedResult = [result.updated_executive_role];
    else if (Array.isArray(result)) formattedResult = result;
    else formattedResult = [result];

    // Publish updated executive roles for real-time updates  
    try {
      const updatedExecutiveRoles = await organizationsModel.getOrganizationExecutivesRoles(organization_id, organization_version_id);
      const executiveRolesArray = Array.isArray(updatedExecutiveRoles) ? updatedExecutiveRoles : [];
      publishToChannel(`executives_${organization_id}_${organization_version_id}`, executiveRolesArray);
      console.log(`Published updated executive roles to SSE channel: ${executiveRolesArray.length} roles`);
    } catch (publishError) {
      console.error('Failed to publish executive roles updates:', publishError);
    }

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
    const { organization_id, organization_version_id, sessionId } = req.query;
    const overrides = await organizationsModel.getMemberPermissionOverrides(organization_id, organization_version_id);
    
    if (sessionId) {
      // Subscribe to both old channel (backward compatibility) and new hub
      subscribeToChannel(sessionId, `member_permission_${organization_id}_${organization_version_id}`);
      subscribeToChannel(sessionId, getOrgHubChannel(organization_id, organization_version_id));
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

    if (!email || !Array.isArray(permissions) || !organization_id || !organization_version_id) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: email, permissions array, organization_id, and organization_version_id'
      });
    }
    for (const permission of permissions) {
      if (!permission.permission_name || typeof permission.is_allowed !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'Each permission must have permission_name and is_allowed (boolean) properties'
        });
      }
    }

    const result = await organizationsModel.addMemberPermissionOverride(
      email,
      permissions,
      parseInt(organization_id),
      parseInt(organization_version_id),
      action_by_email
    );

    // Publish to both old channel (backward compatibility) and new hub
    publishOrgHub({
      orgId: organization_id, 
      orgVersionId: organization_version_id,
      entity: 'member_permissions',
      operation: 'CREATE',
      data: result,
      legacyChannel: `member_permission_${organization_id}_${organization_version_id}`
    });

    res.json({
      success: true,
      message: 'Member permission overrides added successfully',
      data: result
    });

  } catch (error) {
    console.error('Error adding member permission override:', error);
    const errorMessage = error.sqlMessage || error.message;
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

    if (!member_id || !organization_id || !organization_version_id || !Array.isArray(permission_lists)) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: member_id, organization_id, organization_version_id, and permission_lists array'
      });
    }
    for (const permission of permission_lists) {
      if (!permission.permission_name || typeof permission.is_allowed !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'Each permission must have permission_name and is_allowed (boolean) properties'
        });
      }
    }

    const result = await organizationsModel.updateMemberPermissionOverride(
      parseInt(member_id),
      parseInt(organization_id),
      parseInt(organization_version_id),
      permission_lists,
      action_by_email
    );

    // Publish to both old channel (backward compatibility) and new hub
    publishOrgHub({
      orgId: organization_id, 
      orgVersionId: organization_version_id,
      entity: 'member_permissions',
      operation: 'UPDATE',
      data: result,
      legacyChannel: `member_permission_${organization_id}_${organization_version_id}`
    });

    res.json({
      success: true,
      message: 'Member permission overrides updated successfully',
      data: result
    });

  } catch (error) {
    console.error('Error updating member permission override:', error);
    const errorMessage = error.sqlMessage || error.message;
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

    if (!member_id || !organization_id || !organization_version_id) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: member_id, organization_id, and organization_version_id'
      });
    }

    const result = await organizationsModel.removeMemberPermissionOverride(
      parseInt(member_id),
      parseInt(organization_id),
      parseInt(organization_version_id),
      action_by_email
    );

    // Publish to both old channel (backward compatibility) and new hub
    publishOrgHub({
      orgId: organization_id, 
      orgVersionId: organization_version_id,
      entity: 'member_permissions',
      operation: 'DELETE',
      data: result,
      legacyChannel: `member_permission_${organization_id}_${organization_version_id}`
    });

    res.json({
      success: true,
      message: 'All member permission overrides removed successfully',
      data: result
    });

  } catch (error) {
    console.error('Error removing member permission override:', error);
    const errorMessage = error.sqlMessage || error.message;
    res.status(500).json({
      success: false,
      error: errorMessage || 'An error occurred while removing member permission overrides'
    });
  }
}

async function getLeaveApplications(req, res) {
  return handleRealtimeEndpoint(req, res, organizationsModel.getLeaveApplications, 'leave_applications');
}

/** ---------------- Membership Questions & Responses (REALTIME STANDARDIZED) ---------------- */

async function getMembershipQuestions(req, res) {
  try {
    const { organization_id, cycle_number, sessionId } = req.query;
    if (!organization_id || !cycle_number) {
      return res.status(400).json({ error: 'organization_id and cycle_number are required parameters' });
    }
    const questions = await organizationsModel.getMembershipQuestions(organization_id, cycle_number);
    if (sessionId) {
      const ch = `membership_questions_${organization_id}_${cycle_number}`;
      subscribeToChannel(sessionId, ch);
    }
    res.status(200).json(questions);
  } catch (error) {
    console.error('Error fetching membership questions:', error);
    res.status(500).json({
      error: error.message || 'An error occurred while fetching membership questions'
    });
  }
}

async function createMembershipQuestion(req, res) {
  try {
    const { organization_id, cycle_number, question_text, question_type = 'text', is_required = true, options } = req.body;
    if (!organization_id || !cycle_number || !question_text) {
      return res.status(400).json({ error: 'organization_id, cycle_number, and question_text are required' });
    }

    const result = await organizationsModel.createMembershipQuestion(
      organization_id, 
      cycle_number, 
      question_text, 
      question_type, 
      is_required, 
      options
    );

    publishToChannel(`membership_questions_${organization_id}_${cycle_number}`, {
      operation: 'CREATE',
      data: Array.isArray(result) ? result : [result],
      timestamp: new Date()
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating membership question:', error);
    res.status(500).json({
      error: error.message || 'An error occurred while creating membership question'
    });
  }
}

async function updateMembershipQuestion(req, res) {
  try {
    const { question_id, question_text, question_type, is_required, options, organization_id, cycle_number } = req.body;
    if (!question_id || !question_text) {
      return res.status(400).json({ error: 'question_id and question_text are required' });
    }

    const result = await organizationsModel.updateMembershipQuestion(
      question_id, 
      question_text, 
      question_type, 
      is_required, 
      options
    );

    if (!result?.success) {
      return res.status(404).json({ error: 'Membership question not found or could not be updated' });
    }

    // Push an UPDATE with at least the question id to match rows on client
    publishToChannel(`membership_questions_${organization_id}_${cycle_number}`, {
      operation: 'UPDATE',
      data: [{ question_id, question_text, question_type, is_required, options }],
      timestamp: new Date()
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('Error updating membership question:', error);
    res.status(500).json({
      error: error.message || 'An error occurred while updating membership question'
    });
  }
}

async function deleteMembershipQuestion(req, res) {
  try {
    const { question_id, organization_id, cycle_number } = req.body;
    if (!question_id) {
      return res.status(400).json({ error: 'question_id is required' });
    }

    const result = await organizationsModel.deleteMembershipQuestion(question_id);
    if (!result?.success) {
      return res.status(404).json({ error: 'Membership question not found or could not be deleted' });
    }

    publishToChannel(`membership_questions_${organization_id}_${cycle_number}`, {
      operation: 'DELETE',
      data: [{ question_id }],
      timestamp: new Date()
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('Error deleting membership question:', error);
    res.status(500).json({
      error: error.message || 'An error occurred while deleting membership question'
    });
  }
}

async function getMembershipResponses(req, res) {
  try {
    const { application_id, sessionId } = req.query;
    if (!application_id) {
      return res.status(400).json({ error: 'application_id is required' });
    }

    const responses = await organizationsModel.getMembershipResponses(application_id);
    if (sessionId) {
      const ch = `membership_responses_${application_id}`;
      subscribeToChannel(sessionId, ch);
    }
    res.status(200).json(responses);
  } catch (error) {
    console.error('Error fetching membership responses:', error);
    res.status(500).json({
      error: error.message || 'An error occurred while fetching membership responses'
    });
  }
}

async function createMembershipResponse(req, res) {
  try {
    const { application_id, question_id, response_value } = req.body;
    if (!application_id || !question_id || !response_value) {
      return res.status(400).json({ error: 'application_id, question_id, and response_value are required' });
    }

    const result = await organizationsModel.createMembershipResponse(application_id, question_id, response_value);

    publishToChannel(`membership_responses_${application_id}`, {
      operation: 'CREATE',
      data: Array.isArray(result) ? result : [result],
      timestamp: new Date()
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating membership response:', error);
    res.status(500).json({
      error: error.message || 'An error occurred while creating membership response'
    });
  }
}

// Get current organization version (for mobile app)
async function getCurrentOrganizationVersion(req, res) {
  try {
    const { organizationId } = req.params;
    
    const orgDetails = await organizationsModel.getOrganizationDetails(organizationId);
    
    if (!orgDetails || !orgDetails.current_org_version_id) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found or no current version'
      });
    }
    
    res.json({
      success: true,
      data: {
        organization_id: organizationId,
        current_org_version_id: orgDetails.current_org_version_id
      }
    });
  } catch (error) {
    console.error('Error getting current organization version:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get organization version',
      error: error.message
    });
  }
}

// ===========================
// ORGANIZATION TERM OPTION MANAGEMENT
// ===========================

// Update organization term option setting
async function updateOrganizationTermOption(req, res) {
  try {
    let { organization_id, organization_version_id, organizationVersionId, term_option } = req.body;

    // Handle both parameter naming conventions
    if (!organization_version_id && organizationVersionId) {
      organization_version_id = organizationVersionId;
    }

    console.log('updateOrganizationTermOption called with:', {
      organization_id,
      organization_version_id,
      organizationVersionId,
      term_option,
      raw_body: req.body
    });

    // Validate required parameters
    if (!organization_id || term_option === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: organization_id and term_option are required'
      });
    }

    // If organization_version_id is not provided, fetch the current version
    if (organization_version_id === undefined || organization_version_id === null) {
      try {
        console.log('Fetching current organization version for organization_id:', organization_id);
        // Use the database connection to get current organization version
        const connection = await pool.getConnection();
        try {
          const [rows] = await connection.query(
            'SELECT current_org_version_id FROM organizations WHERE organization_id = ?',
            [organization_id]
          );
          console.log('Query result:', rows);
          if (!rows || rows.length === 0 || !rows[0].current_org_version_id) {
            return res.status(404).json({
              success: false,
              message: 'Organization not found or no current version available'
            });
          }
          organization_version_id = rows[0].current_org_version_id;
          console.log('Auto-fetched organization_version_id:', organization_version_id);
        } finally {
          connection.release();
        }
      } catch (fetchError) {
        console.error('Error fetching organization version:', fetchError);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch organization version'
        });
      }
    }

    // Call the stored procedure
    const result = await organizationsModel.updateOrganizationTermOption(
      organization_id,
      organization_version_id,
      term_option
    );

    console.log('updateOrganizationTermOption result:', result);

    // Publish real-time update to organization hub
    try {
      publishOrgHub({
        orgId: organization_id,
        orgVersionId: organization_version_id,
        entity: 'organization_settings',
        operation: 'UPDATE',
        data: {
          organization_id,
          organization_version_id,
          term_option,
          updated_at: new Date().toISOString()
        }
      });
      console.log(`🟢 Published term option update to organization hub: ${organization_id}`);
    } catch (sseError) {
      console.error('🔴 Failed to publish term option update to SSE:', sseError);
    }

    res.json({
      success: true,
      message: 'Term option updated successfully',
      data: result
    });

  } catch (error) {
    console.error('Error in updateOrganizationTermOption:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update term option',
      error: error.message
    });
  }
};

// 🆕 REAL-TIME ORGANIZATION UPDATES - Get current user's organizations with timestamp
/**
 * Gets the current user's organizations with real-time timestamp
 * Used by frontend for real-time updates to user.organizations[] array
 * 
 * @param {Object} req - Express request object (contains authenticated user)
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with user's organizations and timestamp
 */
async function getUserOrganizations(req, res) {
  try {
    console.log('🔄 [Real-time] Getting user organizations for:', req.user.email);
    
    // Get user's organization permissions (this includes their organizations)
    const userPermissions = await userModel.getPermissions(req.user.email);
    console.log('✅ [Real-time] Retrieved user permissions:', {
      email: req.user.email,
      organizationCount: userPermissions?.organizations?.length || 0,
      orgIds: userPermissions?.organizations?.map(org => `${org.organization_id}:${org.name}`) || [],
      orgStatuses: userPermissions?.organizations?.map(org => `${org.organization_id}:${org.status}`) || []
    });
    
    // Extract just the organizations array with additional metadata
    let organizations = userPermissions?.organizations || [];
    
    // 🔧 TEMPORARY FIX: Check for approved applications if no organizations found
    // This fixes the issue where students who create org applications aren't added as members
    if (organizations.length === 0) {
      console.log('🔧 [TEMP-FIX] No organizations found, checking for approved applications for:', req.user.email);
      
      try {
        const pool = require('../../config/db');
        const connection = await pool.getConnection();
        
        // Query for approved applications where user is the applicant
        const [approvedApps] = await connection.query(`
          SELECT o.name, o.logo, o.status, o.organization_id, o.current_org_version_id, 
                 rc.cycle_number, 'Applicant' AS position
          FROM tbl_application a
          JOIN tbl_organization o ON a.organization_id = o.organization_id
          JOIN tbl_renewal_cycle rc ON o.organization_id = rc.organization_id 
              AND rc.org_version_id = o.current_org_version_id
          WHERE a.applicant_user_id = ? 
            AND a.status = 'Approved'
            AND o.status = 'Approved'
        `, [req.user.email]);
        
        connection.release();
        
        if (approvedApps.length > 0) {
          console.log('🔧 [TEMP-FIX] Found approved applications:', approvedApps.length, 'organizations');
          organizations = approvedApps;
        } else {
          console.log('🔧 [TEMP-FIX] No approved applications found for user');
        }
        
      } catch (dbError) {
        console.error('🔧 [TEMP-FIX] Database query failed:', dbError);
      }
    }
    
    // Add real-time metadata
    const responseData = {
      organizations: organizations,
      timestamp: new Date().toISOString(),
      userEmail: req.user.email,
      count: organizations.length,
      source: 'real-time-api'
    };
    
    console.log('📤 [Real-time] Sending organization data:', {
      organizationCount: responseData.count,
      timestamp: responseData.timestamp,
      orgDetails: organizations.map(org => ({
        id: org.organization_id,
        name: org.name,
        status: org.status,
        role: org.role
      }))
    });
    
    res.status(200).json(responseData);
    
  } catch (error) {
    console.error('❌ [Real-time] Error getting user organizations:', {
      error: error.message,
      stack: error.stack,
      userEmail: req.user?.email
    });
    
    res.status(500).json({
      error: 'Failed to retrieve user organizations',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Generate application form document (DEBUG ENDPOINT)
 * @route POST /api/web/generate-application-form/:applicationId
 * @query {string} format - 'pdf' or 'docx' (default: 'docx')
 */
async function generateApplicationFormDocument(req, res) {
  try {
    const { applicationId } = req.params;
    const { format = 'docx' } = req.query; // Get format from query parameter
    const userEmail = req.user?.email;
    
    console.log('📄 [DOC-GEN-API] Generate request:', { applicationId, format, userEmail });
    
    // Validate format
    if (!['pdf', 'docx'].includes(format.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid format. Use "pdf" or "docx"'
      });
    }
    
    // Generate document
    const documentGenerationService = require('../services/documentGenerationService');
    const filePath = await documentGenerationService.generateApplicationForm(parseInt(applicationId), format.toLowerCase());
    
    // Return file path
    const relativePath = filePath.replace('/app', '');
    const fileExtension = format.toLowerCase();
    
    res.status(200).json({
      success: true,
      message: `Application form generated successfully as ${fileExtension.toUpperCase()}`,
      file_path: relativePath,
      format: fileExtension,
      download_url: `/api/web/download-application-form/${applicationId}?format=${fileExtension}`
    });
    
  } catch (error) {
    console.error('❌ [DOC-GEN-API] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate application form',
      message: error.message
    });
  }
}

/**
 * Download application form document
 * @route GET /api/web/download-application-form/:applicationId
 * @query {string} format - 'pdf' or 'docx' (default: latest available)
 */
async function downloadApplicationFormDocument(req, res) {
  try {
    const { applicationId } = req.params;
    const { format } = req.query; // Optional: 'pdf' or 'docx'
    const fs = require('fs');
    const path = require('path');
    
    console.log('📄 [DOC-DOWNLOAD] Download request:', { applicationId, format });
    
    // Find the most recent generated document
    const documentsDir = path.join('/app/applications', applicationId, 'documents');
    
    if (!fs.existsSync(documentsDir)) {
      return res.status(404).json({
        success: false,
        error: 'No application form found'
      });
    }
    
    let files = fs.readdirSync(documentsDir)
      .filter(f => f.startsWith('Application-Form-'));
    
    // Filter by format if specified
    if (format) {
      const ext = format.toLowerCase();
      if (!['pdf', 'docx'].includes(ext)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid format. Use "pdf" or "docx"'
        });
      }
      files = files.filter(f => f.endsWith(`.${ext}`));
    }
    
    // Sort by newest first
    files = files.sort().reverse();
    
    if (files.length === 0) {
      return res.status(404).json({
        success: false,
        error: format ? `No ${format.toUpperCase()} application form found` : 'No application form found'
      });
    }
    
    const latestFile = files[0];
    const filePath = path.join(documentsDir, latestFile);
    const fileExtension = path.extname(latestFile).toLowerCase();
    
    console.log('📄 [DOC-DOWNLOAD] Serving file:', filePath);
    
    // Use nginx X-Accel-Redirect for efficient file serving
    const nginxPath = `/protected-applications/${applicationId}/documents/${latestFile}`;
    
    // Set headers for download based on file type
    const contentType = fileExtension === '.pdf' 
      ? 'application/pdf' 
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${latestFile}"`);
    res.setHeader('X-Accel-Redirect', nginxPath);
    res.end();
    
  } catch (error) {
    console.error('❌ [DOC-DOWNLOAD] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download application form',
      message: error.message
    });
  }
}

/**
 * Get document generation status for an application
 * @route GET /api/web/application-form-status/:applicationId
 */
async function getApplicationFormStatus(req, res) {
  try {
    const { applicationId } = req.params;
    
    console.log('📄 [DOC-STATUS-API] Status request for application:', applicationId);
    
    const documentGenerationService = require('../services/documentGenerationService');
    const status = await documentGenerationService.getDocumentStatus(parseInt(applicationId));
    
    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Application not found'
      });
    }
    
    res.status(200).json({
      success: true,
      application_id: parseInt(applicationId),
      ...status
    });
    
  } catch (error) {
    console.error('❌ [DOC-STATUS-API] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get document status',
      message: error.message
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
  getApprovalTimeline,
  getOrganizationOfficers,
  getOrganizationMembers,
  getOrganizationHubData,
  getProgram,
  getAllExecutiveRanks,
  // Enhanced functions
  addApplicationPeriod,
  updateApplicationPeriod,
  createApprovalChain,
  uploadApprovalSignature,
  markApprovalAsReceived,
  markApprovalAsSigned,
  checkUserSignature,
  checkUserESignature,
  uploadUserSignatureFile,
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
  unarchiveOrganizationMember,
  getLeaveApplications,
  // Membership Questions functions (standardized for realtime)
  getMembershipQuestions,
  createMembershipQuestion,
  updateMembershipQuestion,
  deleteMembershipQuestion,
  getMembershipResponses,
  createMembershipResponse,
  // Leave Application functions
  approveLeaveApplication,
  rejectLeaveApplication,
  // Mobile helper functions
  getCurrentOrganizationVersion,
  // Term option management
  updateOrganizationTermOption,
  
  // 🆕 Real-time organization updates
  getUserOrganizations,
  
  // 📄 Document Generation
  generateApplicationFormDocument,
  downloadApplicationFormDocument,
  getApplicationFormStatus
};