// src/routes/chat.ts 
const html = `
  <div class="chat-wrapper">
    <div class="chat-header">
      <h1 style="margin: 0; font-size: 1.5em;">Chat</h1>
    </div>
    <div id="chat-messages">
    </div>
    <form id="chatForm" class="chat-input-bar">
      <div class="chat-models-panel">
        <div class="chat-models-title">Active models</div>
        <div id="model-selector" class="chat-models-list">
          <label><input type="checkbox" class="model-select" value="qwen2.5:0.5b" checked> qwen2.5:0.5b </label>
          <label><input type="checkbox" class="model-select" value="qwen2.5:1.5b"> qwen2.5:1.5b </label>
          <label><input type="checkbox" class="model-select" value="tinyllama:1.1b"> tinyllama:1.1b </label>
          <label><input type="checkbox" class="model-select" value="qwen2.5:3b"> qwen2.5:3b</label>
          <label><input type="checkbox" class="model-select" value="mistral:7b"> mistral:7b</label>
          <label><input type="checkbox" class="model-select" value="llama3.1:8b"> llama3.1:8b</label>
        </div>
      </div>
      <div class="chat-input-wrap">
        <div class="input-prompt" style="flex: 1;"><textarea id="chat-input" class="input chat-textarea" placeholder="&lt;prompt here&gt;" autocomplete="off" rows="1"></textarea></div>
        <button class="send-btn-inner" type="submit" id="send-btn" title="Send" style="display:none;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
        <button class="stop-btn" type="button" id="stop-btn" style="display:none;" title="Stop">
          <svg class="stop-icon" viewBox="0 0 44 44" width="28" height="28">
            <polygon class="stop-octagon" points="13,2 31,2 42,13 42,31 31,42 13,42 2,31 2,13"/>
            <rect class="stop-square" x="15" y="15" width="14" height="14"/>
          </svg>
        </button>
      </div>
    </form>
  </div>
`;

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

type ModelSelection = { provider?: string; model?: string };
type ChatMessage = { role: string; content: string; modelMetadata?: ModelSelection };
type ModelResponse = { content: string; provider?: string; model?: string; modelMetadata?: ModelSelection };

const copyBtnSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

const modelDisplayName = (model?: ModelSelection | null) => {
  if (!model?.model) return 'LLM';
  return `${model.provider || 'Ollama'} / ${model.model}`;
};

const normalizeModelSelections = (models: unknown): ModelSelection[] => {
  if (!Array.isArray(models)) return [];
  const normalized: ModelSelection[] = [];

  for (const model of models) {
    if (typeof model === 'string') {
      normalized.push({ provider: 'Ollama', model });
      continue;
    }

    if (model && typeof model === 'object' && typeof (model as { model?: unknown }).model === 'string') {
      const raw = model as { provider?: unknown; model: string };
      normalized.push({
        provider: String(raw.provider || 'Ollama'),
        model: String(raw.model),
      });
    }
  }

  return normalized.filter((model) => Boolean(model.model?.trim()));
};

const readCachedDefaultModels = (): ModelSelection[] => {
  try {
    const cached = JSON.parse(localStorage.getItem('userPreferences') || '{}');
    return normalizeModelSelections(cached?.defaultModelSet);
  } catch {
    return [];
  }
};

const onLoad = () => {
  const form = document.getElementById('chatForm') as HTMLFormElement;
  const input = document.getElementById('chat-input') as HTMLTextAreaElement;
  const messages = document.getElementById('chat-messages') as HTMLDivElement;
  const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
  const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
  let isGenerating = false;
  let abortController: AbortController | null = null;
  let currentUserMessage = '';  // track for stop persistence
  const modelInputs = typeof document.querySelectorAll === 'function'
    ? Array.from(document.querySelectorAll<HTMLInputElement>('.model-select'))
    : [];

  const getSelectedModels = () => modelInputs.filter(i => i.checked).map(i => ({ provider: 'Ollama', model: i.value }));

  const ensureModelSelected = () => {
    if (!modelInputs.some(i => i.checked) && modelInputs[0]) modelInputs[0].checked = true;
  };

  const setSelectedModels = (models: ModelSelection[] = []) => {
    const modelNames = new Set(models.map((m) => m.model).filter(Boolean));
    if (!modelNames.size) {
      ensureModelSelected();
      return;
    }
    modelInputs.forEach((i) => {
      i.checked = modelNames.has(i.value);
    });
    ensureModelSelected();
  };

  const renderComparisonGroup = (assistantMessages: ModelResponse[]) => {
    const comparisonGroup = document.createElement('div');
    comparisonGroup.className = 'chat-message llm multi-model-group';
    comparisonGroup.innerHTML = assistantMessages.map((m) => `
      <div class="multi-model-card">
        <button class="bubble-copy-btn" title="Copy">${copyBtnSvg}</button>
        <div class="chat-bubble llm">
          <div class="bubble-role">${escapeHtml(modelDisplayName(m.modelMetadata || { provider: m.provider, model: m.model }))}</div>
          <p class="llm-text">${escapeHtml(m.content || '')}</p>
        </div>
      </div>
    `).join('');
    return comparisonGroup;
  };

  const renderHistoryMessages = (historyMessages: ChatMessage[], fallbackModels: ModelSelection[] = []) => {
    const rendered: string[] = [];
    let i = 0;

    while (i < historyMessages.length) {
      const message = historyMessages[i];
      if (message.role === 'user') {
        rendered.push(
          `<div class="chat-message user"><div class="chat-bubble user"><button class="bubble-copy-btn" title="Copy">${copyBtnSvg}</button><div class="bubble-role">You</div><p>${escapeHtml(message.content)}</p></div></div>`
        );
        i++;
        continue;
      }

      const assistantGroup: ChatMessage[] = [];
      while (i < historyMessages.length && historyMessages[i].role === 'assistant') {
        assistantGroup.push(historyMessages[i]);
        i++;
      }

      if (assistantGroup.length > 1) {
        rendered.push(renderComparisonGroup(assistantGroup).outerHTML);
        continue;
      }

      const singleMessage = assistantGroup[0];
      const fallbackModel = fallbackModels[0];
      const label = modelDisplayName(singleMessage.modelMetadata || fallbackModel);
      rendered.push(
        `<div class="chat-message llm"><button class="bubble-copy-btn" title="Copy">${copyBtnSvg}</button><div class="chat-bubble llm"><div class="bubble-role">${escapeHtml(label)}</div><p class="llm-text">${escapeHtml(singleMessage.content)}</p></div></div>`
      );
    }

    return rendered.join('');
  };

  modelInputs.forEach((i) => i.addEventListener('change', ensureModelSelected));
  ensureModelSelected();

  const applyDefaultModels = async () => {
    if (activeConversationId) return;

    const cachedDefaults = readCachedDefaultModels();
    if (cachedDefaults.length) {
      setSelectedModels(cachedDefaults);
      return;
    }

    try {
      const res = await fetch('/api/users/me', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) return;

      const data = await res.json();
      const defaults = normalizeModelSelections(data?.preferences?.defaultModelSet);
      if (defaults.length) {
        localStorage.setItem('userPreferences', JSON.stringify(data.preferences || {}));
        setSelectedModels(defaults);
      }
    } catch {
      // Leave the first model selected when defaults cannot be loaded.
    }
  };

  // Load current conversation id from hash or start fresh
  let activeConversationId: string | null = new URLSearchParams(location.hash.split('?')[1] || '').get('id');

  // If resuming a previous conversation, fetch its messages
  if (activeConversationId) {
    (async () => {
      const res = await fetch(`/api/conversations/${encodeURIComponent(activeConversationId!)}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedModels(Array.isArray(data.selectedModels) ? data.selectedModels : []);
        if (messages && Array.isArray(data.messages)) {
          messages.innerHTML = renderHistoryMessages(data.messages, data.selectedModels);
          messages.scrollTo(0, messages.scrollHeight);
        }
      }
      // Highlight this conversation in the sidebar
      window.dispatchEvent(new CustomEvent('sidebar:refresh', { detail: { activeId: activeConversationId } }));
    })();
  } else {
    void applyDefaultModels();
  }

  // Auto-resize textarea and show/hide send button
  const resizeInput = () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
    sendBtn.style.display = (!isGenerating && input.value.trim()) ? '' : 'none';

    const parent = input.parentElement as HTMLElement | null;
    if (!parent) return;

    const hasValue = input.value.length > 0;

    // Remove previous markers
    parent.querySelectorAll('.line-marker').forEach(el => el.remove());

    if (!hasValue) return;

    const cs = getComputedStyle(input);
    const lineH = parseFloat(cs.lineHeight);
    const padTop = parseFloat(cs.paddingTop);

    const addMarker = (baseTop: number) => {
      const m = document.createElement('span');
      m.className = 'line-marker';
      m.textContent = '>';
      m.dataset.baseTop = String(baseTop);
      m.style.top = (baseTop - input.scrollTop) + 'px';
      parent.appendChild(m);
    };

    // Always place a marker for line 1
    addMarker(padTop);

    const lines = input.value.split('\n');
    if (lines.length <= 1) return;

    // Clone sized to the textarea's text content width (no padding) so
    // scrollHeight / lineH gives exact visual row count per logical line.
    const contentWidth = input.getBoundingClientRect().width
      - parseFloat(cs.paddingLeft)
      - parseFloat(cs.paddingRight);

    const clone = document.createElement('textarea');
    clone.setAttribute('rows', '1');
    clone.style.cssText =
      `position:fixed;top:-9999px;left:-9999px;visibility:hidden;pointer-events:none;` +
      `width:${contentWidth}px;padding:0;border:0;margin:0;` +
      `box-sizing:content-box;height:auto;overflow:hidden;resize:none;` +
      `font:${cs.font};line-height:${cs.lineHeight};` +
      `letter-spacing:${cs.letterSpacing};word-spacing:${cs.wordSpacing};` +
      `white-space:pre-wrap;word-break:break-word;`;
    document.body.appendChild(clone);

    let prefix = '';
    for (let i = 0; i < lines.length - 1; i++) {
      if (i > 0) prefix += '\n';
      prefix += lines[i];
      clone.value = prefix;
      const cumRows = Math.max(i + 1, Math.round(clone.scrollHeight / lineH));

      addMarker(padTop + cumRows * lineH);
    }

    document.body.removeChild(clone);
  };

  const syncMarkers = () => {
    const parent = input.parentElement;
    if (!parent) return;
    const scrollTop = input.scrollTop;
    parent.querySelectorAll<HTMLElement>('.line-marker').forEach(m => {
      m.style.top = (parseFloat(m.dataset.baseTop || '0') - scrollTop) + 'px';
    });
  };

  input?.addEventListener('input', resizeInput);
  input?.addEventListener('scroll', syncMarkers);

  // Enter submits; Shift+Enter inserts newline with "> " prefix
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form?.requestSubmit();
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      const pos = input.selectionStart ?? input.value.length;
      input.value = input.value.slice(0, pos) + '\n' + input.value.slice(pos);
      input.selectionStart = input.selectionEnd = pos + 1;
      resizeInput();
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isGenerating) return;
    const text = input.value.trim();
    if (!text) return;

    isGenerating = true;
    currentUserMessage = text;
    sendBtn.style.display = 'none';
    stopBtn.style.display = '';
    abortController = new AbortController();

    // Stop the New Chat button glowing once user has sent a message
    document.getElementById('nav-new-chat')?.classList.remove('active');

    // Clear start hint if present
    const hint = messages?.querySelector('.start-hint');
    if (hint) hint.remove();

    const selectedModels = getSelectedModels();

    // Append user bubble
    const userMessage = document.createElement('div');
    userMessage.className = 'chat-message user';
    userMessage.innerHTML = `<div class="chat-bubble user"><button class="bubble-copy-btn" title="Copy">${copyBtnSvg}</button><div class="bubble-role">You</div><p>${escapeHtml(text)}</p></div>`;
    messages?.appendChild(userMessage);
    input.value = '';
    input.style.height = 'auto';
    sendBtn.style.display = 'none';
    messages?.scrollTo(0, messages.scrollHeight);

    // Multi-model path uses non-stream fan-out and renders one bubble per model.
    if (selectedModels.length > 1) {
      const loading = document.createElement('div');
      loading.className = 'chat-message llm';
      loading.innerHTML = `<div class="chat-bubble llm"><div class="bubble-role">Models</div><p><em>Comparing responses...</em></p></div>`;
      messages?.appendChild(loading);
      messages?.scrollTo(0, messages.scrollHeight);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ message: text, conversationId: activeConversationId, selectedModels }),
          signal: abortController!.signal
        });
        const data = await res.json();

        if (data.conversationId && !activeConversationId) {
          activeConversationId = data.conversationId;
          window.dispatchEvent(new CustomEvent('sidebar:refresh', { detail: { activeId: activeConversationId } }));
        }

        loading.remove();

        if (Array.isArray(data.responses)) {
          messages?.appendChild(renderComparisonGroup(data.responses));
        }

        if (Array.isArray(data.errors) && data.errors.length) {
          const errorGroup = document.createElement('div');
          errorGroup.className = 'chat-message llm multi-model-group multi-model-errors';
          errorGroup.innerHTML = data.errors.map((err: { provider: string; model: string; message: string }) => `
            <div class="multi-model-card">
              <div class="chat-bubble llm">
                <div class="bubble-role">${escapeHtml(err.provider)} / ${escapeHtml(err.model)}</div>
                <p><em>${escapeHtml(err.message || 'Model error')}</em></p>
              </div>
            </div>
          `).join('');
          messages?.appendChild(errorGroup);
        }
      } catch (err: any) {
        loading.remove();
        const errorMessage = document.createElement('div');
        errorMessage.className = 'chat-message llm';
        errorMessage.innerHTML = err?.name === 'AbortError'
          ? `<div class="chat-bubble llm"><div class="bubble-role">Models</div><p><em>Response stopped.</em></p></div>`
          : `<div class="chat-bubble llm"><div class="bubble-role">Models</div><p><em>Error getting responses.</em></p></div>`;
        messages?.appendChild(errorMessage);
      }

      isGenerating = false;
      abortController = null;
      resizeInput();
      stopBtn.style.display = 'none';
      messages?.scrollTo(0, messages.scrollHeight);
      return;
    }

    // Single-model path keeps stream UX.
    const activeSingleModel = selectedModels[0];
    const llmMessage = document.createElement('div');
    llmMessage.className = 'chat-message llm';
    llmMessage.innerHTML = `<button class="bubble-copy-btn" title="Copy">${copyBtnSvg}</button><div class="chat-bubble llm"><div class="bubble-role">${escapeHtml(modelDisplayName(activeSingleModel))}</div><div class="thinking-section" style="display:none;"><button class="thinking-toggle" type="button"><span class="spinner"></span> Thinking…</button><div class="thinking-content" style="display:none;"></div></div><div class="llm-spinner"><span class="spinner"></span></div><p class="llm-text"></p></div>`;
    messages?.appendChild(llmMessage);
    const llmBubble = llmMessage.querySelector('.chat-bubble') as HTMLElement;
    messages?.scrollTo(0, messages.scrollHeight);

    const thinkingSection = llmBubble.querySelector('.thinking-section') as HTMLElement;
    const thinkingToggle = llmBubble.querySelector('.thinking-toggle') as HTMLElement;
    const thinkingContent = llmBubble.querySelector('.thinking-content') as HTMLElement;
    const spinnerEl = llmBubble.querySelector('.llm-spinner') as HTMLElement;
    const textEl = llmBubble.querySelector('.llm-text') as HTMLElement;

    // Toggle thinking visibility
    thinkingToggle?.addEventListener('click', () => {
      const isOpen = thinkingContent.style.display !== 'none';
      thinkingContent.style.display = isOpen ? 'none' : 'block';
      thinkingToggle.classList.toggle('open', !isOpen);
    });

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ message: text, conversationId: activeConversationId, selectedModels }),
        signal: abortController!.signal
      });

      if (!res.ok || !res.body) {
        textEl.innerHTML = '<em>Error getting response.</em>';
        spinnerEl.style.display = 'none';
        isGenerating = false;
        abortController = null;
        resizeInput();
        stopBtn.style.display = 'none';
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let inThink = false;
      let thinkText = '';
      let replyText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);

            if (chunk.init) {
              if (chunk.conversationId && !activeConversationId) {
                activeConversationId = chunk.conversationId;
                window.dispatchEvent(new CustomEvent('sidebar:refresh', { detail: { activeId: activeConversationId } }));
              }
              continue;
            }

            if (chunk.done) {
              if (chunk.conversationId && !activeConversationId) {
                activeConversationId = chunk.conversationId;
                window.dispatchEvent(new CustomEvent('sidebar:refresh', { detail: { activeId: activeConversationId } }));
              }
              continue;
            }

            if (chunk.error) {
              textEl.innerHTML = `<em>${escapeHtml(chunk.error)}</em>`;
              continue;
            }

            if (chunk.token) {
              fullContent += chunk.token;

              // Parse thinking vs reply content from accumulated text
              // Re-parse full content each time for correct state
              let tempThink = '';
              let tempReply = '';
              let tempInThink = false;
              let i = 0;
              while (i < fullContent.length) {
                if (!tempInThink && fullContent.startsWith('<think>', i)) {
                  tempInThink = true;
                  i += 7;
                } else if (tempInThink && fullContent.startsWith('</think>', i)) {
                  tempInThink = false;
                  i += 8;
                } else {
                  if (tempInThink) {
                    tempThink += fullContent[i];
                  } else {
                    tempReply += fullContent[i];
                  }
                  i++;
                }
              }

              inThink = tempInThink;
              thinkText = tempThink;
              replyText = tempReply;

              // Update thinking section
              if (thinkText.trim()) {
                thinkingSection.style.display = 'block';
                thinkingContent.textContent = thinkText;
                if (inThink) {
                  thinkingToggle.innerHTML = '<span class="spinner"></span> Thinking…';
                } else {
                  thinkingToggle.textContent = '💭 Thought process';
                }
              }

              // Update reply text
              const trimmed = replyText.trim();
              if (trimmed) {
                spinnerEl.style.display = 'none';
                textEl.textContent = trimmed;
              }

              messages?.scrollTo(0, messages.scrollHeight);
            }
          } catch {}
        }
      }

      // Final cleanup
      spinnerEl.style.display = 'none';
      if (!replyText.trim() && !thinkText.trim()) {
        textEl.innerHTML = '<em>No response.</em>';
      }

    } catch (err: any) {
      spinnerEl.style.display = 'none';
      if (err.name === 'AbortError') {
        // User stopped — show "Response stopped" and save to history
        textEl.textContent = 'Response stopped';
        if (thinkingSection) thinkingSection.style.display = 'none';
        // Persist to server
        try {
          const stopRes = await fetch('/api/chat/stop', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ message: currentUserMessage, conversationId: activeConversationId })
          });
          if (stopRes.ok) {
            const stopData = await stopRes.json();
            if (stopData.conversationId && !activeConversationId) {
              activeConversationId = stopData.conversationId;
            }
          }
        } catch {}
      } else {
        textEl.innerHTML = '<em>Error getting response.</em>';
      }
    }

    isGenerating = false;
    abortController = null;
    resizeInput();
    stopBtn.style.display = 'none';
    messages?.scrollTo(0, messages.scrollHeight);
  });

  // Stop button handler
  stopBtn?.addEventListener('click', () => {
    if (abortController) {
      abortController.abort();
    }
  });

  // Copy button handler (event delegation)
  messages?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.bubble-copy-btn') as HTMLElement | null;
    if (!btn) return;
    const message = btn.closest('.chat-message');
    const bubble = btn.closest('.chat-bubble') || message?.querySelector('.chat-bubble');
    const text = (bubble?.querySelector('.llm-text') || bubble?.querySelector('p'))?.textContent?.trim() ?? '';
    if (!text) return;

    const orig = btn.innerHTML;
    const check = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>`;
    const showCheck = () => { btn.innerHTML = check; setTimeout(() => { btn.innerHTML = orig; }, 1500); };

    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
      showCheck();
    };

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(showCheck).catch(fallback);
    } else {
      fallback();
    }
  });


};

const cleanup = () => {
  // No intervals to clear; form listeners are garbage-collected on innerHTML swap
};

export default { html, onLoad, cleanup };
