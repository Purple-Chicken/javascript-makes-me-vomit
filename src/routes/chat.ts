// src/routes/chat.ts 
const html = `
  <div class="chat-wrapper">
    <div class="chat-header">
      <h1 style="margin: 0; font-size: 1.5em;">Chat</h1>
    </div>
    <div id="chat-messages">
      <p class="start-hint">Start a conversation...</p>
    </div>
    <form id="chatForm" class="chat-input-bar">
      <input type="text" id="chat-input" class="input" placeholder="Ask something..." autocomplete="off">
      <button class="button" type="submit" id="send-btn">Send</button>
      <button class="button stop-btn" type="button" id="stop-btn" style="display:none;">Stop</button>
    </form>
  </div>
`;

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const onLoad = () => {
  const form = document.getElementById('chatForm') as HTMLFormElement;
  const input = document.getElementById('chat-input') as HTMLInputElement;
  const messages = document.getElementById('chat-messages') as HTMLDivElement;
  const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
  const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
  let isGenerating = false;
  let abortController: AbortController | null = null;
  let currentUserMessage = '';  // track for stop persistence

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
        if (messages && Array.isArray(data.messages)) {
          messages.innerHTML = data.messages.map((m: { role: string; content: string }) => {
            const cls = m.role === 'user' ? 'user' : 'llm';
            const label = m.role === 'user' ? 'You' : 'LLM';
            return `<div class="chat-bubble ${cls}"><div class="bubble-role">${label}</div><p>${escapeHtml(m.content)}</p></div>`;
          }).join('');
          messages.scrollTo(0, messages.scrollHeight);
        }
      }
    })();
  }

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

    // Clear start hint if present
    const hint = messages?.querySelector('.start-hint');
    if (hint) hint.remove();

    // Append user bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user';
    userBubble.innerHTML = `<div class="bubble-role">You</div><p>${escapeHtml(text)}</p>`;
    messages?.appendChild(userBubble);
    input.value = '';
    messages?.scrollTo(0, messages.scrollHeight);

    // Create LLM bubble with spinner
    const llmBubble = document.createElement('div');
    llmBubble.className = 'chat-bubble llm';
    llmBubble.innerHTML = `<div class="bubble-role">LLM</div><div class="thinking-section" style="display:none;"><button class="thinking-toggle" type="button"><span class="spinner"></span> Thinking…</button><div class="thinking-content" style="display:none;"></div></div><div class="llm-spinner"><span class="spinner"></span></div><p class="llm-text"></p>`;
    messages?.appendChild(llmBubble);
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
        body: JSON.stringify({ message: text, conversationId: activeConversationId }),
        signal: abortController!.signal
      });

      if (!res.ok || !res.body) {
        textEl.innerHTML = '<em>Error getting response.</em>';
        spinnerEl.style.display = 'none';
        isGenerating = false;
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

            if (chunk.done) {
              if (chunk.conversationId && !activeConversationId) {
                activeConversationId = chunk.conversationId;
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

      // Set conversation id from header if not received in stream
      if (!activeConversationId) {
        const hdrId = res.headers.get('X-Conversation-Id');
        if (hdrId) activeConversationId = hdrId;
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
    sendBtn.style.display = '';
    stopBtn.style.display = 'none';
    messages?.scrollTo(0, messages.scrollHeight);
  });

  // Stop button handler
  stopBtn?.addEventListener('click', () => {
    if (abortController) {
      abortController.abort();
    }
  });

};

const cleanup = () => {
  // No intervals to clear; form listeners are garbage-collected on innerHTML swap
};

export default { html, onLoad, cleanup };
