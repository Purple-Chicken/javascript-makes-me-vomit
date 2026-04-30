// src/routes/home.ts
const html = `
  <div class="box-container" style="max-width: 600px;">
    <div hidden><h1>Home</h1></div>
    <h1 style="font-size: 3em; margin-bottom: 24px;">SHA-257</h1>
    <p id="home-description" style="margin-bottom: 32px; line-height: 1.8; color: var(--text-color);">
      A private and simple LLM chatbot interface.
    </p>
    <div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">
      <a href="#/chat" class="button" style="text-decoration: none;">Start Chatting</a>
    </div>
  </div>
`;

function onLoad() {
  const username = localStorage.getItem('cachedUsername');
  const el = document.getElementById('home-description');
  if (el && username) {
    el.textContent = `Welcome, ${username}.`;
  }
}

export default { html, onLoad };
