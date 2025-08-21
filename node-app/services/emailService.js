const nodemailer = require('nodemailer');

// Validate environment variables
const isEmailConfigured = () => {
  const hasUser = process.env.GMAIL_USER && process.env.GMAIL_USER.includes('@');
  const hasPass = process.env.GMAIL_APP_PASS && process.env.GMAIL_APP_PASS.replace(/\s/g, '').length >= 16;
  
  if (!hasUser) console.warn('❌ GMAIL_USER not configured or invalid');
  if (!hasPass) console.warn('❌ GMAIL_APP_PASS not configured or invalid format');
  
  return hasUser && hasPass;
};

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
    debug: false,
    logger: false
  }) : null;

// Test connection on startup
if (transporter) {
  transporter.verify()
    .then(() => console.log('✅ Gmail SMTP connection verified successfully'))
    .catch(err => {
      console.error('❌ Gmail SMTP verification failed:', err.message);
      console.error('💡 Please check your Gmail App Password in .env file');
    });
}

module.exports.sendInvitationEmail = async (recipient, redemptionUrl) => {
  if (!transporter) {
    console.warn('📧 Email service not configured. Skipping email send.');
    return { success: false, message: 'Email service not configured' };
  }

  const mailOptions = {
    from: `"${process.env.FROM_NAME || 'NU Connect'}" <${process.env.GMAIL_USER}>`,
    to: recipient,
    subject: 'You\'re Invited to Join NU Connect!',
    html: generateInvitationTemplate(redemptionUrl),
    text: `You've been invited to join NU Connect! Visit: ${redemptionUrl}`
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Invitation email sent to ${recipient} (ID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email send failed for', recipient, ':', error.message);
    
    if (error.code === 'EAUTH') {
      console.error('💡 Authentication failed. Please check Gmail App Password.');
    }
    
    return { success: false, error: error.message };
  }
};

module.exports.testEmailConfig = async () => {
  if (!transporter) {
    return { success: false, message: 'Email not configured' };
  }
  
  try {
    await transporter.verify();
    return { success: true, message: 'Email configuration valid' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

function generateInvitationTemplate(redemptionUrl) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
      .header { background-color: #2563eb; padding: 20px; color: white; text-align: center; }
      .content { padding: 30px; line-height: 1.6; }
      .button { 
        display: inline-block; background-color: #2563eb; color: white; 
        padding: 12px 24px; text-decoration: none; border-radius: 4px; 
        font-weight: bold; margin: 20px 0; 
      }
      .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 0.9em; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>Welcome to NU CONNECT!</h1>
      </div>
      
      <div class="content">
        <p>Hello,</p>
        <p>You've been invited to join NU CONNECT. Click the button below to accept your invitation and get started:</p>
        
        <a href="${redemptionUrl}" class="button">Accept Invitation</a>
        
        <p>This link will expire in 7 days. If you have trouble with the button, copy and paste this URL into your browser:</p>
        <p><small>${redemptionUrl}</small></p>
        
        <p>Best regards,<br>The NU CONNECT Team</p>
      </div>
      
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} NU Connect. All rights reserved.</p>
        <p>National University - Dasmariñas</p>
      </div>
    </div>
  </body>
  </html>
  `;
}