import { Given, When, Then } from '@cucumber/cucumber';
import { JSDOM } from 'jsdom';
import chatModule from '../../src/routes/chat.ts';

let dom;
let fetchCalls = [];

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

Given('I am on the chat page with multiple available models', async () => {
  dom = new JSDOM(`<!doctype html><html><body><div id="nav-new-chat"></div><div id="app">${chatModule.html}</div></body></html>`, {
    url: 'http://127.0.0.1/#/chat',
  });

  fetchCalls = [];

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.navigator = { clipboard: { writeText: async () => {} } };
  globalThis.localStorage = {
    getItem: (key) => (key === 'token' ? 'jwt-token-1' : null),
    setItem: () => {},
    removeItem: () => {},
  };
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

  const messages = dom.window.document.getElementById('chat-messages');
  messages.scrollTo = () => undefined;

  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    if (url === '/api/chat/models') {
      return new Response(JSON.stringify({ models: ['qwen3:8b', 'mistral:7b'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === '/api/chat') {
      return new Response(JSON.stringify({
        conversationId: 'conv-1',
        replies: [
          { model: 'qwen3:8b', reply: 'First acceptance answer' },
          { model: 'mistral:7b', reply: 'Second acceptance answer' },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === '/api/conversations') {
      return new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  chatModule.onLoad();
  await flush();
});

When('I submit the prompt {string} to the selected chat models', async (prompt) => {
  const input = dom.window.document.getElementById('chat-input');
  input.value = prompt;

  const checkboxes = Array.from(dom.window.document.querySelectorAll('input[name="chat-model"]'));
  checkboxes[0].checked = true;
  checkboxes[1].checked = true;

  const form = dom.window.document.getElementById('chatForm');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  await flush();
});

Then('I should see separate chat replies from {string} and {string}', (firstModel, secondModel) => {
  const labels = Array.from(dom.window.document.querySelectorAll('.chat-message.llm .bubble-role'))
    .map((element) => element.textContent?.trim());
  const replies = Array.from(dom.window.document.querySelectorAll('.chat-message.llm .llm-text'))
    .map((element) => element.textContent?.trim());
  const chatCall = fetchCalls.find((call) => call.url === '/api/chat');

  if (!chatCall) {
    throw new Error('Expected /api/chat to be called for multi-model submission');
  }

  const requestBody = JSON.parse(chatCall.init.body);
  if (!Array.isArray(requestBody.models) || requestBody.models.length !== 2) {
    throw new Error(`Expected two selected models, got ${JSON.stringify(requestBody.models)}`);
  }

  if (!labels.includes(firstModel) || !labels.includes(secondModel)) {
    throw new Error(`Expected labels for ${firstModel} and ${secondModel}, got ${labels.join(', ')}`);
  }

  if (!replies.includes('First acceptance answer') || !replies.includes('Second acceptance answer')) {
    throw new Error(`Expected both replies, got ${replies.join(' | ')}`);
  }
});