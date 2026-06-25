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

transporter.verify()
  .then(() => console.log('✅ Connection successful'))
  .catch(err => console.error('❌ Connection failed:', err));
