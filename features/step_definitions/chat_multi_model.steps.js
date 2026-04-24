import { Given, When, Then } from '@cucumber/cucumber';
import { JSDOM } from 'jsdom';
import chatModule from '../../src/routes/chat.ts';

const ASK_ALL_VALUE = '__ask_all__';

let dom;
let fetchCalls = [];
let conversationReads = 0;
let responseSelected = false;

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

Given('I am on the chat page with ask all available', async () => {
  dom = new JSDOM(`<!doctype html><html><body><div id="nav-new-chat"></div><div id="app">${chatModule.html}</div></body></html>`, {
    url: 'http://127.0.0.1/#/chat',
  });

  fetchCalls = [];
  conversationReads = 0;
  responseSelected = false;

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
          { name: 'qwen3.5:2b', busy: false, conversationId: null },
          { name: 'llama3.2:1b', busy: false, conversationId: null },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === '/api/chat') {
      return new Response(JSON.stringify({
        conversationId: 'conv-compare',
        mode: 'ask-all',
        status: 'running',
      }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === '/api/conversations/conv-compare/select-response') {
      responseSelected = true;
      return new Response(JSON.stringify({
        id: 'conv-compare',
        model: 'llama3.2:1b',
        status: 'completed',
        pendingTurn: null,
        messages: [
          { role: 'user', content: 'Compare two answers' },
          { role: 'assistant', model: 'llama3.2:1b', content: 'Acceptance llama reply' },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === '/api/conversations/conv-compare') {
      if (responseSelected) {
        return new Response(JSON.stringify({
          id: 'conv-compare',
          model: 'llama3.2:1b',
          status: 'completed',
          pendingTurn: null,
          messages: [
            { role: 'user', content: 'Compare two answers' },
            { role: 'assistant', model: 'llama3.2:1b', content: 'Acceptance llama reply' },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      conversationReads += 1;
      if (conversationReads === 1) {
        return new Response(JSON.stringify({
          id: 'conv-compare',
          status: 'running',
          messages: [
            { role: 'user', content: 'Compare two answers' },
          ],
          pendingTurn: {
            mode: 'ask-all',
            responses: [
              { model: 'qwen3.5:2b', status: 'completed', content: 'Acceptance qwen reply' },
              { model: 'llama3.2:1b', status: 'running' },
            ],
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        id: 'conv-compare',
        model: 'llama3.2:1b',
        status: 'awaiting-selection',
        messages: [
          { role: 'user', content: 'Compare two answers' },
        ],
        pendingTurn: {
          mode: 'ask-all',
          responses: [
            { model: 'qwen3.5:2b', status: 'completed', content: 'Acceptance qwen reply' },
            { model: 'llama3.2:1b', status: 'completed', content: 'Acceptance llama reply' },
          ],
        },
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

When('I submit the prompt {string} with Ask all', async (prompt) => {
  const input = dom.window.document.getElementById('chat-input');
  const select = dom.window.document.getElementById('chat-model-select');
  input.value = prompt;
  select.value = ASK_ALL_VALUE;

  const form = dom.window.document.getElementById('chatForm');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  await flush();
  await flush();
  await flush();
});

Then('I should see candidate replies from {string} and {string}', (firstModel, secondModel) => {
  const labels = Array.from(dom.window.document.querySelectorAll('.chat-response-option .bubble-role'))
    .map((element) => element.textContent?.trim());
  const replies = Array.from(dom.window.document.querySelectorAll('.chat-response-option .llm-text'))
    .map((element) => element.textContent?.trim());
  const chatCall = fetchCalls.find((call) => call.url === '/api/chat');

  if (!chatCall) {
    throw new Error('Expected /api/chat to be called for ask all');
  }

  const requestBody = JSON.parse(chatCall.init.body);
  if (requestBody.model !== ASK_ALL_VALUE) {
    throw new Error(`Expected ask all to be submitted, got ${JSON.stringify(requestBody.model)}`);
  }

  if (!labels.includes(firstModel) || !labels.includes(secondModel)) {
    throw new Error(`Expected candidate labels for ${firstModel} and ${secondModel}, got ${labels.join(', ')}`);
  }

  if (!replies.includes('Acceptance qwen reply') || !replies.includes('Acceptance llama reply')) {
    throw new Error(`Expected both candidate replies, got ${replies.join(' | ')}`);
  }
});

When('I choose the response from {string}', async (model) => {
  const button = dom.window.document.querySelector(`[data-select-model="${model}"]`);
  button?.dispatchEvent(new dom.window.Event('click', { bubbles: true, cancelable: true }));
  await flush();
  await flush();
});

Then('the chat log should save the response from {string}', (model) => {
  const selectCall = fetchCalls.find((call) => call.url === '/api/conversations/conv-compare/select-response');
  const labels = Array.from(dom.window.document.querySelectorAll('.chat-message.llm .bubble-role'))
    .map((element) => element.textContent?.trim());
  const replies = Array.from(dom.window.document.querySelectorAll('.chat-message.llm .llm-text'))
    .map((element) => element.textContent?.trim());

  if (!selectCall) {
    throw new Error('Expected the selected response to be posted back to the server');
  }

  const requestBody = JSON.parse(selectCall.init.body);
  if (requestBody.model !== model) {
    throw new Error(`Expected ${model} to be saved, got ${JSON.stringify(requestBody.model)}`);
  }

  if (!labels.includes(model)) {
    throw new Error(`Expected the saved chat reply label to include ${model}, got ${labels.join(', ')}`);
  }

  if (!replies.includes('Acceptance llama reply')) {
    throw new Error(`Expected the saved llama reply, got ${replies.join(' | ')}`);
  }
});