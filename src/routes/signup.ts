// src/routes/signup.ts
const html=`
    <div class="box-container" style="display: flex; flex-direction: column;">
        <h1>Sign Up</h1>
        <div id="signup-success" style="display:none; text-align:center; padding: 12px 0;">
          <p style="color: var(--accent, #4dff91); font-size: 0.95em; margin: 0 0 6px;">Account created successfully.</p>
          <p style="opacity: 0.5; font-size: 0.78em; margin: 0;">Redirecting to login...</p>
        </div>
        <form id="signupForm" class="signupForm">
            <div class="input-group">
                <div class="input-prompt"><input type="text" id="username" class="input" placeholder="username"></div>
                <span class="error-message"></span>
            </div>
            <br>
            <div class="input-group">
                <div class="input-prompt"><input type="password" id="password" class="input" placeholder="password"></div>
                <span id="password-error" class="error-message"></span>
            </div>
            <br>
            <div class="input-group">
                <div class="input-prompt"><input type="password" id="password-confirm" class="input" placeholder="confirm password"></div>
                <span id="match-error" class="error-message"></span>
            </div>
            <br>
            <button class="button" type="submit" style="width: 100%;">Sign Up</button>
        </form>
        <p style="margin-top: auto; padding-top: 24px; font-size: 0.78em; opacity: 0.6; text-align: center;">Already have an account? <a href="#" onclick="window.location.hash='#/login'; return false;" style="color: var(--accent, #4dff91); text-decoration: none; opacity: 1;">Sign In</a></p>
    </div>
`;
const onLoad = () => {
    const form = document.getElementById('signupForm') as HTMLFormElement;
  const successPanel = document.getElementById('signup-success') as HTMLElement | null;
  const browserSessionStorage = typeof sessionStorage !== 'undefined' ? sessionStorage : null;
    const passwordInput = document.getElementById('password') as HTMLInputElement;
    const confirmInput = document.getElementById('password-confirm') as HTMLInputElement;
    const passwordError = document.getElementById('password-error');
    const matchError = document.getElementById('match-error');

    const validate = () => {
      let isValid = true;
      if (passwordInput.value.length > 0 && passwordInput.value.length < 8) {
        if (passwordError) passwordError.textContent = 'Password is too weak (min 8 chars).';
        isValid = false;
      } else if (passwordError) {
        passwordError.textContent = '';
      }
      if (confirmInput.value.length > 0 && passwordInput.value !== confirmInput.value) {
        if (matchError) matchError.textContent = 'Passwords do not match.';
        isValid = false;
      } else if (matchError) {
        matchError.textContent = '';
      }
      return isValid;
    };

    passwordInput?.addEventListener('input', validate);
    confirmInput?.addEventListener('input', validate);

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!validate()) return;

      const username = (document.getElementById('username') as HTMLInputElement).value;
      const password = passwordInput.value;

      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (response.ok) {
        if ((form as any)?.style) {
          (form as any).style.display = 'none';
        }
        if (successPanel?.style) {
          successPanel.style.display = 'block';
        }
        browserSessionStorage?.setItem('prefill-username', username);
        setTimeout(() => { window.location.hash = '#/login'; }, 2000);
      } else {
        let message = 'Signup failed';
        try {
          const errorData = await response.json();
          if (typeof errorData?.error === 'string' && errorData.error.trim()) {
            message = errorData.error;
          }
        } catch {
          // Keep generic message when response body is not valid JSON.
        }
        alert(message);
      }
    });
  };
export default { html, onLoad }
