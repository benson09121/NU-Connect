const nodemailer = require('nodemailer');
const msal = require('@azure/msal-node');
const axios = require('axios');
const userModel = require('../web/models/userModel');

// Validate environment variables
const isEmailConfigured = () => {
  const hasUser = process.env.GMAIL_USER && process.env.GMAIL_USER.includes('@');
  const hasPass = process.env.GMAIL_APP_PASS && process.env.GMAIL_APP_PASS.replace(/\s/g, '').length >= 16;
  
  if (!hasUser) console.warn('❌ GMAIL_USER not configured or invalid');
  if (!hasPass) console.warn('❌ GMAIL_APP_PASS not configured or invalid format');
  
  return hasUser && hasPass;
};

// Azure AD helper function
async function getAccessToken(cca) {
    const response = await cca.acquireTokenByClientCredential({
        scopes: ["https://graph.microsoft.com/.default"],
    });
    return response.accessToken;
}

if (!isEmailConfigured()) {
  console.warn('📧 Gmail credentials not properly configured. Email functionality will be disabled.');
} else {
  console.log('📧 Gmail credentials configured for:', process.env.GMAIL_USER);
}

const transporter = isEmailConfigured() ? 
  nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASS.replace(/\s/g, '') // Remove all spaces
    },
    // Enhanced delivery settings
    secure: true,
    port: 465,
    pool: true, // Use connection pooling
    maxConnections: 5,
    maxMessages: 100,
    rateDelta: 1000, // 1 second between emails
    rateLimit: 5, // Max 5 emails per rateDelta
    tls: {
      rejectUnauthorized: false
    }
  }) : null;

// Test connection on startup with enhanced diagnostics
if (transporter) {
  transporter.verify()
    .then(() => {
      console.log('✅ Gmail SMTP connection verified successfully');
      // Additional deliverability checks
      console.log('📧 Email Deliverability Status:');
      console.log(`   📤 Sender: ${process.env.GMAIL_USER}`);
      console.log(`   🏢 Organization: ${process.env.FROM_NAME || 'NU Connect Team'}`);
      console.log(`   🔒 Security: App Password Authentication`);
      console.log(`   📡 SMTP: Gmail (smtp.gmail.com:465)`);
    })
    .catch(err => {
      console.error('❌ Gmail SMTP verification failed:', err.message);
      console.error('💡 Please check your Gmail App Password in .env file');
    });
}

async function sendInvitationEmail(recipient, redemptionUrl, isResend = false) {
  if (!transporter) {
    console.warn('📧 Email service not configured. Skipping email send.');
    return { success: false, message: 'Email service not configured' };
  }

  const subject = isResend 
    ? 'Reminder: You\'re Invited to Join NU Connect!' 
    : 'You\'re Invited to Join NU Connect!';

  const mailOptions = {
    from: `"${process.env.FROM_NAME || 'NU Connect Team'}" <${process.env.GMAIL_USER}>`,
    to: recipient,
    subject: subject,
    html: generateInvitationTemplate(redemptionUrl, isResend),
    text: `You've been invited to join NU Connect! Visit: ${redemptionUrl}`,
    // Enhanced headers for better delivery
    headers: {
      'X-Priority': '3', // Normal priority (1=high, 3=normal, 5=low)
      'X-MSMail-Priority': 'Normal',
      'Importance': 'normal',
      'X-Mailer': 'NU Connect System',
      'Reply-To': process.env.GMAIL_USER,
      'Return-Path': process.env.GMAIL_USER,
      'X-Auto-Response-Suppress': 'All',
      'List-Unsubscribe': `<mailto:${process.env.GMAIL_USER}?subject=unsubscribe>`,
      // Add organization identification
      'X-Organization': 'National University - Dasmariñas',
      'X-System': 'NU Connect',
      // Prevent auto-forwarding issues
      'Precedence': 'bulk',
      'X-Bulk': 'no'
    },
    // Add envelope settings for better delivery
    envelope: {
      from: process.env.GMAIL_USER,
      to: recipient
    },
    // Add message settings
    messageId: false, // Let Gmail generate message ID
    date: new Date()
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    const action = isResend ? 'Resent invitation' : 'Sent invitation';
    console.log(`✅ ${action} email to ${recipient} (ID: ${info.messageId})`);
    return { 
      success: true, 
      messageId: info.messageId,
      response: info.response 
    };
  } catch (error) {
    console.error('❌ Email send failed for', recipient, ':', error.message);
    
    if (error.code === 'EAUTH') {
      console.error('💡 Authentication failed. Check your Gmail App Password.');
    } else if (error.code === 'ENOTFOUND') {
      console.error('💡 Network error. Check your internet connection.');
    } else if (error.responseCode >= 500) {
      console.error('💡 Gmail server error. Try again later.');
    }
    
    return { success: false, error: error.message };
  }
}

async function sendRejectionEmail(recipient, rejectionReason, canReapply = true) {
  if (!transporter) {
    console.warn('📧 Email service not configured. Skipping email send.');
    return { success: false, message: 'Email service not configured' };
  }

  const mailOptions = {
    from: `"${process.env.FROM_NAME || 'NU Connect Team'}" <${process.env.GMAIL_USER}>`,
    to: recipient,
    subject: 'Application Status Update - NU Connect',
    html: generateRejectionTemplate(rejectionReason, canReapply),
    text: `Your application to NU Connect has been reviewed. Reason: ${rejectionReason}. ${canReapply ? 'You may reapply after addressing the feedback.' : ''}`,
    // Enhanced headers for better delivery
    headers: {
      'X-Priority': '3',
      'X-MSMail-Priority': 'Normal',
      'Importance': 'normal',
      'X-Mailer': 'NU Connect System',
      'Reply-To': process.env.GMAIL_USER,
      'Return-Path': process.env.GMAIL_USER,
      'X-Auto-Response-Suppress': 'All',
      'List-Unsubscribe': `<mailto:${process.env.GMAIL_USER}?subject=unsubscribe>`,
      'X-Organization': 'National University - Dasmariñas',
      'X-System': 'NU Connect',
      'Precedence': 'bulk',
      'X-Bulk': 'no'
    },
    envelope: {
      from: process.env.GMAIL_USER,
      to: recipient
    },
    messageId: false,
    date: new Date()
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Rejection email sent to ${recipient} (ID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Rejection email send failed for', recipient, ':', error.message);
    return { success: false, error: error.message };
  }
}

async function testEmailConfig() {
  if (!transporter) {
    return { success: false, message: 'Email not configured' };
  }
  
  try {
    await transporter.verify();
    return { success: true, message: 'Email configuration valid' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

async function sendTestEmail(recipient) {
  if (!transporter) {
    return { success: false, message: 'Email service not configured' };
  }

  const mailOptions = {
    from: `"${process.env.FROM_NAME || 'NU Connect Team'}" <${process.env.GMAIL_USER}>`,
    to: recipient,
    subject: 'Test Email - NU Connect',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Test Email</h2>
        <p>This is a test email from NU Connect system.</p>
        <p>If you receive this, the email configuration is working correctly.</p>
        <p>Sent at: ${new Date().toISOString()}</p>
      </div>
    `,
    text: `Test email from NU Connect system. Sent at: ${new Date().toISOString()}`,
    // Enhanced headers for test email
    headers: {
      'X-Priority': '3',
      'X-MSMail-Priority': 'Normal',
      'Importance': 'normal',
      'X-Mailer': 'NU Connect System - Test',
      'Reply-To': process.env.GMAIL_USER,
      'Return-Path': process.env.GMAIL_USER,
      'X-Organization': 'National University - Dasmariñas',
      'X-System': 'NU Connect Test',
      'X-Test-Email': 'true'
    },
    envelope: {
      from: process.env.GMAIL_USER,
      to: recipient
    },
    messageId: false,
    date: new Date()
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Test email sent to ${recipient} (ID: ${info.messageId})`);
    return { 
      success: true, 
      messageId: info.messageId,
      response: info.response,
      deliveryInfo: info
    };
  } catch (error) {
    console.error('❌ Test email send failed for', recipient, ':', error.message);
    return { success: false, error: error.message };
  }
}

// Enhanced delivery diagnostic function
async function diagnoseEmailDelivery(recipient) {
  if (!transporter) {
    return { success: false, message: 'Email service not configured' };
  }

  console.log('\n🔍 Email Delivery Diagnostic Report');
  console.log('=====================================');
  
  // Check 1: Gmail configuration
  console.log('1. Gmail Configuration:');
  console.log(`   ✓ User: ${process.env.GMAIL_USER}`);
  console.log(`   ✓ App Password: ${process.env.GMAIL_APP_PASS ? 'Configured' : 'Missing'}`);
  
  // Check 2: SMTP Connection
  console.log('\n2. SMTP Connection Test:');
  try {
    await transporter.verify();
    console.log('   ✅ SMTP connection successful');
  } catch (error) {
    console.log('   ❌ SMTP connection failed:', error.message);
    return { success: false, message: 'SMTP connection failed' };
  }
  
  // Check 3: Send test email with detailed tracking
  console.log('\n3. Sending Test Email with Tracking:');
  const testResult = await sendTestEmail(recipient);
  
  if (testResult.success) {
    console.log('   ✅ Email sent successfully');
    console.log(`   📧 Message ID: ${testResult.messageId}`);
    console.log(`   📤 SMTP Response: ${testResult.response}`);
    
    // Delivery troubleshooting tips
    console.log('\n💡 Delivery Troubleshooting Tips:');
    console.log('   1. Check recipient\'s SPAM/Junk folder');
    console.log('   2. Ask recipient to whitelist your email domain');
    console.log('   3. Verify recipient email address is correct');
    console.log('   4. Corporate emails may have stricter filters');
    console.log('   5. Check your Gmail account\'s reputation');
    console.log('   6. Ensure 2FA is enabled on your Gmail account');
    console.log('   7. Try sending to a different email provider (Gmail, Yahoo, etc.)');
    
    return { 
      success: true, 
      message: 'Email sent - check recipient spam folder',
      diagnostics: {
        smtpConnection: 'OK',
        emailSent: true,
        messageId: testResult.messageId,
        troubleshootingSteps: [
          'Check spam/junk folder',
          'Whitelist sender domain',
          'Verify recipient email',
          'Try different email provider'
        ]
      }
    };
  } else {
    console.log('   ❌ Email send failed:', testResult.error);
    return { success: false, message: testResult.error };
  }
}

function generateInvitationTemplate(redemptionUrl, isResend = false) {
  const headerText = isResend ? 'Reminder: Welcome to NU CONNECT!' : 'Welcome to NU CONNECT!';
  const reminderText = isResend ? '<div class="reminder-banner"><strong>Reminder:</strong> You may have missed our previous invitation.</div>' : '';
  
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NU CONNECT Invitation</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      
      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.2;
        color: #1E1E1E;
        background-color: #f5f5fa;
        letter-spacing: -0.3px;
        -webkit-text-size-adjust: 100%;
      }
      
      .email-wrapper {
        width: 100%;
        background-color: #f5f5fa;
        padding: 24px 16px;
      }
      
      .container {
        max-width: 600px;
        margin: 0 auto;
        background-color: #ffffff;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      }
      
      .header {
        background: linear-gradient(135deg, #424ec6 0%, #2c389e 100%);
        padding: 40px 32px;
        text-align: center;
        color: white;
      }
      
      .header h1 {
        font-size: 26px;
        font-weight: 700;
        margin: 0;
        letter-spacing: -0.5px;
      }
      
      .header p {
        font-size: 16px;
        font-weight: 400;
        margin-top: 8px;
        opacity: 0.9;
      }
      
      .reminder-banner {
        background-color: #fef3c7;
        border-left: 4px solid #fcc737;
        padding: 16px;
        margin: 0 32px 24px;
        border-radius: 4px;
        font-size: 14px;
        color: #92400e;
      }
      
      .content {
        padding: 32px;
        line-height: 1.6;
      }
      
      .content p {
        margin-bottom: 16px;
        font-size: 16px;
        color: #1E1E1E;
      }
      
      .cta-section {
        text-align: center;
        margin: 32px 0;
      }
      
      .cta-button {
        display: inline-block;
        background: linear-gradient(135deg, #424ec6 0%, #2c389e 100%);
        color: white;
        padding: 16px 32px;
        text-decoration: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 16px;
        letter-spacing: -0.3px;
        box-shadow: 0 4px 12px rgba(66, 78, 198, 0.3);
        transition: all 0.2s ease;
      }
      
      .cta-button:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(66, 78, 198, 0.4);
      }
      
      .info-card {
        background-color: #f5f5fa;
        border: 1px solid #eaeaea;
        border-radius: 8px;
        padding: 20px;
        margin: 24px 0;
      }
      
      .info-card h3 {
        font-size: 18px;
        font-weight: 600;
        color: #1E1E1E;
        margin-bottom: 8px;
        letter-spacing: -0.3px;
      }
      
      .info-card p {
        font-size: 14px;
        color: #666;
        margin: 0;
        line-height: 1.5;
      }
      
      .url-box {
        background-color: #f3f4f6;
        border: 1px solid #e5e7eb;
        border-radius: 4px;
        padding: 12px;
        word-break: break-all;
        font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
        font-size: 14px;
        color: #374151;
        margin: 16px 0;
      }
      
      .warning-box {
        background-color: #fef9e7;
        border: 1px solid #fcd34d;
        border-radius: 6px;
        padding: 16px;
        margin: 24px 0;
      }
      
      .warning-box .warning-icon {
        display: inline-block;
        width: 20px;
        height: 20px;
        background-color: #f59e0b;
        border-radius: 50%;
        margin-right: 8px;
        vertical-align: middle;
      }
      
      .warning-box p {
        margin: 0;
        font-size: 14px;
        color: #92400e;
        display: inline-block;
        vertical-align: middle;
        font-weight: 500;
      }
      
      .divider {
        height: 1px;
        background-color: #e5e7eb;
        margin: 32px 0;
      }
      
      .footer {
        background-color: #f5f5fa;
        padding: 32px;
        text-align: center;
        border-top: 1px solid #e5e7eb;
      }
      
      .footer p {
        font-size: 14px;
        color: #6b7280;
        margin: 4px 0;
      }
      
      .footer .logo {
        font-weight: 600;
        color: #424ec6;
        font-size: 16px;
        margin-bottom: 8px;
      }
      
      .footer .disclaimer {
        font-size: 12px;
        color: #9ca3af;
        margin-top: 16px;
        font-style: italic;
      }
      
      @media (max-width: 600px) {
        .email-wrapper {
          padding: 16px 8px;
        }
        
        .container {
          border-radius: 4px;
        }
        
        .header {
          padding: 32px 24px;
        }
        
        .content {
          padding: 24px;
        }
        
        .header h1 {
          font-size: 22px;
        }
        
        .cta-button {
          padding: 14px 24px;
          font-size: 15px;
        }
        
        .footer {
          padding: 24px;
        }
      }
    </style>
  </head>
  <body>
    <div class="email-wrapper">
      <div class="container">
        <div class="header">
          <h1>${headerText}</h1>
          <p>National University - Dasmariñas</p>
        </div>
        
        <div class="content">
          ${reminderText}
          
          <p>Hello,</p>
          
          <p>You've been invited to join <strong>NU CONNECT</strong>, our integrated platform for academic and administrative services. We're excited to have you as part of our community!</p>
          
          <div class="cta-section">
            <a href="${redemptionUrl}" class="cta-button">Accept Invitation</a>
          </div>
          
          <div class="warning-box">
            <span class="warning-icon"></span>
            <p><strong>Important:</strong> This invitation expires in 7 days. Please accept it promptly to secure your access.</p>
          </div>
          
          <div class="info-card">
            <h3>What is NU CONNECT?</h3>
            <p>NU CONNECT is your gateway to National University - Dasmariñas' digital ecosystem, providing seamless access to academic resources, administrative services, and campus-wide communications.</p>
          </div>
          
          <div class="divider"></div>
          
          <p><strong>Having trouble with the button?</strong><br>
          Copy and paste this link into your browser:</p>
          
          <div class="url-box">${redemptionUrl}</div>
          
          <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
          
          <p>Best regards,<br>
          <strong>The NU CONNECT Team</strong></p>
        </div>
        
        <div class="footer">
          <p class="logo">NU CONNECT</p>
          <p>&copy; ${new Date().getFullYear()} National University - Dasmariñas</p>
          <p>All rights reserved.</p>
          <p class="disclaimer">If you did not request this invitation, please ignore this email.</p>
        </div>
      </div>
    </div>
  </body>
  </html>
  `;
}

function generateRejectionTemplate(rejectionReason, canReapply) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NU CONNECT Application Status</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      
      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.2;
        color: #1E1E1E;
        background-color: #f5f5fa;
        letter-spacing: -0.3px;
        -webkit-text-size-adjust: 100%;
      }
      
      .email-wrapper {
        width: 100%;
        background-color: #f5f5fa;
        padding: 24px 16px;
      }
      
      .container {
        max-width: 600px;
        margin: 0 auto;
        background-color: #ffffff;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      }
      
      .header {
        background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
        padding: 40px 32px;
        text-align: center;
        color: white;
      }
      
      .header h1 {
        font-size: 24px;
        font-weight: 600;
        margin: 0;
        letter-spacing: -0.5px;
      }
      
      .header p {
        font-size: 16px;
        font-weight: 400;
        margin-top: 8px;
        opacity: 0.9;
      }
      
      .content {
        padding: 32px;
        line-height: 1.6;
      }
      
      .content p {
        margin-bottom: 16px;
        font-size: 16px;
        color: #1E1E1E;
      }
      
      .reason-card {
        background-color: #fef2f2;
        border: 1px solid #fca5a5;
        border-left: 4px solid #dc2626;
        border-radius: 6px;
        padding: 20px;
        margin: 24px 0;
      }
      
      .reason-card h3 {
        font-size: 16px;
        font-weight: 600;
        color: #dc2626;
        margin-bottom: 8px;
        letter-spacing: -0.3px;
      }
      
      .reason-card p {
        font-size: 15px;
        color: #7f1d1d;
        margin: 0;
        line-height: 1.5;
      }
      
      .reapply-card {
        background-color: #ecfdf5;
        border: 1px solid #6ee7b7;
        border-left: 4px solid #10b981;
        border-radius: 6px;
        padding: 20px;
        margin: 24px 0;
      }
      
      .reapply-card h3 {
        font-size: 16px;
        font-weight: 600;
        color: #047857;
        margin-bottom: 8px;
        letter-spacing: -0.3px;
      }
      
      .reapply-card p {
        font-size: 15px;
        color: #065f46;
        margin: 0;
        line-height: 1.5;
      }
      
      .info-card {
        background-color: #f5f5fa;
        border: 1px solid #eaeaea;
        border-radius: 8px;
        padding: 20px;
        margin: 24px 0;
      }
      
      .info-card h3 {
        font-size: 18px;
        font-weight: 600;
        color: #1E1E1E;
        margin-bottom: 8px;
        letter-spacing: -0.3px;
      }
      
      .info-card p {
        font-size: 14px;
        color: #666;
        margin: 0;
        line-height: 1.5;
      }
      
      .divider {
        height: 1px;
        background-color: #e5e7eb;
        margin: 32px 0;
      }
      
      .footer {
        background-color: #f5f5fa;
        padding: 32px;
        text-align: center;
        border-top: 1px solid #e5e7eb;
      }
      
      .footer p {
        font-size: 14px;
        color: #6b7280;
        margin: 4px 0;
      }
      
      .footer .logo {
        font-weight: 600;
        color: #424ec6;
        font-size: 16px;
        margin-bottom: 8px;
      }
      
      .footer .disclaimer {
        font-size: 12px;
        color: #9ca3af;
        margin-top: 16px;
        font-style: italic;
      }
      
      @media (max-width: 600px) {
        .email-wrapper {
          padding: 16px 8px;
        }
        
        .container {
          border-radius: 4px;
        }
        
        .header {
          padding: 32px 24px;
        }
        
        .content {
          padding: 24px;
        }
        
        .header h1 {
          font-size: 20px;
        }
        
        .footer {
          padding: 24px;
        }
      }
    </style>
  </head>
  <body>
    <div class="email-wrapper">
      <div class="container">
        <div class="header">
          <h1>Application Status Update</h1>
          <p>NU CONNECT Application Review</p>
        </div>
        
        <div class="content">
          <p>Hello,</p>
          
          <p>Thank you for your interest in joining <strong>NU CONNECT</strong>. We appreciate the time you took to submit your application.</p>
          
          <p>After careful review, we regret to inform you that your application has not been approved at this time.</p>
          
          <div class="reason-card">
            <h3>Reason for Application Decision</h3>
            <p>${rejectionReason}</p>
          </div>
          
          ${canReapply ? `
          <div class="reapply-card">
            <h3>You Can Reapply!</h3>
            <p>Good news! You may submit a new application after addressing the feedback above. Please ensure all requirements are met and any issues mentioned have been resolved before reapplying.</p>
          </div>
          ` : ''}
          
          <div class="info-card">
            <h3>Need Help or Have Questions?</h3>
            <p>If you have any questions about this decision, need clarification on the feedback provided, or require assistance with the application process, please don't hesitate to contact our support team.</p>
          </div>
          
          <div class="divider"></div>
          
          <p>We appreciate your understanding and encourage you to continue pursuing opportunities with National University - Dasmariñas.</p>
          
          <p>Best regards,<br>
          <strong>The NU CONNECT Team</strong></p>
        </div>
        
        <div class="footer">
          <p class="logo">NU CONNECT</p>
          <p>&copy; ${new Date().getFullYear()} National University - Dasmariñas</p>
          <p>All rights reserved.</p>
          <p class="disclaimer">This is an automated message regarding your application status.</p>
        </div>
      </div>
    </div>
  </body>
  </html>
  `;
}

async function resendInvitationEmail(email) {
  if (!transporter) {
    console.warn('📧 Email service not configured. Skipping email resend.');
    return { success: false, message: 'Email service not configured' };
  }

  const msalConfig = {
    auth: {
      clientId: process.env.AZURE_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
    }
  };

  const cca = new msal.ConfidentialClientApplication(msalConfig);

  try {
    // Check if user exists (allow pending users)
    const user = await userModel.getUserByEmail(email);
    if (!user) {
      throw new Error('User not found in the system');
    }
    
    // Allow resending to pending users specifically
    if (user.status !== 'Pending') {
      throw new Error('Can only resend invitations to users with Pending status');
    }

    // Get new access token
    const token = await getAccessToken(cca);

    // Create new invitation with fresh redemption URL
    const response = await axios.post(
      "https://graph.microsoft.com/v1.0/invitations",
      {
        invitedUserEmailAddress: email,
        inviteRedirectUrl: process.env.AZURE_REDIRECT_URL,
        sendInvitationMessage: false // We'll send our custom email
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const redemptionUrl = response.data.inviteRedeemUrl;
    console.log(`🔄 Generated new redemption URL for ${email}`);

    // Optional: Update user record with new redemption URL
    await userModel.updateRedemptionUrl(email, redemptionUrl);

    // Send custom invitation email with isResend flag
    const emailResult = await sendInvitationEmail(email, redemptionUrl, true);

    if (emailResult.success) {
      console.log(`✅ Invitation resent successfully to ${email}`);
      return {
        success: true,
        message: 'Invitation resent successfully',
        messageId: emailResult.messageId
      };
    } else {
      return emailResult;
    }

  } catch (error) {
    console.error('❌ Failed to resend invitation email:', error.message);

    // Handle specific error cases
    if (error.response?.status === 400) {
      console.error('💡 User may already exist in Azure AD or invitation is invalid');
    } else if (error.code === 'EAUTH') {
      console.error('💡 Azure authentication failed. Check your credentials.');
    }

    return { success: false, error: error.message };
  }
}


module.exports = {
  sendInvitationEmail,
  sendRejectionEmail,
  testEmailConfig,
  sendTestEmail,
  diagnoseEmailDelivery,
  resendInvitationEmail
};
