// src/routes/settings.ts 
//
// A toggleable sidebar with various settings. Never displayed as a main page. 
const html = `
  <h1>Settings</h1>
  <p>Switches and knobs to make your experience at home.</p>
  <div id="settings-container">
    <div class="setting-group">
      <label for="multiLLM">Enable Multi-LLM Chat:</label>
      <input type="checkbox" id="multiLLM">
    </div>
    <div class="setting-group" id="llm-models" style="display: none;">
      <label>LLM Models:</label>
      <select id="llm1">
        <option value="qwen3:8b">Qwen 3 8B</option>
        <option value="llama3:8b">Llama 3 8B</option>
        <option value="mistral:7b">Mistral 7B</option>
      </select>
      <select id="llm2">
        <option value="qwen3:8b">Qwen 3 8B</option>
        <option value="llama3:8b">Llama 3 8B</option>
        <option value="mistral:7b">Mistral 7B</option>
      </select>
      <select id="llm3">
        <option value="qwen3:8b">Qwen 3 8B</option>
        <option value="llama3:8b">Llama 3 8B</option>
        <option value="mistral:7b">Mistral 7B</option>
      </select>
    </div>
    <button id="save-settings">Save Settings</button>
  </div>
`;

const onLoad = () => {
  const multiLLMCheckbox = document.getElementById('multiLLM') as HTMLInputElement;
  const llmModelsDiv = document.getElementById('llm-models') as HTMLDivElement;
  const saveBtn = document.getElementById('save-settings') as HTMLButtonElement;
  const llm1 = document.getElementById('llm1') as HTMLSelectElement;
  const llm2 = document.getElementById('llm2') as HTMLSelectElement;
  const llm3 = document.getElementById('llm3') as HTMLSelectElement;

  // Load current settings
  fetch('/api/settings', {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  }).then(res => res.json()).then(settings => {
    multiLLMCheckbox.checked = settings.multiLLM || false;
    llmModelsDiv.style.display = multiLLMCheckbox.checked ? 'block' : 'none';
    if (settings.llmModels && settings.llmModels.length >= 3) {
      llm1.value = settings.llmModels[0];
      llm2.value = settings.llmModels[1];
      llm3.value = settings.llmModels[2];
    }
  });

  multiLLMCheckbox.addEventListener('change', () => {
    llmModelsDiv.style.display = multiLLMCheckbox.checked ? 'block' : 'none';
  });

  saveBtn.addEventListener('click', () => {
    const data = {
      multiLLM: multiLLMCheckbox.checked,
      llmModels: multiLLMCheckbox.checked ? [llm1.value, llm2.value, llm3.value] : []
    };
    fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(data)
    }).then(res => {
      if (res.ok) {
        alert('Settings saved!');
      } else {
        alert('Failed to save settings.');
      }
    });
  });
};

export default { html, onLoad };
