// src/routes/login.ts


const html=`
<h1>Login</h1>
    <div class="container">
        <h2 class="text-center">Login</h2>
        <br>
        <form id="loginForm class="loginForm">
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
            <button class="button" type="submit">Login</button>
        </form>
        <a href="#/signup">Sign Up</a>
    </div>
`; 
const onLoad = () => {
    const form = document.getElementById('loginForm') as HTMLFormElement;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = (document.getElementById('username') as HTMLInputElement).value;
      const password = (document.getElementById('password') as HTMLInputElement).value;

      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (response.ok) {
        window.location.hash = '#/chat';
      } else {
        alert('Login failed');
      }
    });
  }
  
  export default { html, onLoad };
