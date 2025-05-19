const nodemailer = require('nodemailer');

async function testSMTP() {
  // Email configuration from our server setup
  const emailConfig = {
    smtp: {
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true,
      auth: {
        user: 'adarsh@infin8t.tech',
        pass: 'Adarsh@800850'
      }
    },
    defaultFrom: '"Neon App" <adarsh@infin8t.tech>'
  };

  console.log('Creating SMTP transporter...');
  const transporter = nodemailer.createTransport(emailConfig.smtp);
  
  console.log('Verifying SMTP connection...');
  try {
    // Verify connection configuration
    await transporter.verify();
    console.log('✅ SMTP Connection successful! Server is ready to send emails.');
    
    console.log('\nSending a test email...');
    // Send test email
    const info = await transporter.sendMail({
      from: emailConfig.defaultFrom,
      to: 'adarsh@infin8t.tech', // Send to yourself 
      subject: 'SMTP Test Email',
      html: `
        <h1>SMTP Test Successful</h1>
        <p>This is a test email to confirm that the SMTP configuration is working correctly.</p>
        <p>If you received this email, your SMTP setup is working perfectly!</p>
        <p>Timestamp: ${new Date().toISOString()}</p>
      `
    });
    
    console.log(`✅ Test email sent: ${info.messageId}`);
    console.log(`📧 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
  } catch (error) {
    console.error('❌ SMTP Error:', error);
    console.error('\nDetails:');
    console.error(`Host: ${emailConfig.smtp.host}`);
    console.error(`Port: ${emailConfig.smtp.port}`);
    console.error(`User: ${emailConfig.smtp.auth.user}`);
    
    if (error.code === 'EAUTH') {
      console.error('\n🔐 Authentication failed. Please check your username and password.');
    } else if (error.code === 'ESOCKET') {
      console.error('\n🔌 Socket connection error. Please check your host and port settings.');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('\n⏱️ Connection timed out. Please check your network and firewall settings.');
    }
  }
}

testSMTP(); 