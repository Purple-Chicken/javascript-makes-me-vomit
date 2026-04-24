// src/routes/account.ts
const PROFILE_PICS = [
  // 0: default person
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="60" height="60"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>`,
  // 1: robot
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="60" height="60"><rect x="5" y="7" width="14" height="12" rx="2"/><circle cx="9" cy="13" r="1.5"/><circle cx="15" cy="13" r="1.5"/><path d="M9 17h6"/><line x1="12" y1="3" x2="12" y2="7"/><circle cx="12" cy="2" r="1"/></svg>`,
  // 2: cat
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="60" height="60"><path d="M4 10l2-6 4 3h4l4-3 2 6"/><ellipse cx="12" cy="15" rx="7" ry="5"/><circle cx="10" cy="14" r="1"/><circle cx="14" cy="14" r="1"/><path d="M11 16.5l1 0.5 1-0.5"/></svg>`,
];

// Small versions for topbar icon
const PROFILE_PICS_SMALL = [
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><rect x="5" y="7" width="14" height="12" rx="2"/><circle cx="9" cy="13" r="1.5"/><circle cx="15" cy="13" r="1.5"/><path d="M9 17h6"/><line x1="12" y1="3" x2="12" y2="7"/><circle cx="12" cy="2" r="1"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M4 10l2-6 4 3h4l4-3 2 6"/><ellipse cx="12" cy="15" rx="7" ry="5"/><circle cx="10" cy="14" r="1"/><circle cx="14" cy="14" r="1"/><path d="M11 16.5l1 0.5 1-0.5"/></svg>`,
];

const html=`
<h1>Account Settings</h1>
<div class="account-page">

  <!-- PROFILE SECTION -->
  <div class="box-container" style="margin-bottom: 20px;">
    <h2 class="text-center">Profile</h2>

    <div class="input-group">
      <label class="label">Profile Picture</label>
      <div id="profile-pic-chooser" class="profile-pic-row">
        ${PROFILE_PICS.map((svg, i) => `<button class="profile-pic-option" data-pic="${i}" type="button">${svg}</button>`).join('')}
      </div>
    </div>

    <p class="label" style="margin: 20px 0 8px; text-align: left;">Change Username</p>
    <form id="changeUsernameForm">
      <div class="input-group">
        <div class="input-prompt"><input type="text" id="new-username" class="input" autocomplete="off" placeholder="username"></div>
        <span id="username-error" class="error-message"></span>
      </div>
      <button class="button" type="submit">Update Username</button>
    </form>

    <p class="label" style="margin: 28px 0 8px; text-align: left;">Change Password</p>
    <form id="changepwdForm">
      <div class="input-group">
        <div class="input-prompt"><input type="password" id="old-password" class="input" required placeholder="old password"></div>
        <span id="old-error" class="error-message"></span>
      </div>
      <div class="input-group">
        <div class="input-prompt"><input type="password" id="password" class="input" placeholder="new password"></div>
        <span id="password-error" class="error-message"></span>
      </div>
      <div class="input-group">
        <div class="input-prompt"><input type="password" id="password-confirm" class="input" placeholder="confirm password"></div>
        <span id="match-error" class="error-message"></span>
      </div>
      <button class="button" type="submit">Update Password</button>
    </form>
  </div>

  <!-- APPEARANCE SECTION -->
  <div class="box-container" style="margin-bottom: 20px;">
    <h2 class="text-center">Appearance</h2>

    <div class="setting-row">
      <label class="label">Matrix Rain Background</label>
      <label class="toggle-switch">
        <input type="checkbox" id="pref-matrix-rain" checked>
        <span class="toggle-slider"></span>
      </label>
    </div>

    <div class="setting-row">
      <label class="label">Light Mode</label>
      <label class="toggle-switch">
        <input type="checkbox" id="pref-light-mode">
        <span class="toggle-slider"></span>
      </label>
    </div>

    <div class="setting-row" style="flex-direction: column; align-items: flex-start; gap: 8px;">
      <label class="label">Font</label>
      <div id="font-sampler" class="font-sampler-grid">
        <button class="font-option" data-font="ibm-plex" type="button">
          <span class="font-preview" style="font-family: 'IBM Plex Mono', monospace;">SHA-257</span>
          <span class="font-label">Terminal</span>
        </button>
        <button class="font-option" data-font="sans" type="button">
          <span class="font-preview" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">SHA-257</span>
          <span class="font-label">System Sans</span>
        </button>
        <button class="font-option" data-font="serif" type="button">
          <span class="font-preview" style="font-family: Georgia, 'Times New Roman', serif;">SHA-257</span>
          <span class="font-label">Serif</span>
        </button>
        <button class="font-option" data-font="mono" type="button">
          <span class="font-preview" style="font-family: 'Courier New', Courier, monospace;">SHA-257</span>
          <span class="font-label">Monospace</span>
        </button>
      </div>
    </div>

    <div class="setting-row">
      <label class="label">Theme Color</label>
      <div id="theme-color-chooser" class="theme-color-row">
        <button class="theme-swatch" data-color="green" style="background: #00ff00;" type="button"></button>
        <button class="theme-swatch" data-color="blue" style="background: #4488ff;" type="button"></button>
        <button class="theme-swatch" data-color="purple" style="background: #bb66ff;" type="button"></button>
        <button class="theme-swatch" data-color="amber" style="background: #ffaa00;" type="button"></button>
      </div>
    </div>

    <button id="save-appearance-btn" class="button" style="margin-top: 12px; display: none;">Save Appearance</button>
  </div>

  <!-- DANGER ZONE -->
  <div class="box-container">
    <div style="display: flex; gap: 12px; justify-content: center;">
      <button id="logout-btn" class="button">Logout</button>
      <button id="delete-btn" class="button button-danger" style="display: inline-flex; align-items: center; gap: 8px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>Delete My Account</button>
    </div>
  </div>
</div>

<!-- Account deletion confirmation dialog -->
<div id="delete-account-dialog" style="
  display: none; position: fixed; inset: 0; z-index: 100;
  background: rgba(0,0,0,0.7); align-items: center; justify-content: center;
">
  <div class="box-container" style="max-width: 440px;">
    <h2>Delete Account</h2>
    <p style="color: #ff6b6b; font-weight: 600;">Warning: This action is irreversible. All data will be permanently lost.</p>
    <form id="confirmDeleteForm">
      <div class="input-group">
        <div class="input-prompt"><input type="text" id="delete-username" class="input" required placeholder="username"></div>
      </div>
      <br>
      <div class="input-group">
        <div class="input-prompt"><input type="password" id="delete-password" class="input" required placeholder="password"></div>
      </div>
      <span id="delete-error" class="error-message"></span>
      <br>
      <div style="display: flex; gap: 12px; justify-content: center;">
        <button type="submit" class="button button-danger">Yes</button>
        <button type="button" id="cancel-delete-account" class="button">No</button>
      </div>
    </form>
  </div>
</div>
`; 
const onLoad = () => {
    const pwdForm = document.getElementById('changepwdForm') as HTMLFormElement;
    const usernameForm = document.getElementById('changeUsernameForm') as HTMLFormElement;
    const oldPasswordInput = document.getElementById('old-password') as HTMLInputElement;
    const passwordInput = document.getElementById('password') as HTMLInputElement;
    const confirmInput = document.getElementById('password-confirm') as HTMLInputElement;
    const oldError = document.getElementById('old-error');
    const passwordError = document.getElementById('password-error');
    const matchError = document.getElementById('match-error');
    const usernameInput = document.getElementById('new-username') as HTMLInputElement;
    const usernameError = document.getElementById('username-error');
    const deleteBtn = document.getElementById('delete-btn');
    const deleteDialog = document.getElementById('delete-account-dialog');
    const confirmDeleteForm = document.getElementById('confirmDeleteForm') as HTMLFormElement;
    const cancelDeleteBtn = document.getElementById('cancel-delete-account');
    const deleteError = document.getElementById('delete-error');
    const logoutBtn = document.getElementById('logout-btn');
    const saveAppearanceBtn = document.getElementById('save-appearance-btn');
    const matrixRainCheckbox = document.getElementById('pref-matrix-rain') as HTMLInputElement;
    const lightModeCheckbox = document.getElementById('pref-light-mode') as HTMLInputElement;

    let selectedPic = 0;
    let selectedColor = 'green';
    let selectedFont = 'ibm-plex';

    const authHeaders = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
    });

    // Fetch user details and fill fields
    (async () => {
      try {
        const res = await fetch('/api/users/me', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        if (res.ok && typeof res.json === 'function') {
          const user = await res.json();
          if (usernameInput) usernameInput.value = user.username || '';
          selectedPic = user.profilePic ?? 0;
          updatePicSelection(selectedPic);
          const prefs = user.preferences || {};
          if (matrixRainCheckbox) matrixRainCheckbox.checked = prefs.matrixRain !== false;
          if (lightModeCheckbox) lightModeCheckbox.checked = prefs.lightMode === true;
          selectedFont = updateFontSelection(prefs.font || 'ibm-plex');
          selectedColor = prefs.themeColor || 'green';
          updateColorSelection(selectedColor);
        }
      } catch {
        // Ignore bootstrap fetch failures; the form still renders and can be used.
      }
    })();

    // Profile picture chooser
    function updatePicSelection(pic: number) {
        document.querySelectorAll('.profile-pic-option').forEach(btn => {
            btn.classList.toggle('selected', Number((btn as HTMLElement).dataset.pic) === pic);
        });
    }
    document.getElementById('profile-pic-chooser')?.addEventListener('click', async (e) => {
        const btn = (e.target as HTMLElement).closest('.profile-pic-option') as HTMLElement | null;
        if (!btn) return;
        selectedPic = Number(btn.dataset.pic);
        updatePicSelection(selectedPic);
        // Update topbar profile icon
        const topbarProfile = document.getElementById('topbar-profile');
        if (topbarProfile) topbarProfile.innerHTML = PROFILE_PICS_SMALL[selectedPic] || PROFILE_PICS_SMALL[0];
        localStorage.setItem('userProfilePic', String(selectedPic));
        await fetch('/api/users/me', { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ profilePic: selectedPic }) });
    });

    // Theme color chooser
    function updateColorSelection(color: string) {
        document.querySelectorAll('.theme-swatch').forEach(btn => {
            btn.classList.toggle('selected', (btn as HTMLElement).dataset.color === color);
        });
    }
    document.getElementById('theme-color-chooser')?.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.theme-swatch') as HTMLElement | null;
        if (!btn?.dataset.color) return;
        selectedColor = btn.dataset.color;
        updateColorSelection(selectedColor);
        saveAndApplyAppearance();
    });

    // Font sampler click handler
    document.getElementById('font-sampler')?.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.font-option') as HTMLElement | null;
        if (!btn?.dataset.font) return;
      selectedFont = updateFontSelection(btn.dataset.font);
        saveAndApplyAppearance();
    });

    // Helper: gather current prefs, apply instantly, and save to server
    async function saveAndApplyAppearance() {
        const prefs = {
            matrixRain: matrixRainCheckbox?.checked ?? true,
            lightMode: lightModeCheckbox?.checked ?? false,
            font: selectedFont,
            themeColor: selectedColor,
        };
        applyTheme(prefs);
        await fetch('/api/users/me', { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ preferences: prefs }) });
    }

    // Instant-apply listeners for appearance controls
    matrixRainCheckbox?.addEventListener('change', () => saveAndApplyAppearance());
    lightModeCheckbox?.addEventListener('change', () => saveAndApplyAppearance());

    // Username update
    usernameForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newName = usernameInput?.value.trim();
        if (!newName) return;
        const res = await fetch('/api/users/me', { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ username: newName }) });
        if (res.ok) {
            if (usernameError) usernameError.textContent = '';
        } else {
            const data = await res.json();
            if (usernameError) usernameError.textContent = data.error || 'Update failed';
        }
    });

    // Password validation
    const validate = () => {
        let isValid = true;
        if (passwordInput.value && oldPasswordInput.value === passwordInput.value) {
            if (oldError) oldError.textContent = 'New password must be different.';
            isValid = false;
        } else if (oldError) { oldError.textContent = ''; }
        if (passwordInput.value.length > 0 && passwordInput.value.length < 8) {
            if (passwordError) passwordError.textContent = 'Password is too weak (min 8 chars).';
            isValid = false;
        } else if (passwordError) { passwordError.textContent = ''; }
        if (confirmInput.value.length > 0 && passwordInput.value !== confirmInput.value) {
            if (matchError) matchError.textContent = 'Passwords do not match.';
            isValid = false;
        } else if (matchError) { matchError.textContent = ''; }
        return isValid;
    };
    passwordInput?.addEventListener('input', validate);
    confirmInput?.addEventListener('input', validate);

    pwdForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validate()) return;
        const res = await fetch('/api/users/me', {
            method: 'PATCH', headers: authHeaders(),
            body: JSON.stringify({ oldPassword: oldPasswordInput.value, newPassword: passwordInput.value })
        });
        if (res.ok) { pwdForm.reset(); }
        else { const data = await res.json(); if (matchError) matchError.textContent = data.error || 'Update failed'; }
    });

    // Save appearance preferences (fallback button, hidden by default)
    saveAppearanceBtn?.addEventListener('click', async () => {
        await saveAndApplyAppearance();
    });

    // Logout
    logoutBtn?.addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('userPreferences');
        localStorage.removeItem('userProfilePic');
        resetTheme();
        window.location.hash = '#/login';
    });

    // Delete account dialog
    deleteBtn?.addEventListener('click', () => { if (deleteDialog) deleteDialog.style.display = 'flex'; });
    cancelDeleteBtn?.addEventListener('click', () => { if (deleteDialog) deleteDialog.style.display = 'none'; if (deleteError) deleteError.textContent = ''; });

    confirmDeleteForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = (document.getElementById('delete-username') as HTMLInputElement).value;
        const password = (document.getElementById('delete-password') as HTMLInputElement).value;
        const loginCheck = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
        if (!loginCheck.ok) { if (deleteError) deleteError.textContent = 'Incorrect username or password'; return; }
        const response = await fetch('/api/users/me', { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        if (response.ok) {
            localStorage.removeItem('token');
            localStorage.removeItem('userPreferences');
            localStorage.removeItem('userProfilePic');
            if (deleteDialog) deleteDialog.style.display = 'none';
            resetTheme();
            alert('Account deleted successfully.');
            window.location.hash = '#/';
        } else {
            const data = await response.json();
            if (deleteError) deleteError.textContent = data.error || 'Failed to delete account.';
        }
    });
};

function applyTheme(prefs: { matrixRain?: boolean; lightMode?: boolean; font?: string; themeColor?: string }) {
    localStorage.setItem('userPreferences', JSON.stringify(prefs));
    (window as any).__applyTheme?.(prefs);
}

function updateFontSelection(font: string) {
  const normalized = font === 'neo-tech' ? 'ibm-plex' : font;
  document.querySelectorAll('.font-option').forEach(btn => {
    btn.classList.toggle('selected', (btn as HTMLElement).dataset.font === normalized);
  });
  return normalized;
}

function resetTheme() {
    localStorage.removeItem('userPreferences');
    updateFontSelection('ibm-plex');
    (window as any).__applyTheme?.({ matrixRain: true, lightMode: false, font: 'ibm-plex', themeColor: 'green' });
}

export default { html, onLoad }
