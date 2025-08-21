const nodemailer = require('nodemailer');

// Validate environment variables
if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASS) {
  console.warn('Gmail credentials not configured. Email functionality will be disabled.');
}

const transporter = process.env.GMAIL_USER && process.env.GMAIL_APP_PASS ? 
  nodemailer.createTransport({  // FIXED: createTransport not createTransporter
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASS
    }
  }) : null;

module.exports.sendInvitationEmail = async (recipient, redemptionUrl) => {
  if (!transporter) {
    console.warn('Email service not configured. Skipping email send.');
    return;
  }

  const mailOptions = {
    from: `"${process.env.FROM_NAME || 'NU Connect'}" <${process.env.FROM_EMAIL || process.env.GMAIL_USER}>`,
    to: recipient,
    subject: 'You\'re Invited to Join Our Platform!',
    html: generateInvitationTemplate(redemptionUrl)
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Invitation sent to ${recipient}`);
  } catch (error) {
    console.error('Email send error details:', {
      code: error.code,
      response: error.response,
      message: error.message
    });
    
    // Don't throw error - just log it
    console.warn(`Failed to send email to ${recipient}, but continuing...`);
  }
};

// Test email configuration
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
        <p><a href="#">Privacy Policy</a> | <a href="#">Terms of Service</a></p>
      </div>
    </div>
  </body>
  </html>
  `;
}