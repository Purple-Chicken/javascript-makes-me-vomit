// src/routes/account.ts
const html=`
<h1>Account Settings</h1>
    <div class="box-container">
        <h2 id="welcome-header" class="text-center">Account</h2>
        <br>
        <form id="changepwdForm" class="changepwdForm">
            <div class="input-group">
                <label for="old-password" class="label">Old Password</label>
                <input type="password" id="old-password" class="input" required>
                <span id="old-error" class="error-message"></span>
            </div>
            <br>
            <div class="input-group">
                <label for="password" class="label">New Password</label>
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
            <button class="button" type="submit">Update Password</button>
        </form>
        <br> 
        <div class="danger-zone" style="border-top: 1px solid #444; margin-top: 20px; padding-top: 20px;">
            <button id="delete-btn" class="button button-danger" style="background-color: #ff4444;">Delete My Account</button>
        </div>
    </div>
`; 
const onLoad = () => {
    const form = document.getElementById('changepwdForm') as HTMLFormElement;
    const oldPasswordInput = document.getElementById('old-password') as HTMLInputElement;
    const passwordInput = document.getElementById('password') as HTMLInputElement;
    const confirmInput = document.getElementById('password-confirm') as HTMLInputElement;
    const oldError = document.getElementById('old-error');
    const passwordError = document.getElementById('password-error');
    const matchError = document.getElementById('match-error');
    const header = document.getElementById('welcome-header');
    const deleteBtn = document.getElementById('delete-btn');

    // Fetch user details for the header
    (async () => {
        const res = await fetch('/api/users/me', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (res.ok && header) {
            const user = await res.json();
            header.textContent = `Username: ${user.username}`;
        }
    })();

    const validate = () => {
      let isValid = true;
      // Check if new same as old
      if (passwordInput.value && oldPasswordInput.value === passwordInput.value) {
          if (oldError) oldError.textContent = 'New password must be different.';
          isValid = false;
      } else if (oldError) { oldError.textContent = ''; }

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
    form?.addEventListener('submit', async (e) => {

        e.preventDefault();
        if (!validate()) return;

        const response = await fetch('/api/users/me', {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ 
                oldPassword: oldPasswordInput.value, 
                newPassword: passwordInput.value 
            })
        });

        if (response.ok) {
            alert('Password updated!');
            form.reset();
        } else {
            const data = await response.json();
            alert(data.error || 'Update failed');
        }
    });
    deleteBtn?.addEventListener('click', async () => {
        const confirmed = window.confirm(
            "Are you sure you want to delete your account? This action is permanent and all data will be lost."
        );

        if (confirmed) {
            const response = await fetch('/api/users/me', {
                method: 'DELETE',
                headers: { 
                    'Authorization': `Bearer ${localStorage.getItem('token')}` 
                }
            });

            if (response.ok) {
                // Remove the JWT so the router knows we are logged out
                localStorage.removeItem('token');
                alert('Account deleted successfully.');
                window.location.hash = '#/';
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to delete account.');
            }
        }
    });
  }
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
        const errorData = await response.json();
        alert(errorData.error || 'Signup failed');
      }
    });
  };
export default { html, onLoad }
