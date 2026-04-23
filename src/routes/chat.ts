// src/routes/chat.ts 
const html = `
  <div class="chat-wrapper">
    <div class="chat-header">
      <h1 style="margin: 0; font-size: 1.5em;">Chat</h1>
    </div>
    <div class="chat-controls">
      <div class="chat-model-panel">
        <div class="chat-model-label">Models</div>
        <div id="chat-models" class="chat-model-options">
          <span class="chat-model-hint">Loading available models...</span>
        </div>
      </div>
    </div>
    <div id="chat-messages">
    </div>
    <form id="chatForm" class="chat-input-bar">
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

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

const onLoad = () => {
  const form = document.getElementById('chatForm') as HTMLFormElement;
  const input = document.getElementById('chat-input') as HTMLTextAreaElement;
  const messages = document.getElementById('chat-messages') as HTMLDivElement;
  const modelContainer = document.getElementById('chat-models') as HTMLDivElement | null;
  const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
  const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
  let isGenerating = false;
  let abortController: AbortController | null = null;
  let currentUserMessage = '';  // track for stop persistence
  let availableModels: string[] = [];

  const copyBtnSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  const authHeaders = (includeJson = false) => {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    };
    if (includeJson) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  };
  const getMessageLabel = (message: { role: string; model?: string }) =>
    message.role === 'user' ? 'You' : (message.model || 'LLM');
  const renderModelOptions = (models: string[]) => {
    availableModels = models;
    if (!modelContainer) {
      return;
    }
    if (!models.length) {
      modelContainer.innerHTML = '<span class="chat-model-hint">Using the server default model.</span>';
      return;
    }
    modelContainer.innerHTML = models.map((model, index) =>
      `<label class="chat-model-option"><input type="checkbox" name="chat-model" value="${escapeAttr(model)}"${index === 0 ? ' checked' : ''}><span>${escapeHtml(model)}</span></label>`
    ).join('');
  };
  const getSelectedModels = () => {
    const selected = Array.from(
      modelContainer?.querySelectorAll<HTMLInputElement>('input[name="chat-model"]:checked') || [],
    ).map((checkbox) => checkbox.value);
    return selected.length ? selected : availableModels.slice(0, 1);
  };
  const createAssistantBubble = (label: string) => {
    const llmMessage = document.createElement('div');
    llmMessage.className = 'chat-message llm';
    llmMessage.innerHTML = `<button class="bubble-copy-btn" title="Copy">${copyBtnSvg}</button><div class="chat-bubble llm"><div class="bubble-role">${escapeHtml(label)}</div><div class="thinking-section" style="display:none;"><button class="thinking-toggle" type="button"><span class="spinner"></span> Thinking…</button><div class="thinking-content" style="display:none;"></div></div><div class="llm-spinner"><span class="spinner"></span></div><p class="llm-text"></p></div>`;
    messages?.appendChild(llmMessage);

    const llmBubble = llmMessage.querySelector('.chat-bubble') as HTMLElement;
    const thinkingSection = llmBubble.querySelector('.thinking-section') as HTMLElement;
    const thinkingToggle = llmBubble.querySelector('.thinking-toggle') as HTMLElement;
    const thinkingContent = llmBubble.querySelector('.thinking-content') as HTMLElement;
    const spinnerEl = llmBubble.querySelector('.llm-spinner') as HTMLElement;
    const textEl = llmBubble.querySelector('.llm-text') as HTMLElement;

    thinkingToggle?.addEventListener('click', () => {
      const isOpen = thinkingContent.style.display !== 'none';
      thinkingContent.style.display = isOpen ? 'none' : 'block';
      thinkingToggle.classList.toggle('open', !isOpen);
    });

    return { label, thinkingSection, thinkingToggle, thinkingContent, spinnerEl, textEl };
  };

  void (async () => {
    try {
      const res = await fetch('/api/chat/models', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        renderModelOptions(Array.isArray(data.models) ? data.models.filter((model: unknown) => typeof model === 'string') : []);
        return;
      }
    } catch {}
    renderModelOptions([]);
  })();

  // Load current conversation id from hash or start fresh
  let activeConversationId: string | null = new URLSearchParams(location.hash.split('?')[1] || '').get('id');

  // If resuming a previous conversation, fetch its messages
  if (activeConversationId) {
    (async () => {
      const res = await fetch(`/api/conversations/${encodeURIComponent(activeConversationId!)}`, {
        headers: authHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (messages && Array.isArray(data.messages)) {
          const copyBtn = `<button class="bubble-copy-btn" title="Copy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>`;
          messages.innerHTML = data.messages.map((m: { role: string; model?: string; content: string }) => {
            const cls = m.role === 'user' ? 'user' : 'llm';
            const label = getMessageLabel(m);
            const copy = copyBtn;
            const bubbleContent = m.role === 'user'
              ? `<div class="chat-bubble ${cls}">${copy}<div class="bubble-role">${escapeHtml(label)}</div><p>${escapeHtml(m.content)}</p></div>`
              : `${copy}<div class="chat-bubble ${cls}"><div class="bubble-role">${escapeHtml(label)}</div><p>${escapeHtml(m.content)}</p></div>`;
            return `<div class="chat-message ${cls}">${bubbleContent}</div>`;
          }).join('');
          messages.scrollTo(0, messages.scrollHeight);
        }
      }
      // Highlight this conversation in the sidebar
      window.dispatchEvent(new CustomEvent('sidebar:refresh', { detail: { activeId: activeConversationId } }));
    })();
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
    const selectedModels = getSelectedModels();
    const usesMultiModel = selectedModels.length > 1;

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

    // Append user bubble
    const userMessage = document.createElement('div');
    userMessage.className = 'chat-message user';
    userMessage.innerHTML = `<div class="chat-bubble user"><button class="bubble-copy-btn" title="Copy">${copyBtnSvg}</button><div class="bubble-role">You</div><p>${escapeHtml(text)}</p></div>`;
    messages?.appendChild(userMessage);
    input.value = '';
    input.style.height = 'auto';
    sendBtn.style.display = 'none';
    messages?.scrollTo(0, messages.scrollHeight);

    const assistantViews = (usesMultiModel ? selectedModels : [selectedModels[0] || 'LLM'])
      .map((model) => createAssistantBubble(model));
    messages?.scrollTo(0, messages.scrollHeight);
    const primaryAssistant = assistantViews[0];
    const thinkingSection = primaryAssistant.thinkingSection;
    const thinkingToggle = primaryAssistant.thinkingToggle;
    const thinkingContent = primaryAssistant.thinkingContent;
    const spinnerEl = primaryAssistant.spinnerEl;
    const textEl = primaryAssistant.textEl;

    try {
      if (usesMultiModel) {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify({ message: text, conversationId: activeConversationId, models: selectedModels }),
          signal: abortController!.signal,
        });
        if (!res.ok) {
          throw new Error('Error getting response.');
        }

        const data = await res.json();
        if (data.conversationId && !activeConversationId) {
          activeConversationId = data.conversationId;
          window.dispatchEvent(new CustomEvent('sidebar:refresh', { detail: { activeId: activeConversationId } }));
        }

        const replies = Array.isArray(data.replies) ? data.replies : [];
        const replyMap = new Map(replies.map((reply: { model: string; reply: string }) => [reply.model, reply.reply]));

        assistantViews.forEach((view) => {
          view.spinnerEl.style.display = 'none';
          const reply = replyMap.get(view.label)?.trim();
          view.textEl.textContent = reply || 'No response.';
          view.thinkingSection.style.display = 'none';
        });
      } else {
        const res = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify({ message: text, conversationId: activeConversationId, models: selectedModels }),
          signal: abortController!.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error('Error getting response.');
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

                if (thinkText.trim()) {
                  thinkingSection.style.display = 'block';
                  thinkingContent.textContent = thinkText;
                  if (inThink) {
                    thinkingToggle.innerHTML = '<span class="spinner"></span> Thinking…';
                  } else {
                    thinkingToggle.textContent = 'Thought process';
                  }
                }

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

        spinnerEl.style.display = 'none';
        if (!replyText.trim() && !thinkText.trim()) {
          textEl.innerHTML = '<em>No response.</em>';
        }
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
        assistantViews.forEach((view) => {
          view.spinnerEl.style.display = 'none';
          view.textEl.textContent = 'Response stopped';
          view.thinkingSection.style.display = 'none';
        });
        try {
          const stopRes = await fetch('/api/chat/stop', {
            method: 'POST',
            headers: authHeaders(true),
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
        assistantViews.forEach((view) => {
          view.spinnerEl.style.display = 'none';
          view.textEl.innerHTML = '<em>Error getting response.</em>';
        });
      }
    } finally {
      isGenerating = false;
      abortController = null;
      resizeInput();
      stopBtn.style.display = 'none';
      messages?.scrollTo(0, messages.scrollHeight);
    }
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
    const bubble = message?.querySelector('.chat-bubble');
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
