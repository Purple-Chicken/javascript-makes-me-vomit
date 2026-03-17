// src/routes/login.ts


const html=`
<h1>Login</h1>
    <div class="container">
        <h2 class="text-center">Login</h2>
        <br>
        <form id="loginForm" class="loginForm">
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
            <div class="input-group">
                <label for="remember-me" class="label">Remember Me</label>
                <input type="checkbox" id="remember-me" class="input">
                <span class="error-message"></span>
            </div>
            <br>
            <button class="button" type="submit">Login</button>
        </form>
        <p>Don't have an account? <button class="button" onclick="window.location.hash='#/signup'">Sign Up</button> </p>
    </div>
`; 
const onLoad = () => {
    const form = document.getElementById('loginForm') as HTMLFormElement;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = (document.getElementById('username') as HTMLInputElement).value;
      const password = (document.getElementById('password') as HTMLInputElement).value;
      const rememberMe = (document.getElementById('remember-me') as HTMLInputElement).checked;

      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('token', data.token);
        
        window.location.hash = '#/chat';
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Login failed');
      }
    });
  }
  
  export default { html, onLoad };
