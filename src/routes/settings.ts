// src/routes/settings.ts
const html = `
  <h1>Settings</h1>
  <div class="box-container" style="max-width: 720px; text-align: left;">
    <h2 style="margin-top: 0;">Model Preferences</h2>
    <p style="color: var(--text-muted); margin-top: 6px;">Choose your default model for new chats.</p>
    <div class="setting-row" style="margin-top: 18px;">
      <label class="label" for="settings-model-category">Model source</label>
      <select id="settings-model-category" class="input" style="max-width: 220px;">
        <option value="local">Local</option>
        <option value="cloud">Cloud</option>
      </select>
    </div>
    <div class="setting-row" style="margin-top: 10px; align-items: flex-start;">
      <label class="label" for="settings-default-model" style="margin-top: 10px;">Default model</label>
      <select id="settings-default-model" class="input" style="max-width: 320px;"></select>
    </div>
    <p id="settings-model-warning" class="error-message" style="display:none; margin-top: 10px;"></p>
    <h2 style="margin-top: 22px;">Theme</h2>
    <p style="color: var(--text-muted); margin-top: 6px;">Pick a UI color theme. Hover a swatch to preview.</p>
    <div id="settings-theme-swatches" class="theme-color-row" style="margin-top: 8px;">
      <button class="theme-swatch" data-color="green" style="background: #00ff00;" type="button" title="Green"></button>
      <button class="theme-swatch" data-color="blue" style="background: #4488ff;" type="button" title="Blue"></button>
      <button class="theme-swatch" data-color="purple" style="background: #bb66ff;" type="button" title="Purple"></button>
      <button class="theme-swatch" data-color="amber" style="background: #ffaa00;" type="button" title="Amber"></button>
    </div>
    <div style="display:flex; gap: 10px; margin-top: 18px; justify-content: flex-end;">
      <button id="settings-refresh-models" class="button" type="button">Refresh Models</button>
      <button id="settings-save" class="button" type="button">Save</button>
    </div>
    <p id="settings-status" style="margin-top: 12px; color: var(--text-muted);"></p>
  </div>
`;

type ModelDto = {
  id: string;
  label: string;
  provider: string;
  category: 'local' | 'cloud';
  requiresApiKey?: boolean;
  available?: boolean;
  envVar?: string;
};

const onLoad = () => {
  const token = localStorage.getItem('token');
  const categorySelect = document.getElementById('settings-model-category') as HTMLSelectElement;
  const modelSelect = document.getElementById('settings-default-model') as HTMLSelectElement;
  const warning = document.getElementById('settings-model-warning') as HTMLElement;
  const themeSwatches = document.getElementById('settings-theme-swatches') as HTMLElement;
  const saveBtn = document.getElementById('settings-save') as HTMLButtonElement;
  const refreshBtn = document.getElementById('settings-refresh-models') as HTMLButtonElement;
  const status = document.getElementById('settings-status') as HTMLElement;

  if (!categorySelect || !modelSelect || !warning || !saveBtn || !refreshBtn || !status) {
    return;
  }

  let models: ModelDto[] = [];
  let selectedCategory: 'local' | 'cloud' = 'local';
  let selectedModelId = 'qwen3:0.5b';
  let selectedThemeColor = 'green';

  const currentPrefs = () => {
    try {
      return JSON.parse(localStorage.getItem('userPreferences') || '{}') as {
        matrixRain?: boolean;
        lightMode?: boolean;
        font?: string;
        themeColor?: string;
      };
    } catch {
      return {};
    }
  };

  const setThemeSelection = (color: string) => {
    selectedThemeColor = color;
    themeSwatches?.querySelectorAll('.theme-swatch').forEach((node) => {
      (node as HTMLElement).classList.toggle('selected', (node as HTMLElement).dataset.color === color);
    });
  };

  const applyThemePreview = (color: string) => {
    const prefs = { ...currentPrefs(), themeColor: color };
    (window as any).__applyTheme?.(prefs);
  };

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  });

  const renderModelOptions = () => {
    const filtered = models.filter((m) => m.category === selectedCategory);
    if (!filtered.length) {
      modelSelect.innerHTML = '<option value="">No models found</option>';
      warning.style.display = 'none';
      return;
    }

    modelSelect.innerHTML = filtered
      .map((m) => `<option value="${m.id}">${m.label}${m.available === false ? ' (missing key)' : ''}</option>`)
      .join('');

    if (!filtered.some((m) => m.id === selectedModelId)) {
      selectedModelId = filtered[0].id;
    }
    modelSelect.value = selectedModelId;

    const selected = filtered.find((m) => m.id === selectedModelId);
    if (selected?.available === false) {
      warning.textContent = `${selected.id} requires ${selected.envVar || 'API credentials'}.`;
      warning.style.display = '';
    } else {
      warning.style.display = 'none';
    }
  };

  const load = async () => {
    status.textContent = 'Loading settings...';
    const [modelsRes, settingsRes, profileRes] = await Promise.all([
      fetch('/api/models', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/settings/me', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/users/me', { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    if (!modelsRes.ok) {
      status.textContent = 'Failed to load models.';
      return;
    }

    models = await modelsRes.json();

    if (settingsRes.ok) {
      const data = await settingsRes.json();
      selectedCategory = data.modelCategory === 'cloud' ? 'cloud' : 'local';
      selectedModelId = data.defaultModel || selectedModelId;
    }

    if (profileRes.ok) {
      const profile = await profileRes.json();
      selectedThemeColor = profile?.preferences?.themeColor || selectedThemeColor;
    }

    categorySelect.value = selectedCategory;
    renderModelOptions();
    setThemeSelection(selectedThemeColor);
    applyThemePreview(selectedThemeColor);
    status.textContent = '';
  };

  categorySelect.addEventListener('change', () => {
    selectedCategory = categorySelect.value === 'cloud' ? 'cloud' : 'local';
    renderModelOptions();
  });

  modelSelect.addEventListener('change', () => {
    selectedModelId = modelSelect.value;
    renderModelOptions();
  });

  themeSwatches?.addEventListener('mouseover', (e) => {
    const swatch = (e.target as HTMLElement).closest('.theme-swatch') as HTMLElement | null;
    if (!swatch?.dataset.color) return;
    applyThemePreview(swatch.dataset.color);
  });

  themeSwatches?.addEventListener('mouseout', () => {
    applyThemePreview(selectedThemeColor);
  });

  themeSwatches?.addEventListener('click', (e) => {
    const swatch = (e.target as HTMLElement).closest('.theme-swatch') as HTMLElement | null;
    if (!swatch?.dataset.color) return;
    setThemeSelection(swatch.dataset.color);
    applyThemePreview(selectedThemeColor);
  });

  refreshBtn.addEventListener('click', () => {
    load().catch(() => {
      status.textContent = 'Failed to refresh models.';
    });
  });

  saveBtn.addEventListener('click', async () => {
    status.textContent = 'Saving...';
    const settingsRes = await fetch('/api/settings/me', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ defaultModel: selectedModelId, modelCategory: selectedCategory }),
    });

    const prefs = { ...currentPrefs(), themeColor: selectedThemeColor };
    const themeRes = await fetch('/api/users/me', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ preferences: prefs }),
    });

    if (!settingsRes.ok || !themeRes.ok) {
      const data = await settingsRes.json().catch(() => ({}));
      status.textContent = data.error || 'Failed to save settings.';
      return;
    }

    localStorage.setItem('defaultModel', selectedModelId);
    localStorage.setItem('defaultModelCategory', selectedCategory);
    localStorage.setItem('userPreferences', JSON.stringify(prefs));
    (window as any).__applyTheme?.(prefs);
    status.textContent = 'Settings saved.';
  });

  load().catch(() => {
    status.textContent = 'Failed to load settings.';
  });
};

export default { html, onLoad };
