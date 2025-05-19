const fetch = require('node-fetch');

async function testMainServerEmail() {
  console.log('Testing email API endpoint on main server...');
  
  try {
    // Using the main server port (3081)
    const response = await fetch('http://localhost:3081/api/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: 'adarsh@infin8t.tech', // Email to send to
        templateName: 'verification',
        templateData: {
          verificationLink: 'http://localhost:5173/verify-email?token=main-server-test-123456'
        }
      })
    });
    
    // Get response text first
    const responseText = await response.text();
    
    console.log('Raw response:', responseText);
    
    // Try to parse as JSON if possible
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.log('Response is not valid JSON');
    }
    
    if (response.ok) {
      console.log('✅ Email API on main server test successful!');
      console.log(data);
    } else {
      console.error('❌ Email API on main server test failed!');
      console.error('Status:', response.status);
      console.error('Status Text:', response.statusText);
      if (data) {
        console.error('Error Details:', data);
      }
    }
  } catch (error) {
    console.error('❌ Error connecting to API:', error.message);
    console.error('Make sure the main server is running at http://localhost:3081');
  }
}

testMainServerEmail(); 