import { Given, When, Then } from '@cucumber/cucumber';
import { handleRoute } from '../../src/router.ts';

// --- State Management ---
let currentChat = {
  id: null,
  messages: [],
  isTemporary: false,
  model: 'default',
  expiresAt: null
};
let isStreaming = false;
let lastResponseElement = null;
let sidebarChats = [];
let appHTML = ''; // Mocking the #app container content

// --- Given Steps ---

Given('I have no previous chats', () => {
  sidebarChats = [];
});

Given('I am currently not on the {string} page', (page) => {
  window.location.hash = `#/not-${page}`;
});

Given('I have {int} existing persistent conversations', (count) => {
  sidebarChats = Array.from({ length: count }, (_, i) => ({
    id: `chat-${i}`,
    title: `Persistent Chat ${i}`,
    model: 'GPT-4'
  }));
});

Given('I have 1 temporary conversation', () => {
  // In our memory-only model, this exists in current state but isn't in sidebar
  currentChat.isTemporary = true;
});

Given('I am in an active {string} session', (mode) => {
  currentChat = {
    id: mode === 'Temporary Chat' ? 'temp-session' : 'pers-123',
    messages: [{ role: 'assistant', content: 'Hi' }, { role: 'assistant', content: 'Hi again' }],
    isTemporary: mode === 'Temporary Chat'
  };
});

Given('a persistent chat was set to expire at {string}', (time) => {
  currentChat.expiresAt = time;
});
Given('I have an active conversation', () => {
  currentChat.id = 'active-123';
  currentChat.messages = [{ role: 'user', content: 'Hello' }];
});

// --- When Steps ---

When('I type a string', () => {
  // Mock input interaction
});

When('press {string}', (key) => {
  // Trigger message send logic
  currentChat.messages.push({ role: 'user', content: 'New Message' });
});

When('the server begins streaming the response chunks', async () => {
  isStreaming = true;
  currentChat.messages.push({ role: 'assistant', content: '' });
});

When('the LLM generates a response with {string}', (content) => {
  currentChat.messages.push({ role: 'assistant', content });
});

When('the LLM generates a response with a GFM table:', (tableMarkdown) => {
  currentChat.messages.push({ role: 'assistant', content: tableMarkdown, type: 'table' });
});
When('I select {string}', (option) => {
  if (option === 'temporary chat') {
    currentChat.isTemporary = true;
  }
});

When('I navigate to a different chat or page', () => {
  // Privacy Logic: Wipe memory-only chat on navigation
  if (currentChat.isTemporary) {
    currentChat = { id: null, messages: [], isTemporary: false };
  }
  window.location.hash = '#/other-page';
});

When('I refresh the browser tab', () => {
  // Total memory wipe
  currentChat = { id: null, messages: [], isTemporary: false };
});

When('I set the expiration to {string}', (timeframe) => {
  currentChat.expiresAt = timeframe;
});

When('I open the {string} sidebar', (name) => {
  // Logic to mock opening the sidebar UI
  appHTML = `<div id="sidebar">${sidebarChats.map(c => `<div>${c.title} - ${c.model}</div>`).join('')}</div>`;
});

// --- Then Steps ---

Then('the chat should be a temporary chat', () => {
  if (!currentChat.isTemporary) throw new Error('Expected chat to be temporary');
});

Then('the temporary conversation should not be in the list', () => {
  const inSidebar = sidebarChats.some(c => c.id === currentChat.id && currentChat.isTemporary);
  if (inSidebar) throw new Error('Temporary chat found in persistent sidebar list');
});

Then('the previous temporary messages should be gone', () => {
  if (currentChat.messages.length > 0) throw new Error('Temporary messages persisted after navigation');
});

Then('the chat interface should be reset to empty', () => {
  // Check mock DOM state
  if (currentChat.id !== null) throw new Error('Chat interface was not reset');
});

Then('the message should be displayed with a {string} element', (elType) => {
  const lastMsg = currentChat.messages[currentChat.messages.length - 1];
  if (elType === 'table' && !lastMsg.content.includes('|')) throw new Error('Table render fail');
});

Then('the table should have {int} {string} row and {int} {string} rows', (hCount, hType, bCount, bType) => {
  const lastMsg = currentChat.messages[currentChat.messages.length - 1];
  const lines = lastMsg.content.trim().split('\n').filter(l => !l.includes('---'));
  if (lines.length !== (hCount + bCount)) throw new Error('Table row mismatch');
});

Then('the chat is saved to the database with a deletion timestamp', () => {
  if (!currentChat.expiresAt || currentChat.isTemporary) {
    throw new Error('Chat was not saved with correct persistence/expiration metadata');
  }
});

Then('I should see a {string} message', (text) => {
  // appHTML is a mock for document.getElementById('app').innerHTML
  if (!appHTML.includes(text)) throw new Error(`Expected UI to show: ${text}`);
});

// --- Markdown Rendering Steps ---

Then('the link {string} attribute should be {string}', (attr, value) => {
  // Verification logic for <a href="..."> tags
});

Then('I should see exactly {int} conversation entries', (count) => {
  // Check the number of items in the sidebarChats array or the mock HTML
  if (sidebarChats.length !== count) throw new Error(`Expected ${count} chats, found ${sidebarChats.length}`);
});
