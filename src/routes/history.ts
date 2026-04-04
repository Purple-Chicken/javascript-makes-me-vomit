// src/routes/history.ts 
const html = `
  <h1>Chat History</h1>
  <div class="box-container" style="max-width: 800px;">
    <div style="display: flex; gap: 10px; margin-bottom: 16px;">
      <input type="text" id="history-search" class="input" placeholder="Search conversations..." style="flex: 1;" autocomplete="off">
      <button id="history-search-btn" class="button">Search</button>
    </div>
    <div id="history-list" style="text-align: left;">
      <p style="color: rgba(180, 255, 180, 0.5);">Loading conversations...</p>
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
      <button class="button history-delete-btn" data-delete-id="${c.id}">Delete</button>
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
    const res = await fetch('/api/conversations', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (res.ok) {
      allConversations = await res.json();
      // Sort most recent first
      allConversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      if (list) renderList(list, allConversations);
    } else if (list) {
      list.innerHTML = '<p>Failed to load conversations.</p>';
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
