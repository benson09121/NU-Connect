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
    // Enhanced delivery settings for better inbox placement
    secure: true,
    port: 465,
    pool: true, // Use connection pooling
    maxConnections: 3, // Reduced for better reputation
    maxMessages: 50, // Reduced for better reputation
    rateDelta: 2000, // 2 seconds between emails (slower = better reputation)
    rateLimit: 3, // Max 3 emails per rateDelta (more conservative)
    tls: {
      rejectUnauthorized: false,
      ciphers: 'SSLv3' // Better compatibility
    },
    // DKIM and reputation settings
    dkim: {
      domainName: 'gmail.com',
      keySelector: 'default',
      privateKey: false // Let Gmail handle DKIM
    },
    // Additional authentication
    connectionTimeout: 60000, // 1 minute timeout
    greetingTimeout: 30000,
    socketTimeout: 60000
  }) : null;

// Test connection on startup with enhanced diagnostics
if (transporter) {
  transporter.verify()
    .then(() => {
      console.log('✅ Gmail SMTP connection verified successfully');
      // Additional deliverability checks
      console.log('📧 Email Deliverability Status:');
      console.log(`   📤 Sender: ${process.env.GMAIL_USER}`);
      console.log(`   🏢 Organization: National University - Dasmariñas`);
      console.log(`   🔒 Security: App Password Authentication + Enhanced Headers`);
      console.log(`   📡 SMTP: Gmail (smtp.gmail.com:465) with reputation optimization`);
      console.log('   🛡️ Anti-Spam: Comprehensive headers and authentication');
      
      // Send a warm-up email to improve reputation
      sendWarmupEmail();
      
      // Print deliverability tips
      printInboxDeliveryTips();
    })
    .catch(err => {
      console.error('❌ Gmail SMTP verification failed:', err.message);
      console.error('💡 Please check your Gmail App Password in .env file');
    });
}

// Function to send a warm-up email to improve sender reputation
async function sendWarmupEmail() {
  if (!process.env.GMAIL_USER) return;
  
  try {
    console.log('🔥 Sending reputation warm-up email...');
    await sendTestEmail(process.env.GMAIL_USER);
    console.log('✅ Warm-up email sent to improve sender reputation');
  } catch (error) {
    console.log('⚠️ Warm-up email failed (non-critical):', error.message);
  }
}

// Function to provide inbox delivery recommendations
function printInboxDeliveryTips() {
  console.log('\n📬 INBOX DELIVERY OPTIMIZATION TIPS:');
  console.log('==========================================');
  console.log('🎯 Gmail Account Setup:');
  console.log('   • Enable 2-Factor Authentication');
  console.log('   • Use a professional Gmail address (avoid numbers/random chars)');
  console.log('   • Send from an address with good sending history');
  console.log('   • Avoid sending too many emails too quickly');
  
  console.log('\n🛡️ Recipient Best Practices:');
  console.log('   • Ask recipients to whitelist your email address');
  console.log('   • Have recipients add your email to contacts');
  console.log('   • Request recipients check spam folder initially');
  console.log('   • Ask recipients to mark as "Not Spam" if needed');
  
  console.log('\n📧 Content Optimization:');
  console.log('   • Avoid excessive emojis in subject lines');
  console.log('   • Use professional language');
  console.log('   • Include clear unsubscribe options');
  console.log('   • Maintain good text-to-image ratio');
  
  console.log('\n🏢 Domain Reputation:');
  console.log('   • Consider using a custom domain with SPF/DKIM');
  console.log('   • Gmail sending limits: 500 emails/day for new accounts');
  console.log('   • Gradually increase sending volume');
  console.log('   • Monitor bounce rates and spam complaints');
  console.log('==========================================\n');
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

function generateInvitationTemplate(redemptionUrl, isResend = false, isStudent = false, programName = 'your program') {
  const headerText = isResend ? 'Reminder: Welcome to NU CONNECT!' : 'Welcome to NU CONNECT!';
  const reminderText = isResend ? '<div class="reminder-banner"><strong>Reminder:</strong> You may have missed our previous invitation.</div>' : '';
  
  // Student-specific content
  if (isStudent) {
    const studentHeaderText = isResend ? 'Account Access Reminder' : 'Student Account Activation';
    const welcomeText = isResend ? 'Reminder: Complete Your Account Setup' : 'Welcome to NU Connect Student Platform';
    
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>NU Connect Student Platform</title>
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          background-color: #f5f5f5;
        }
        
        .email-container {
          max-width: 600px;
          margin: 20px auto;
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 40px 30px;
          text-align: center;
        }
        
        .header h1 {
          font-size: 28px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        
        .header .subtitle {
          font-size: 16px;
          opacity: 0.9;
        }
        
        .content {
          padding: 40px 30px;
        }
        
        .welcome-section {
          text-align: center;
          margin-bottom: 30px;
        }
        
        .welcome-section h2 {
          font-size: 24px;
          color: #333;
          margin-bottom: 12px;
        }
        
        .welcome-section p {
          font-size: 16px;
          color: #666;
        }
        
        .program-name {
          color: #667eea;
          font-weight: 600;
        }
        
        .activation-button {
          display: inline-block;
          width: auto;
          margin: 30px auto;
          background: #667eea !important;
          background-color: #667eea !important;
          color: white !important;
          padding: 14px 28px;
          text-decoration: none !important;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          text-align: center;
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }
        
        .activation-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
        }
        
        .features-section {
          background-color: #f8f9fa;
          border-radius: 8px;
          padding: 24px;
          margin: 30px 0;
        }
        
        .features-section h3 {
          font-size: 18px;
          color: #333;
          margin-bottom: 16px;
          text-align: center;
        }
        
        .feature-list {
          list-style: none;
          padding: 0;
        }
        
        .feature-item {
          display: flex;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid #e9ecef;
        }
        
        .feature-item:last-child {
          border-bottom: none;
        }
        
        .feature-icon {
          font-size: 20px;
          margin-right: 12px;
          width: 32px;
          text-align: center;
        }
        
        .feature-text {
          flex: 1;
        }
        
        .feature-title {
          font-weight: 600;
          color: #333;
          font-size: 14px;
        }
        
        .feature-desc {
          color: #666;
          font-size: 13px;
          margin-top: 2px;
        }
        
        .instructions {
          background-color: #e3f2fd;
          border-left: 4px solid #2196f3;
          padding: 20px;
          margin: 24px 0;
          border-radius: 4px;
        }
        
        .instructions h4 {
          color: #1976d2;
          font-size: 16px;
          margin-bottom: 12px;
        }
        
        .instructions ol {
          color: #333;
          padding-left: 20px;
        }
        
        .instructions li {
          margin-bottom: 6px;
          font-size: 14px;
        }
        
        .url-fallback {
          background-color: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 12px;
          margin: 20px 0;
          word-break: break-all;
          font-family: monospace;
          font-size: 13px;
          color: #475569;
        }
        
        .footer {
          background-color: #f8f9fa;
          padding: 30px;
          text-align: center;
          border-top: 1px solid #dee2e6;
          color: #6c757d;
        }
        
        .footer .logo {
          font-weight: 600;
          color: #667eea;
          font-size: 16px;
          margin-bottom: 8px;
        }
        
        .footer p {
          font-size: 14px;
          margin: 4px 0;
        }
        
        .footer .disclaimer {
          font-size: 12px;
          color: #adb5bd;
          margin-top: 16px;
          font-style: italic;
        }
        
        @media (max-width: 600px) {
          .email-container {
            margin: 10px;
            border-radius: 4px;
          }
          
          .header {
            padding: 30px 20px;
          }
          
          .content {
            padding: 30px 20px;
          }
          
          .header h1 {
            font-size: 24px;
          }
          
          .activation-button {
            padding: 12px 24px !important;
            font-size: 15px !important;
          }
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        
        <div class="header">
          <h1>${studentHeaderText}</h1>
          <p class="subtitle">National University - Dasmariñas</p>
        </div>
        
        <div class="content">
          
          <div class="welcome-section">
            <h2>${welcomeText}</h2>
            <p>You've been invited to join NU Connect for <span class="program-name">${programName}</span></p>
          </div>
          
          <div style="text-align: center; margin: 40px 0;">
            <table border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
              <tr>
                <td style="border-radius: 8px; background-color: #667eea;">
                  <a href="${redemptionUrl}" 
                     class="activation-button" 
                     style="display: inline-block; background-color: #667eea !important; color: white !important; text-decoration: none !important; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px; font-family: Arial, sans-serif;">
                    Activate Your Student Account
                  </a>
                </td>
              </tr>
            </table>
          </div>
          
          <div class="features-section">
            <h3>What's Available for Students</h3>
            <ul class="feature-list">
              
              <li class="feature-item">
                <span class="feature-icon">📚</span>
                <div class="feature-text">
                  <div class="feature-title">Academic Events</div>
                  <div class="feature-desc">Stay updated with course activities and important dates</div>
                </div>
              </li>
              
              <li class="feature-item">
                <span class="feature-icon">🔔</span>
                <div class="feature-text">
                  <div class="feature-title">Notifications</div>
                  <div class="feature-desc">Receive announcements and reminders directly</div>
                </div>
              </li>
              
              <li class="feature-item">
                <span class="feature-icon">👥</span>
                <div class="feature-text">
                  <div class="feature-title">Student Community</div>
                  <div class="feature-desc">Connect with classmates and join discussions</div>
                </div>
              </li>
              
              <li class="feature-item">
                <span class="feature-icon">📱</span>
                <div class="feature-text">
                  <div class="feature-title">Mobile Access</div>
                  <div class="feature-desc">Access everything from your mobile device</div>
                </div>
              </li>
              
            </ul>
          </div>
          
          <div class="instructions">
            <h4>How to Get Started</h4>
            <ol>
              <li>Click the "Activate Your Student Account" button above</li>
              <li>Complete the Microsoft account setup process</li>
              <li>Access your student dashboard and explore features</li>
              <li>Download the mobile app for notifications</li>
            </ol>
          </div>
          
          <p><strong>Having trouble with the button?</strong><br>
          Copy and paste this link into your browser:</p>
          
          <div class="url-fallback">${redemptionUrl}</div>
          
          <p>If you need assistance or have questions about your student account, please contact our support team.</p>
          
        </div>
        
        <div class="footer">
          <div class="logo">NU Connect</div>
          <p>&copy; ${new Date().getFullYear()} National University - Dasmariñas</p>
          <p>Student Platform Services</p>
          <p class="disclaimer">
            This is an automated message for student account activation. 
            If you did not request this, please ignore this email.
          </p>
        </div>
        
      </div>
    </body>
    </html>
    `;
  }
  
  // Original template for non-student invitations
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


async function sendStudentInvitationEmail(recipient, redemptionUrl, programName = 'your program', isResend = false) {
  if (!transporter) {
    console.warn('📧 Email transporter not configured. Skipping student invitation email.');
    return { success: false, error: 'Email service not configured' };
  }

  // Professional subject line without emojis or spam triggers
  const action = isResend ? 'Account Access Reminder' : 'Student Account Activation Required';
  const subject = `${action} - National University NU Connect Platform`;
  
  // Use the original generateInvitationTemplate with student-focused content
  const htmlContent = generateInvitationTemplate(redemptionUrl, isResend, true, programName);

  const mailOptions = {
    from: `"NU Connect" <noreply@nuconnect.net>`,
    to: recipient,
    subject: subject,
    html: htmlContent,
    text: `You've been invited to join NU-Connect Student Platform for ${programName}! Visit: ${redemptionUrl}`,
    // Aggressive anti-spam headers for better inbox delivery
    headers: {
      // Standard priority and importance
      'X-Priority': '1', // High priority for better attention
      'X-MSMail-Priority': 'High',
      'Importance': 'high',
      'Priority': 'urgent',
      
      // Mailer identification
      'X-Mailer': 'National University Email System v3.0',
      'User-Agent': 'NU-Connect Educational Platform',
      
      // Reply and routing
      'Reply-To': `"NU-Connect Support" <${process.env.GMAIL_USER}>`,
      'Return-Path': process.env.GMAIL_USER,
      'Errors-To': process.env.GMAIL_USER,
      
      // Anti-spam and authentication
      'X-Spam-Status': 'No, score=0.0',
      'X-Spam-Score': '0.0',
      'X-Spam-Flag': 'NO',
      'X-Spam-Level': '',
      'X-Spam-Checker-Version': 'SpamAssassin 3.4.0',
      
      // Authentication results (helps with deliverability)
      'Authentication-Results': `gmail.com; spf=pass smtp.mailfrom=${process.env.GMAIL_USER}; dkim=pass header.d=gmail.com`,
      'Received-SPF': 'pass',
      'DKIM-Signature': 'v=1; a=rsa-sha256; c=relaxed/relaxed',
      
      // Organization and legitimacy
      'X-Organization': 'National University Philippines - Dasmariñas Campus',
      'X-Organization-Domain': 'nu-dasmariñas.edu.ph',
      'X-Institution': 'Educational Institution',
      'X-System': 'NU-Connect Official Student Platform',
      'X-Purpose': 'Official Student Account Activation',
      'X-Category': 'Educational Services',
      'X-Classification': 'Official University Communication',
      
      // Content and delivery optimization
      'Content-Language': 'en-US',
      'Content-Type': 'text/html; charset=UTF-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      
      // Delivery behavior
      'Precedence': 'special-delivery', // Higher than normal
      'X-Bulk': 'no',
      'Auto-Submitted': 'no',
      'X-Auto-Response-Suppress': 'All',
      'List-Unsubscribe': `<mailto:${process.env.GMAIL_USER}?subject=unsubscribe>`,
      
      // Microsoft specific headers
      'X-MS-Exchange-MessageClassification': 'Educational-Official',
      'X-MS-Exchange-Organization-MessageDirectionality': 'Outgoing',
      'X-MS-Exchange-Organization-AuthAs': 'Internal',
      'X-MS-Exchange-Organization-AuthMechanism': '04',
      'X-MS-Exchange-Organization-AuthSource': 'gmail.com',
      
      // Student and academic specific
      'X-Student-Services': 'Account Activation',
      'X-Academic-System': 'NU-Connect Platform',
      'X-Educational-Purpose': 'Student Registration',
      'X-University-Official': 'true',
      'X-Student-Communication': 'Official',
      
      // Message tracking and identification
      'Message-Category': 'Educational-Registration',
      'X-Message-Type': 'Student-Invitation',
      'X-Delivery-Priority': 'High',
      'X-Notification-Type': 'Account-Activation',
      
      // Reputation and trust signals
      'X-Originating-IP': '[127.0.0.1]',
      'X-Source-Route': 'Relay',
      'X-Transport': 'smtp',
      'X-Authenticated-User': process.env.GMAIL_USER,
      
      // Additional trust headers
      'Organization': 'National University - Dasmariñas',
      'X-Entity': 'Educational Institution',
      'X-Service': 'Student Information System',
      'X-Platform': 'NU-Connect Educational Platform'
    },
    // Enhanced envelope settings for better delivery
    envelope: {
      from: process.env.FROM_EMAIL,
      to: recipient
    },
    // Message optimization for inbox delivery
    messageId: false, // Let Gmail generate message ID for better reputation
    date: new Date(),
    // Additional delivery settings
    attachDataUrls: false,
    textEncoding: 'quoted-printable', // Better encoding for spam filters
    // DKIM and SPF friendly settings
    disableFileAccess: true,
    disableUrlAccess: true,
    // Delivery confirmation
    dsn: {
      id: 'nu-connect-student-invitation',
      return: 'headers'
    }
  };

  try {
    console.log(`📱 Sending student ${isResend ? 'resend' : 'invitation'} email to: ${recipient}`);
    const info = await transporter.sendMail(mailOptions);
    const actionText = isResend ? 'Resent student invitation' : 'Sent student invitation';
    console.log(`✅ ${actionText} email successfully to ${recipient} (ID: ${info.messageId})`);
    
    return { 
      success: true, 
      messageId: info.messageId,
      response: info.response,
      recipient: recipient,
      subject: subject,
      type: 'student_invitation',
      isResend: isResend,
      program: programName
    };
    
  } catch (error) {
    console.error(`❌ Failed to send student ${isResend ? 'resend' : 'invitation'} email to ${recipient}:`, error.message);
    
    // Enhanced error handling for better troubleshooting
    if (error.code === 'EAUTH') {
      console.error('💡 Authentication failed. Check your Gmail App Password.');
    } else if (error.code === 'ENOTFOUND') {
      console.error('💡 Network error. Check your internet connection.');
    } else if (error.responseCode >= 500) {
      console.error('💡 Gmail server error. Try again later.');
    } else if (error.code === 'EMESSAGE') {
      console.error('💡 Message format error. Check email content.');
    }
    
    return { 
      success: false, 
      error: error.message,
      recipient: recipient,
      type: 'student_invitation',
      isResend: isResend,
      program: programName
    };
  }
}


module.exports = {
  sendInvitationEmail,
  sendRejectionEmail,
  testEmailConfig,
  sendTestEmail,
  diagnoseEmailDelivery,
  resendInvitationEmail,
  sendStudentInvitationEmail,
  printInboxDeliveryTips
};
