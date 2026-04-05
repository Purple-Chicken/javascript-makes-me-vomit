// src/routes/home.ts
const html = `
  <div class="box-container" style="max-width: 600px;">
    <h1 style="font-size: 3em; margin-bottom: 8px;">SHA-257</h1>
    <p class="home-subtitle" style="font-size: 0.9em; color: var(--text-muted); margin-bottom: 32px; letter-spacing: 0.08em; text-transform: uppercase; font-family: 'Neo Tech', monospace;">Local AI Chat</p>
    <p style="margin-bottom: 32px; line-height: 1.8; color: var(--text-color);">
      A private, self-hosted AI assistant running entirely on your machine.
      Your conversations stay local — no data leaves your network.
    </p>
    <div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">
      <a href="#/chat" class="button" style="text-decoration: none;">Start Chatting</a>
      <a href="#/history" class="button" style="text-decoration: none;">View History</a>
    </div>
  </div>
`;

export default { html };
