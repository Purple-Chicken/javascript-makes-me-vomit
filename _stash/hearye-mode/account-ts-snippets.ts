// ── HEARYE MODE STASH ──
// Extracted from src/routes/account.ts
// Re-integrate by adding these pieces back.

// ── HTML (in the Appearance section, after Light Mode row) ──
/*
    <div class="setting-row">
      <label class="label" data-dark-label="Hear-ye Hear-ye" data-light-label="Hear-ye Hear-ye">Hear-ye Hear-ye</label>
      <label class="toggle-switch">
        <input type="checkbox" id="pref-hearye">
        <span class="toggle-slider"></span>
      </label>
    </div>
*/

// Also: re-add data-dark-label / data-light-label attributes to other setting-row labels:
// <label class="label" data-dark-label="Matrix Rain Background" data-light-label="Typewriter Background">Matrix Rain Background</label>
// Font option labels:
// <span class="font-label" data-dark-label="Terminal" data-light-label="Typewriter">Terminal</span>
// <span class="font-label" data-dark-label="System Sans" data-light-label="Modernist">System Sans</span>
// <span class="font-label" data-dark-label="Serif" data-light-label="Old Style">Serif</span>
// <span class="font-label" data-dark-label="Monospace" data-light-label="Manuscript">Monospace</span>

// ── onLoad: variable declaration (after lightModeCheckbox) ──
const hearyeCheckbox = document.getElementById('pref-hearye') as HTMLInputElement;

// ── updateFontLabels function ──
function updateFontLabels() {
    const isHearye = document.body.classList.contains('hearye-mode');
    document.querySelectorAll<HTMLElement>('[data-dark-label]').forEach(el => {
        el.textContent = isHearye ? (el.dataset.lightLabel ?? '') : (el.dataset.darkLabel ?? '');
    });
}

// ── In the async IIFE that fetches user data, after lightModeCheckbox.checked: ──
if (hearyeCheckbox) hearyeCheckbox.checked = !!prefs.hearye;
// and after updateFontSelection:
updateFontLabels();

// ── In saveAndApplyAppearance, add hearye to prefs object: ──
// hearye: hearyeCheckbox?.checked ?? false,
// and call updateFontLabels() after applyTheme(prefs):
// updateFontLabels();

// ── Event listener (after lightModeCheckbox listener) ──
hearyeCheckbox?.addEventListener('change', () => saveAndApplyAppearance());

// ── applyTheme function signature — add hearye param: ──
function applyTheme(prefs: { matrixRain?: boolean; lightMode?: boolean; hearye?: boolean; font?: string; themeColor?: string }) {
    localStorage.setItem('userPreferences', JSON.stringify(prefs));
    (window as any).__applyTheme?.(prefs);
}
