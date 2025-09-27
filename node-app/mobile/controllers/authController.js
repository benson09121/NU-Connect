const userModel = require('../models/userModel');
const jwt = require('jsonwebtoken');
const msal = require('@azure/msal-node');
const axios = require('axios');
const { sendStudentInvitationEmail } = require('../../services/emailService');
const userActivationModel = require('../../web/models/userActivationModel');
const accountModel = require('../../web/models/accountModel');
const { publishToChannel } = require('../../web/controllers/sseController');
require('dotenv').config();
const programsModel = require('../../web/models/programsModel');

async function login(req, res) {
    try {
        console.log('📱 Mobile login attempt for:', req.body.email || req.body.mail);
        
        // Set request timeout
        req.setTimeout(30000);
        
        const email = req.body.mail || req.body.email;
        
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }
        
        // 🆕 MOBILE EXISTING-USER-ONLY LOGIC - Check if user exists first
        console.log('📱 Checking if user exists before login...');
        const existingUser = await userModel.getUserByEmail(email);
        
        if (!existingUser) {
            console.log('📱 Login failed - user does not exist:', email);
            return res.status(401).json({ 
                message: 'User not found. Please register first or contact support.',
                error_code: 'USER_NOT_FOUND'
            });
        }
        
        console.log('📱 User exists with status:', existingUser.status);
        
        // Only allow login for Active or Pending users
        if (existingUser.status === 'Suspended') {
            console.log('📱 Login failed - user is suspended:', email);
            return res.status(401).json({ 
                message: 'Account is suspended. Please contact support.',
                error_code: 'ACCOUNT_SUSPENDED'
            });
        }
        
        let userActivated = false;
        
        // If user is Pending, activate them with name updates
        if (existingUser.status === 'Pending') {
            console.log('📱 User is pending - proceeding with activation...');
            
            // Get names from various sources
            let firstName = existingUser.f_name || 'User';  // Use existing name as fallback
            let lastName = existingUser.l_name || 'Student'; // Use existing name as fallback
            
            // Try to get names from request body (if mobile app sends them)
            if (req.body.first_name || req.body.f_name) {
                firstName = req.body.first_name || req.body.f_name;
            }
            if (req.body.last_name || req.body.l_name) {
                lastName = req.body.last_name || req.body.l_name;
            }
            
            console.log('📱 Using names for activation:', { email, firstName, lastName });
            
            // Use the mobile-specific activation function that only handles existing users
            console.log('📱 Calling mobile user activation...');
            const activationResult = await userModel.activateExistingUser(email, firstName, lastName);
            
            if (!activationResult) {
                console.log('📱 Activation failed for:', email);
                return res.status(500).json({ message: 'User activation failed' });
            }
            
            userActivated = true;
            console.log(`🎉 Mobile user ${email} activated on login!`);
            
            // Log the activation event
            if (existingUser.user_id) {
                await userActivationModel.logUserActivation(
                    existingUser.user_id,
                    email,
                    'mobile_first_login'
                );
            }
            
            // 🆕 BROADCAST REAL-TIME UPDATES FOR MOBILE STATUS CHANGE
            try {
                // Check if user is a student (mobile users are typically students)
                const isStudent = existingUser.role_name?.toLowerCase() === 'student';
                
                // Update accounts list for non-students only
                if (!isStudent) {
                    const allAccounts = await accountModel.getAccounts();
                    publishToChannel('accounts', {
                        operation: 'SNAPSHOT',
                        data: allAccounts,
                    });
                    console.log(`📡 [MOBILE] Broadcasted accounts update for non-student activation: ${email}`);
                } else {
                    console.log(`👤 [MOBILE] Student ${email} activated - not included in accounts broadcast`);
                }
                
                // Always update pending applications list
                const fullPending = await accountModel.getAllPendingUsersAndApplications();
                publishToChannel('user-applications', {
                    operation: 'SNAPSHOT',
                    data: fullPending,
                });
                console.log(`📡 [MOBILE] Broadcasted pending applications update after activation: ${email}`);
            } catch (broadcastError) {
                console.error('📱 Failed to broadcast mobile status change updates:', broadcastError);
                // Don't fail login if broadcast fails
            }
        } else if (existingUser.status === 'Active') {
            console.log('📱 User is already active - proceeding with normal login...');
        }
        
        console.log('📱 Generating JWT token...');
        const token = await userModel.generateToken(email);
        console.log('📱 Token generated, sending response...');
        
        res.json({
            message: 'User Authenticated',
            token: token,
            user_activated: userActivated, // Let mobile app know if user was activated
            activation_info: userActivated ? {
                was_just_activated: true,
                activation_method: 'mobile_first_login',
                activation_date: new Date().toISOString()
            } : null
        });
        
    } catch (error) {
        console.error('📱 Mobile login error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: error.message 
        });
    }
}

async function getAccessToken(cca) {
    const response = await cca.acquireTokenByClientCredential({
        scopes: ["https://graph.microsoft.com/.default"],
    });
    return response.accessToken;
}

async function register(req, res) {
    const { email, program_id, program_name } = req.body;
    
    // Validate input
    if (!email || !program_id || !program_name) {
        return res.status(400).json({ 
            success: false,
            message: 'Email, program_id, and program_name are required',
            error_code: 'MISSING_FIELDS'
        });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid email format',
            error_code: 'INVALID_EMAIL'
        });
    }

    // Validate program_id
    if (!program_id || isNaN(program_id)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid program_id. Must be a valid program identifier',
            error_code: 'INVALID_PROGRAM_ID'
        });
    }

    // Validate program_name
    if (!program_name || program_name.trim().length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Invalid program_name. Program name cannot be empty',
            error_code: 'INVALID_PROGRAM_NAME'
        });
    }

    console.log(`📱 Mobile Registration attempt for: ${email}, Program ID: ${program_id}, Program: ${program_name}`);

    try {
        // Check if email is already registered
        const existingUser = await userModel.getUserByEmail(email);
        let isResend = false;
        let newUser = null;
        
        if (existingUser) {
            // Automatically handle pending users as resend
            if (existingUser.status === 'Pending') {
                console.log(`🔄 Detected pending user - automatically resending invitation for: ${email}`);
                isResend = true;
                newUser = existingUser;
            } else {
                console.log(`❌ Registration failed: Email ${email} already exists with status: ${existingUser.status}`);
                return res.status(401).json({
                    success: false,
                    message: 'Email is already registered and active',
                    error_code: 'EMAIL_EXISTS',
                    registered_at: existingUser.created_at || 'Unknown',
                    status: existingUser.status
                });
            }
        } else {
            // Create new pending user in tbl_user using stored procedure
            newUser = await userModel.createPendingMobileUser(email, program_id);
            console.log(`✅ Pending user created in tbl_user with UUID: ${newUser.user_id}`);
        }

        // Create Azure AD invitation
        const msalConfig = {
            auth: {
                clientId: process.env.AZURE_CLIENT_ID,
                authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
                clientSecret: process.env.AZURE_CLIENT_SECRET,
            }
        };

        const cca = new msal.ConfidentialClientApplication(msalConfig);
        const token = await getAccessToken(cca);
        
        console.log(`🔗 Creating Azure AD invitation for ${email}...`);
        const azureResponse = await axios.post(
            "https://graph.microsoft.com/v1.0/invitations",
            {
                invitedUserEmailAddress: email,
                inviteRedirectUrl: process.env.AZURE_REDIRECT_URL,
                sendInvitationMessage: false // We'll send our custom email
            },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        const redemptionUrl = azureResponse.data.inviteRedeemUrl;
        const azureUserId = azureResponse.data.invitedUser.id;
        
        console.log(`✅ Azure AD invitation created for ${email}`);

        // Use the provided program_name directly
        const programName = program_name.trim();

        // Send custom student invitation email using the working template
        const emailResult = await sendStudentInvitationEmail(email, redemptionUrl, programName, isResend);
        
        if (emailResult.success) {
            const action = isResend ? 'resent' : 'sent';
            console.log(`✅ Mobile invitation email ${action} to ${email}`);

            res.status(200).json({ 
                success: true,
                message: isResend ? "Student invitation resent successfully" : "Student account created and invitation sent successfully",
                data: {
                    user_id: newUser.user_id,
                    email: email,
                    program_id: program_id,
                    program_name: programName,
                    status: newUser.status,
                    account_type: 'student_mobile',
                    invitation_sent: true,
                    resend: isResend,
                    azure_user_id: azureUserId,
                    created_at: newUser.created_at,
                    email_message_id: emailResult.messageId
                }
            });
        } else {
            console.error(`❌ Email send failed for ${email}:`, emailResult.error);
            res.status(200).json({ 
                success: true,
                message: isResend ? "User exists but invitation resend failed" : "Student account created but email sending failed",
                data: {
                    user_id: newUser.user_id,
                    email: email,
                    program_id: program_id,
                    program_name: programName,
                    status: newUser.status,
                    account_type: 'student_mobile',
                    invitation_sent: false,
                    resend: isResend,
                    email_error: emailResult.error
                }
            });
        }

    } catch (error) {
        console.error('❌ Mobile registration error:', error);
        
        // Handle specific stored procedure errors
        if (error.message && error.message.includes('Email already exists')) {
            return res.status(401).json({
                success: false,
                message: 'Email is already registered',
                error_code: 'EMAIL_EXISTS'
            });
        }

        // Handle specific Azure AD errors
        if (error.response && error.response.status === 400) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email or Azure AD configuration error',
                error_code: 'AZURE_ERROR',
                details: error.response.data?.error?.message || 'Unknown Azure error'
            });
        }

        res.status(500).json({ 
            success: false,
            message: 'Internal server error during registration',
            error_code: 'SERVER_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Registration failed'
        });
    }
}

async function getAllPrograms(req, res) {
    try {
        const programs = await programsModel.getAllPrograms();
        
        res.json(programs);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while fetching programs.",
        });
    }
}


module.exports = { login, register, getAllPrograms };
    