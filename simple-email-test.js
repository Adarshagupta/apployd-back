const nodemailer = require('nodemailer');

async function sendSimpleTestEmail() {
  // Create a test account
  console.log('Creating test account...');
  
  try {
    // Use Hostinger SMTP
    const transporter = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true,
      auth: {
        user: 'adarsh@infin8t.tech',
        pass: 'Adarsh@800850'
      }
    });
    
    console.log('Sending email...');
    // Send mail with defined transport object
    const info = await transporter.sendMail({
      from: '"Neon App" <adarsh@infin8t.tech>',
      to: 'adarsh@infin8t.tech',
      subject: 'Simple Email Test', 
      text: 'This is a simple test email.',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h1 style="color: #7e57c2;">Email Test Successful!</h1>
          <p>This is a test email sent at: ${new Date().toLocaleString()}</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin-top: 20px;">
            <p style="margin: 0;"><strong>SMTP Server:</strong> smtp.hostinger.com</p>
            <p style="margin: 10px 0 0;"><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          </div>
        </div>
      `
    });
    
    console.log('Email sent successfully!');
    console.log('Preview URL (if available):', nodemailer.getTestMessageUrl(info));
    console.log('Message ID:', info.messageId);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

sendSimpleTestEmail(); 