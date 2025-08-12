// Test login script for Dokploy
const fetch = require('node-fetch');

async function testLogin() {
  try {
    const response = await fetch('http://localhost:3456/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'a.user.de@gmail.com',
        password: 'password' // You'll need to provide the actual password
      })
    });

    const data = await response.json();
    console.log('Login response:', data);
    
    if (response.headers.get('set-cookie')) {
      console.log('Cookie set:', response.headers.get('set-cookie'));
    }
  } catch (error) {
    console.error('Login error:', error);
  }
}

testLogin();