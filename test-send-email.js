const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'nuconnect2026@gmail.com',
    pass: 'teng metu olep rnrh'.replace(/\s/g, '')
  },
  secure: true,
  port: 465
});

transporter.sendMail({
  from: 'nuconnect2026@gmail.com',
  to: 'testregister2026@gmail.com',
  subject: 'Test Email',
  text: 'Hello from NU Connect!'
}).then(info => console.log('✅ Sent:', info.messageId))
  .catch(err => console.error('❌ Error:', err));
