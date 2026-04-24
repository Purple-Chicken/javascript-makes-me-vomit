// src/routes/history.ts 
const html = `
  <h1>Chat History</h1>
  <div class="box-container" style="max-width: 800px;">
    <div style="display: flex; gap: 10px; margin-bottom: 16px;">
      <div class="input-prompt" style="flex: 1;"><input type="text" id="history-search" class="input" placeholder="search conversations..." autocomplete="off"></div>
      <button id="history-search-btn" class="button" style="padding: 12px 14px; flex-shrink: 0;" title="Search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </button>
    </div>
    <div id="history-list" style="text-align: left;">
      <p style="color: var(--text-muted);">Loading conversations...</p>
    </div>
  </div>
`;

const renderList = (container: HTMLElement, conversations: { id: string; title: string; updatedAt: string }[]) => {
  if (!conversations.length) {
    container.innerHTML = '<p>No conversations found.</p>';
    return;
  }
  container.innerHTML = conversations.map(c =>
    `<div class="history-item" data-id="${c.id}">
      <div class="history-item-info">
        <strong>${c.title}</strong>
        <span class="history-item-date">${new Date(c.updatedAt).toLocaleString()}</span>
      </div>
      <button class="history-download-btn" data-download-id="${c.id}" data-title="${c.title}" title="Download">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>
      <button class="history-delete-btn" data-delete-id="${c.id}" title="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>`
  ).join('');
};

const onLoad = () => {
  const list = document.getElementById('history-list') as HTMLDivElement;
  const searchInput = document.getElementById('history-search') as HTMLInputElement;
  const searchBtn = document.getElementById('history-search-btn');

  let allConversations: { id: string; title: string; updatedAt: string }[] = [];

  // Fetch all conversations for the current user
  (async () => {
    try {
      const res = await fetch('/api/conversations', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok && typeof res.json === 'function') {
        allConversations = await res.json();
        // Sort most recent first
        allConversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        if (list) renderList(list, allConversations);
      } else if (list) {
        list.innerHTML = '<p>Failed to load conversations.</p>';
      }
    } catch {
      if (list) {
        list.innerHTML = '<p>Failed to load conversations.</p>';
      }
    }
  })();

  // Search filter
  const doSearch = () => {
    const query = searchInput?.value.trim().toLowerCase() || '';
    const filtered = query
      ? allConversations.filter(c => c.title.toLowerCase().includes(query))
      : allConversations;
    // Already sorted most-recent-first from initial load
    if (list) renderList(list, filtered);
  };

  searchBtn?.addEventListener('click', doSearch);
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  // Click to open a conversation (but not if clicking delete)
  list?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    // Handle download button
    const downloadBtn = target.closest('.history-download-btn') as HTMLElement | null;
    if (downloadBtn?.dataset.downloadId) {
      e.stopPropagation();
      const id = downloadBtn.dataset.downloadId;
      const title = downloadBtn.dataset.title || 'chat';
      const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        const lines = (data.messages as { role: string; content: string }[]).map(
          m => `${m.role === 'user' ? 'You' : 'LLM'}\n${m.content}\n`
        );
        const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.slice(0, 40).replace(/[^a-z0-9]/gi, '-')}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      }
      return;
    }

    // Handle delete button
    const deleteBtn = target.closest('.history-delete-btn') as HTMLElement | null;
    if (deleteBtn?.dataset.deleteId) {
      e.stopPropagation();
      const id = deleteBtn.dataset.deleteId;
      const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        allConversations = allConversations.filter(c => c.id !== id);
        if (list) renderList(list, allConversations);
      }
      return;
    }

    // Handle click to open
    const item = target.closest('.history-item') as HTMLElement | null;
    if (item?.dataset.id) {
      window.location.hash = `#/chat?id=${encodeURIComponent(item.dataset.id)}`;
    }
  });
};

export default { html, onLoad };
