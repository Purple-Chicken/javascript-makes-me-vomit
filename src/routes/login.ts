// src/routes/login.ts


const html=`
    <div class="box-container" style="display: flex; flex-direction: column;">
        <h1>Login</h1>
        <form id="loginForm" class="loginForm">
            <div class="input-group">
                <div class="input-prompt"><input type="text" id="username" class="input" placeholder="username"></div>
                <span class="error-message"></span>
            </div>
            <br>
            <div class="input-group">
                <div class="input-prompt"><input type="password" id="password" class="input" placeholder="password"></div>
                <span class="error-message"></span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin: 10px 0 20px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="remember-me" style="width: auto; margin: 0;">
                    <label for="remember-me" class="label" style="margin: 0; font-size: 0.85em; opacity: 0.7;">Remember Me</label>
                </div>
                <a href="#" id="forgot-password" style="color: var(--accent, #4dff91); opacity: 0.6; font-size: 0.78em; text-decoration: none;">Forgot password?</a>
            </div>
            <button class="button" type="submit" style="width: 100%;">Login</button>
        </form>
        <p style="margin-top: auto; padding-top: 24px; font-size: 0.78em; opacity: 0.6; text-align: center;">Don't have an account? <a href="#" onclick="window.location.hash='#/signup'; return false;" style="color: var(--accent, #4dff91); text-decoration: none; opacity: 1;">Sign Up</a></p>
    </div>
`;
const onLoad = () => {
    const form = document.getElementById('loginForm') as HTMLFormElement;
    const browserSessionStorage = typeof sessionStorage !== 'undefined' ? sessionStorage : null;

    const prefill = browserSessionStorage?.getItem('prefill-username');
    if (prefill) {
      const usernameInput = document.getElementById('username') as HTMLInputElement | null;
      if (usernameInput) {
        usernameInput.value = prefill;
      }
      browserSessionStorage?.removeItem('prefill-username');
    }

    document.getElementById('forgot-password')?.addEventListener('click', (e) => {
      e.preventDefault();
      alert('womp womp');
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = (document.getElementById('username') as HTMLInputElement).value;
      const password = (document.getElementById('password') as HTMLInputElement).value;
      const rememberMe = (document.getElementById('remember-me') as HTMLInputElement | null)?.checked ?? false;

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
