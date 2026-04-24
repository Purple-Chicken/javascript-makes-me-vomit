type ModelState = {
  name: string;
  busy: boolean;
  conversationId: string | null;
};

type ConversationStatus = 'idle' | 'running' | 'awaiting-selection' | 'completed' | 'error';

type PendingResponse = {
  model: string;
  status?: 'running' | 'completed' | 'error';
  content?: string;
  error?: string | null;
};

type PendingTurn = {
  mode?: string;
  responses?: PendingResponse[];
};

type ConversationData = {
  id?: string;
  model?: string;
  status?: ConversationStatus;
  lastError?: string | null;
  messages?: Array<{ role: string; model?: string; content: string }>;
  pendingTurn?: PendingTurn | null;
};

const POLL_INTERVAL_MS = 750;
const ASK_ALL_VALUE = '__ask_all__';

const html = `
  <div class="chat-wrapper">
    <div class="chat-header">
      <h1 style="margin: 0; font-size: 1.5em;">Chat</h1>
    </div>
    <div id="chat-status-banner" class="chat-status-banner" style="display:none;"></div>
    <div id="chat-messages"></div>
    <form id="chatForm" class="chat-input-bar">
      <div class="chat-input-wrap">
        <div class="input-prompt" style="flex: 1;"><textarea id="chat-input" class="input chat-textarea" placeholder="&lt;prompt here&gt;" autocomplete="off" rows="1"></textarea></div>
        <div class="chat-model-select-wrap">
          <select id="chat-model-select" class="chat-model-select" aria-label="Select chat model">
            <option value="">Loading models...</option>
          </select>
        </div>
        <button class="send-btn-inner" type="submit" id="send-btn" title="Send" style="display:none;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </form>
  </div>
`;

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

const onLoad = () => {
  const form = document.getElementById('chatForm') as HTMLFormElement | null;
  const input = document.getElementById('chat-input') as HTMLTextAreaElement | null;
  const messages = document.getElementById('chat-messages') as HTMLDivElement | null;
  const modelSelect = document.getElementById('chat-model-select') as HTMLSelectElement | null;
  const sendBtn = document.getElementById('send-btn') as HTMLButtonElement | null;
  const statusBanner = document.getElementById('chat-status-banner') as HTMLDivElement | null;
  if (!form || !input || !messages || !modelSelect || !sendBtn || !statusBanner) {
    return;
  }

  const copyBtnSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  const hashParams = new URLSearchParams(location.hash.split('?')[1] || '');
  let activeConversationId: string | null = hashParams.get('id');
  let selectedModel = hashParams.get('model') || '';
  let currentStatus: ConversationStatus = 'idle';
  let modelStates: ModelState[] = [];
  let pollTimer: number | null = null;
  let renderedSignature = '';

  const authHeaders = (includeJson = false) => {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    };
    if (includeJson) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  };

  const normalizeModelStates = (rawModels: unknown): ModelState[] => {
    if (!Array.isArray(rawModels)) {
      return [];
    }

    return rawModels
      .map((rawModel) => {
        if (typeof rawModel === 'string') {
          return { name: rawModel, busy: false, conversationId: null };
        }
        if (!rawModel || typeof rawModel !== 'object') {
          return null;
        }
        const name = typeof (rawModel as any).name === 'string' ? (rawModel as any).name : '';
        if (!name) {
          return null;
        }
        return {
          name,
          busy: Boolean((rawModel as any).busy),
          conversationId: typeof (rawModel as any).conversationId === 'string' ? (rawModel as any).conversationId : null,
        };
      })
      .filter((model): model is ModelState => Boolean(model));
  };

  const getMessageLabel = (message: { role: string; model?: string }) =>
    message.role === 'user'
      ? 'You'
      : (message.model || (selectedModel && selectedModel !== ASK_ALL_VALUE ? selectedModel : '') || 'LLM');

  const clearPoll = () => {
    if (pollTimer !== null) {
      window.clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  const setBanner = (text = '', tone: 'info' | 'warning' = 'info') => {
    if (!text) {
      statusBanner.style.display = 'none';
      statusBanner.textContent = '';
      statusBanner.dataset.tone = '';
      return;
    }
    statusBanner.style.display = '';
    statusBanner.textContent = text;
    statusBanner.dataset.tone = tone;
  };

  const getCurrentModelState = () => modelStates.find((state) => state.name === selectedModel);
  const getCurrentStatus = () => currentStatus;
  const isBusyElsewhere = (state?: ModelState) =>
    Boolean(state?.busy && state.conversationId && state.conversationId !== activeConversationId);
  const isAskAllSelected = () => selectedModel === ASK_ALL_VALUE;
  const isAskAllUnavailable = () => modelStates.length < 2 || modelStates.some((state) => isBusyElsewhere(state));

  const updateHashForConversation = () => {
    if (!activeConversationId || !window.history?.replaceState) {
      return;
    }
    const nextHash = `#/chat?id=${encodeURIComponent(activeConversationId)}`;
    if (location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash);
    }
  };

  const updateComposerState = () => {
    const currentModelState = getCurrentModelState();
    const lockedElsewhere = isBusyElsewhere(currentModelState);
    const runningHere = currentStatus === 'running';
    const awaitingSelection = currentStatus === 'awaiting-selection';
    const askAllUnavailable = isAskAllSelected() && isAskAllUnavailable();
    const hasModel = Boolean(selectedModel);

    modelSelect.disabled = !modelStates.length || runningHere || awaitingSelection;
    input.disabled = !hasModel || lockedElsewhere || askAllUnavailable || runningHere || awaitingSelection;
    sendBtn.style.display = (!input.disabled && input.value.trim()) ? '' : 'none';

    if (!hasModel) {
      setBanner('No local Ollama models are available.', 'warning');
    } else if (awaitingSelection) {
      setBanner('Choose one response to save it as the main reply for this chat.', 'info');
    } else if (askAllUnavailable) {
      setBanner('Ask all is only available when at least two models are idle.', 'warning');
    } else if (runningHere) {
      setBanner(`${isAskAllSelected() ? 'The selected models are' : selectedModel} generating a response in this chat.`, 'info');
    } else if (lockedElsewhere) {
      setBanner(`${selectedModel} is already generating in another chat. Start a new chat with a different model.`, 'warning');
    } else if (currentStatus === 'error') {
      setBanner('The last response failed. You can try again once this model is available.', 'warning');
    } else {
      setBanner('');
    }
  };

  const renderMessages = (conversation: ConversationData) => {
    const conversationMessages = Array.isArray(conversation.messages) ? conversation.messages : [];
    const pendingResponses = Array.isArray(conversation.pendingTurn?.responses)
      ? conversation.pendingTurn?.responses || []
      : [];
    const signature = JSON.stringify({
      status: conversation.status,
      lastError: conversation.lastError,
      messages: conversationMessages,
      pendingTurn: conversation.pendingTurn,
    });
    if (signature === renderedSignature) {
      return;
    }
    renderedSignature = signature;

    if (!conversationMessages.length) {
      const hintModel = selectedModel
        ? ` for ${escapeHtml(selectedModel === ASK_ALL_VALUE ? 'Ask all models' : selectedModel)}`
        : '';
      messages.innerHTML = `<p class="start-hint">Start a new chat${hintModel}.</p>`;
      return;
    }

    messages.innerHTML = conversationMessages.map((message) => {
      const cls = message.role === 'user' ? 'user' : 'llm';
      const label = getMessageLabel(message);
      const copy = `<button class="bubble-copy-btn" title="Copy">${copyBtnSvg}</button>`;
      const bubbleContent = message.role === 'user'
        ? `<div class="chat-bubble ${cls}">${copy}<div class="bubble-role">${escapeHtml(label)}</div><p>${escapeHtml(message.content)}</p></div>`
        : `${copy}<div class="chat-bubble ${cls}"><div class="bubble-role">${escapeHtml(label)}</div><p class="llm-text">${escapeHtml(message.content)}</p></div>`;
      return `<div class="chat-message ${cls}">${bubbleContent}</div>`;
    }).join('');

    if (pendingResponses.length) {
      const pendingMarkup = pendingResponses.map((response) => {
        const body = response.error
          ? `<p class="llm-text"><em>${escapeHtml(response.error)}</em></p>`
          : response.status === 'running'
            ? `<div class="llm-spinner"><span class="spinner"></span></div><p class="llm-text"><em>Generating response...</em></p>`
            : `<p class="llm-text">${escapeHtml(response.content || 'No response.')}</p>`;
        const chooseButton = response.status === 'completed' && response.content
          ? `<button type="button" class="response-select-btn" data-select-model="${escapeAttr(response.model)}">Use this response</button>`
          : '';
        return `
          <div class="chat-response-option" data-role="candidate-response">
            <div class="chat-bubble llm">
              <div class="bubble-role">${escapeHtml(response.model)}</div>
              ${body}
              ${chooseButton}
            </div>
          </div>`;
      }).join('');
      messages.innerHTML += `<div class="chat-response-options">${pendingMarkup}</div>`;
    }

    if (conversation.status === 'running' && !pendingResponses.length) {
      messages.innerHTML += `
        <div class="chat-message llm">
          <div class="chat-bubble llm">
            <div class="bubble-role">${escapeHtml(selectedModel === ASK_ALL_VALUE ? 'Ask all models' : (selectedModel || conversation.model || 'LLM'))}</div>
            <div class="llm-spinner"><span class="spinner"></span></div>
            <p class="llm-text"><em>Generating response...</em></p>
          </div>
        </div>`;
    }
    messages.scrollTo(0, messages.scrollHeight);
  };

  const renderModelSelect = () => {
    let nextStates = [...modelStates];
    if (selectedModel && selectedModel !== ASK_ALL_VALUE && !nextStates.some((state) => state.name === selectedModel)) {
      nextStates = [{
        name: selectedModel,
        busy: currentStatus === 'running',
        conversationId: activeConversationId,
      }, ...nextStates];
    }
    modelStates = nextStates;

    if (!modelStates.length) {
      modelSelect.innerHTML = '<option value="">No models available</option>';
      selectedModel = '';
      updateComposerState();
      return;
    }

    const unlockedDefault = modelStates.find((state) => !isBusyElsewhere(state))?.name || modelStates[0].name;
    const askAllUnavailable = isAskAllUnavailable();
    const preferredModel = selectedModel === ASK_ALL_VALUE
      ? (askAllUnavailable ? unlockedDefault : ASK_ALL_VALUE)
      : (selectedModel && !isBusyElsewhere(modelStates.find((state) => state.name === selectedModel))
        ? selectedModel
        : unlockedDefault);

    const askAllOption = `<option value="${ASK_ALL_VALUE}"${askAllUnavailable ? ' disabled' : ''}>Ask all models</option>`;
    modelSelect.innerHTML = askAllOption + modelStates.map((state) => {
      const disabled = isBusyElsewhere(state) && state.name !== selectedModel;
      const label = disabled ? `${state.name} (busy)` : state.name;
      return `<option value="${escapeAttr(state.name)}"${disabled ? ' disabled' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
    modelSelect.value = preferredModel;
    selectedModel = modelSelect.value;
    updateComposerState();
  };

  const loadModelStates = async () => {
    try {
      const res = await fetch('/api/chat/models', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        modelStates = normalizeModelStates(data.models);
      }
    } catch {}
    renderModelSelect();
  };

  const fetchConversation = async () => {
    if (!activeConversationId) {
      currentStatus = 'idle';
      renderedSignature = '';
      renderMessages({ messages: [] });
      updateComposerState();
      return;
    }

    const res = await fetch(`/api/conversations/${encodeURIComponent(activeConversationId)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      currentStatus = 'error';
      setBanner('Failed to load this conversation.', 'warning');
      updateComposerState();
      return;
    }

    const data = await res.json() as ConversationData;
    if (data.pendingTurn?.mode === 'ask-all') {
      selectedModel = ASK_ALL_VALUE;
    }
    if (typeof data.model === 'string' && data.model) {
      selectedModel = data.model;
    }
    currentStatus = data.status || 'completed';
    renderMessages(data);
    updateComposerState();
    if (currentStatus !== 'running') {
      await loadModelStates();
    }
  };

  const pollConversation = (delay = POLL_INTERVAL_MS) => {
    clearPoll();
    pollTimer = window.setTimeout(async () => {
      await fetchConversation();
      if (currentStatus === 'running') {
        pollConversation(POLL_INTERVAL_MS);
      }
    }, delay) as unknown as number;
  };

  const resizeInput = () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
    sendBtn.style.display = (!input.disabled && input.value.trim()) ? '' : 'none';

    const parent = input.parentElement as HTMLElement | null;
    if (!parent) return;

    const hasValue = input.value.length > 0;
    parent.querySelectorAll('.line-marker').forEach((element) => element.remove());
    if (!hasValue) return;

    const cs = getComputedStyle(input);
    const lineH = parseFloat(cs.lineHeight);
    const padTop = parseFloat(cs.paddingTop);

    const addMarker = (baseTop: number) => {
      const marker = document.createElement('span');
      marker.className = 'line-marker';
      marker.textContent = '>';
      marker.dataset.baseTop = String(baseTop);
      marker.style.top = (baseTop - input.scrollTop) + 'px';
      parent.appendChild(marker);
    };

    addMarker(padTop);
    const lines = input.value.split('\n');
    if (lines.length <= 1) return;

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
      const cumulativeRows = Math.max(i + 1, Math.round(clone.scrollHeight / lineH));
      addMarker(padTop + cumulativeRows * lineH);
    }

    document.body.removeChild(clone);
  };

  const syncMarkers = () => {
    const parent = input.parentElement;
    if (!parent) return;
    const scrollTop = input.scrollTop;
    parent.querySelectorAll<HTMLElement>('.line-marker').forEach((marker) => {
      marker.style.top = (parseFloat(marker.dataset.baseTop || '0') - scrollTop) + 'px';
    });
  };

  input.addEventListener('input', resizeInput);
  input.addEventListener('scroll', syncMarkers);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      const pos = input.selectionStart ?? input.value.length;
      input.value = input.value.slice(0, pos) + '\n' + input.value.slice(pos);
      input.selectionStart = input.selectionEnd = pos + 1;
      resizeInput();
    }
  });

  modelSelect.addEventListener('change', () => {
    selectedModel = modelSelect.value;
    updateComposerState();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (currentStatus === 'running' || currentStatus === 'awaiting-selection') return;
    const text = input.value.trim();
    const requestedModel = modelSelect.value || selectedModel;
    if (!text || !requestedModel) return;
    selectedModel = requestedModel;
    if (requestedModel === ASK_ALL_VALUE && isAskAllUnavailable()) {
      updateComposerState();
      return;
    }

    sendBtn.style.display = 'none';
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({
        message: text,
        conversationId: activeConversationId,
        model: requestedModel,
      }),
    });

    if (res.status === 409) {
      await loadModelStates();
      const data = await res.json().catch(() => ({}));
      setBanner(`${requestedModel} is already generating in another chat.`, 'warning');
      if (typeof data.activeConversationId === 'string') {
        const currentState = modelStates.find((state) => state.name === requestedModel);
        if (currentState) {
          currentState.busy = true;
          currentState.conversationId = data.activeConversationId;
        }
      }
      updateComposerState();
      return;
    }

    if (!res.ok) {
      setBanner('Error starting the chat.', 'warning');
      updateComposerState();
      return;
    }

    const data = await res.json() as { conversationId?: string; model?: string; status?: 'running'; mode?: string };
    activeConversationId = data.conversationId || activeConversationId;
    selectedModel = data.mode === 'ask-all' ? ASK_ALL_VALUE : (data.model || selectedModel);
    currentStatus = data.status || 'running';
    input.value = '';
    input.style.height = 'auto';
    renderedSignature = '';
    document.getElementById('nav-new-chat')?.classList.remove('active');
    updateHashForConversation();
    window.dispatchEvent(new CustomEvent('sidebar:refresh', { detail: { activeId: activeConversationId } }));
    await loadModelStates();
    await fetchConversation();
    if (currentStatus === 'running') {
      pollConversation(0);
    }
  });

  messages.addEventListener('click', (e) => {
    const selectResponseBtn = (e.target as HTMLElement).closest('[data-select-model]') as HTMLButtonElement | null;
    if (selectResponseBtn && activeConversationId) {
      const model = selectResponseBtn.dataset.selectModel;
      if (!model) {
        return;
      }

      void (async () => {
        const res = await fetch(`/api/conversations/${encodeURIComponent(activeConversationId!)}/select-response`, {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify({ model }),
        });
        if (!res.ok) {
          setBanner('Failed to save the selected response.', 'warning');
          return;
        }

        const data = await res.json() as ConversationData;
        selectedModel = typeof data.model === 'string' && data.model ? data.model : model;
        currentStatus = data.status || 'completed';
        renderedSignature = '';
        renderMessages(data);
        updateComposerState();
        window.dispatchEvent(new CustomEvent('sidebar:refresh', { detail: { activeId: activeConversationId } }));
        await loadModelStates();
      })();
      return;
    }

    const btn = (e.target as HTMLElement).closest('.bubble-copy-btn') as HTMLElement | null;
    if (!btn) return;
    const message = btn.closest('.chat-message');
    const bubble = message?.querySelector('.chat-bubble');
    const text = (bubble?.querySelector('.llm-text') || bubble?.querySelector('p'))?.textContent?.trim() ?? '';
    if (!text) return;

    const original = btn.innerHTML;
    const check = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>`;
    const showCheck = () => {
      btn.innerHTML = check;
      setTimeout(() => {
        btn.innerHTML = original;
      }, 1500);
    };

    const fallback = () => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(textarea);
      showCheck();
    };

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(showCheck).catch(fallback);
    } else {
      fallback();
    }
  });

  void (async () => {
    await loadModelStates();
    await fetchConversation();
    if (getCurrentStatus() === 'running') {
      pollConversation(POLL_INTERVAL_MS);
    }
    resizeInput();
  })();

  (window as any).__chatCleanup = clearPoll;
};

const cleanup = () => {
  (window as any).__chatCleanup?.();
};

export default { html, onLoad, cleanup };
