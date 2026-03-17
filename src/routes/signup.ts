// src/routes/signup.ts
const html=`
    <div class="box-container">
<h1>Sign Up</h1>
        <h2 class="text-center">Sign Up</h2>
        <br>
        <form id="signupForm" class="signupForm">
            <div class="input-group">
                <label for="username" class="label">Username</label>
                <input type="text" id="username" class="input">
                <span class="error-message"></span>
            </div>
            <br>
            <div class="input-group">
                <label for="password" class="label">Password</label>
                <input type="password" id="password" class="input">
                <span class="error-message"></span>
            </div>
            <br>
            <button class="button" type="submit">Sign Up</button>
        </form>
        <br>
        <button class="button" onclick="window.location.hash='#/login'">Back to Login</button>
    </div>
`; 
const onLoad = () => {
    const form = document.getElementById('signupForm') as HTMLFormElement;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const username = (document.getElementById('username') as HTMLInputElement).value;
      const password = (document.getElementById('password') as HTMLInputElement).value;

      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (response.ok) {
        alert('Account created! Please log in.');
        window.location.hash = '#/login';
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Signup failed');
      }
    });
  };
export default { html, onLoad }
