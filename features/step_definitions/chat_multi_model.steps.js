import { Given, When, Then } from '@cucumber/cucumber';
import { JSDOM } from 'jsdom';
import chatModule from '../../src/routes/chat.ts';

let dom;
let fetchCalls = [];
let conversationReads = 0;

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

Given('qwen3.5:2b is already generating in another chat', async () => {
  dom = new JSDOM(`<!doctype html><html><body><div id="nav-new-chat"></div><div id="app">${chatModule.html}</div></body></html>`, {
    url: 'http://127.0.0.1/#/chat',
  });

  fetchCalls = [];
  conversationReads = 0;

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.CustomEvent = dom.window.CustomEvent;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard: { writeText: async () => {} } },
  });
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
      return new Response(JSON.stringify({
        models: [
          { name: 'qwen3.5:2b', busy: true, conversationId: 'conv-qwen' },
          { name: 'llama3.2:1b', busy: false, conversationId: null },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === '/api/chat') {
      return new Response(JSON.stringify({
        conversationId: 'conv-llama',
        model: 'llama3.2:1b',
        status: 'running',
      }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === '/api/conversations/conv-llama') {
      conversationReads += 1;
      if (conversationReads === 1) {
        return new Response(JSON.stringify({
          id: 'conv-llama',
          model: 'llama3.2:1b',
          status: 'running',
          messages: [
            { role: 'user', content: 'Talk to llama' },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        id: 'conv-llama',
        model: 'llama3.2:1b',
        status: 'completed',
        messages: [
          { role: 'user', content: 'Talk to llama' },
          { role: 'assistant', model: 'llama3.2:1b', content: 'Acceptance llama reply' },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === '/api/conversations') {
      return new Response(JSON.stringify([]), {
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

When('I open a new chat and choose llama3.2:1b', async () => {
  const input = dom.window.document.getElementById('chat-input');
  const select = dom.window.document.getElementById('chat-model-select');
  input.value = 'Talk to llama';
  select.value = 'llama3.2:1b';

  const form = dom.window.document.getElementById('chatForm');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  await flush();
  await flush();
});

Then('qwen3.5:2b should be unavailable in the model dropdown', () => {
  const select = dom.window.document.getElementById('chat-model-select');
  const qwenOption = Array.from(select.options).find((option) => option.value === 'qwen3.5:2b');

  if (!qwenOption?.disabled) {
    throw new Error('Expected qwen3.5:2b to be disabled while it is busy');
  }
});

Then('I should eventually see a reply from llama3.2:1b', () => {
  const labels = Array.from(dom.window.document.querySelectorAll('.chat-message.llm .bubble-role'))
    .map((element) => element.textContent?.trim());
  const replies = Array.from(dom.window.document.querySelectorAll('.chat-message.llm .llm-text'))
    .map((element) => element.textContent?.trim());
  const chatCall = fetchCalls.find((call) => call.url === '/api/chat');

  if (!chatCall) {
    throw new Error('Expected /api/chat to be called for the new conversation');
  }

  const requestBody = JSON.parse(chatCall.init.body);
  if (requestBody.model !== 'llama3.2:1b') {
    throw new Error(`Expected llama3.2:1b to be submitted, got ${JSON.stringify(requestBody.model)}`);
  }

  if (!labels.includes('llama3.2:1b')) {
    throw new Error(`Expected a llama3.2:1b reply label, got ${labels.join(', ')}`);
  }

  if (!replies.includes('Acceptance llama reply')) {
    throw new Error(`Expected the llama reply, got ${replies.join(' | ')}`);
  }
});