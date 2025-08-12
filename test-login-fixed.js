// Test login script for Dokploy
async function testLogin() {
  try {
    const response = await fetch('http://localhost:3456/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'a.user.de@gmail.com',
        password: 'admin123'
      })
    });

    const data = await response.text();
    console.log('Response status:', response.status);
    console.log('Response data:', data);
    
    if (response.headers.get('set-cookie')) {
      console.log('Cookie set:', response.headers.get('set-cookie'));
    }
  } catch (error) {
    console.error('Login error:', error);
  }
}

testLogin();