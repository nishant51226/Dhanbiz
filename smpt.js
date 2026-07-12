const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // true for 465, false for 587
  auth: {
    user: 'lakshyatambi334@gmail.com',
    pass: 'lags pbhi fmun efbe',
  },
});

async function testSMTP() {
  try {
    // Verify SMTP connection
    await transporter.verify();
    console.log('✅ SMTP connection successful');

    // Send test email
    const info = await transporter.sendMail({
      from: '"SMTP Test" <your-email@gmail.com>',
      to: 'lakshya@akeo.in', // send to yourself
      subject: 'SMTP Test Email',
      text: 'This is a test email sent using Gmail SMTP.',
      html: '<h2>SMTP Test Successful</h2><p>This is a test email.</p>',
    });

    console.log('✅ Email sent');
    console.log('Message ID:', info.messageId);
  } catch (error) {
    console.error('❌ SMTP Error');
    console.error(error);
  }
}

testSMTP();