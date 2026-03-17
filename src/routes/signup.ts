// src/routes/signup.ts
const html=`
<h1>Sign Up</h1>
    <div class="container">
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
                <span id="password-error" class="error-message"></span>
            </div>
            <br>
            <div class="input-group">
                <label for="password-confirm" class="label">Confirm Password</label>
                <input type="password" id="password-confirm" class="input">
                <span id="match-error" class="error-message"></span>
            </div>
            <br>
            <button class="button" type="submit">Sign Up</button>
        </form>
        <p>Already have an account? <button class="button" onclick="window.location.hash='#/login'">Sign In</button> </p>
    </div>
`; 
const onLoad = () => {
    const form = document.getElementById('signupForm') as HTMLFormElement;
    const passwordInput = document.getElementById('password') as HTMLInputElement;
    const confirmInput = document.getElementById('password-confirm') as HTMLInputElement;
    const passwordError = document.getElementById('password-error');
    const matchError = document.getElementById('match-error');

    const validate = () => {
      let isValid = true;
      // Strength check (8 characters minimum)
      if (passwordInput.value.length > 0 && passwordInput.value.length < 8) {
        if (passwordError) passwordError.textContent = 'Password is too weak (min 8 chars).';
        isValid = false;
      } else if (passwordError) {
        passwordError.textContent = '';
      }
      // Match check
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
        alert('Account created! Please log in.');
        window.location.hash = '#/login';
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
