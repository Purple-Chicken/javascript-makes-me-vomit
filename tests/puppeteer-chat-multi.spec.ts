import net from 'node:net';
import path from 'node:path';
import puppeteer, { type Browser, type HTTPRequest, type Page } from 'puppeteer';
import { createServer, type ViteDevServer } from 'vite';

const MODEL_NAMES = ['qwen3.5:2b', 'deepseek-r1:1.5b', 'llama3.2:1b', 'gemma3:1b'] as const;

type ModelName = (typeof MODEL_NAMES)[number];

type MockMessage = {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
};

type MockPendingResponse = {
  model: string;
  status: 'running' | 'completed';
  content?: string;
};

type MockConversation = {
  id: string;
  title: string;
  kind: 'ask-all' | 'single';
  model?: string;
  userMessage: string;
  assistantMessage?: string;
  updatedAt: string;
  reads: number;
};

type MockUserPreferences = {
  matrixRain: boolean;
  lightMode: boolean;
  font: string;
  themeColor: string;
};

type MockState = {
  username: string;
  password: string;
  token: string;
  profilePic: number;
  preferences: MockUserPreferences;
  nextUpdatedAtIndex: number;
  conversations: Map<string, MockConversation>;
};

const getAvailablePort = async (): Promise<number> =>
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address?.port) {
          resolve(address.port);
        } else {
          reject(new Error('Could not acquire a free port.'));
        }
      });
    });
  });

const createUpdatedAt = (state: MockState) => {
  const updatedAt = new Date(Date.UTC(2024, 0, 1, 0, 0, state.nextUpdatedAtIndex)).toISOString();
  state.nextUpdatedAtIndex += 1;
  return updatedAt;
};

const createMockState = (): MockState => ({
  username: '',
  password: '',
  token: 'jwt-token-demo',
  profilePic: 0,
  preferences: {
    matrixRain: true,
    lightMode: false,
    font: 'ibm-plex',
    themeColor: 'green',
  },
  nextUpdatedAtIndex: 0,
  conversations: new Map<string, MockConversation>(),
});

const askAllReplies: Record<ModelName, string> = {
  'qwen3.5:2b': 'qwen3.5:2b says 2 + 2 = 4.',
  'deepseek-r1:1.5b': 'deepseek-r1:1.5b says the answer is 4.',
  'llama3.2:1b': 'llama3.2:1b says 2 + 2 equals 4.',
  'gemma3:1b': 'gemma3:1b says the result is 4.',
};

const singleReplies: Record<string, string> = {
  'gemma3:1b': 'gemma3:1b says 2 + 2 = 4.',
  'llama3.2:1b': 'llama3.2:1b says 2 = 2 is true.',
};

const parseRequestJson = (request: HTTPRequest): Record<string, unknown> => {
  const body = request.postData();
  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const isAuthorized = (request: HTTPRequest, state: MockState) =>
  request.headers().authorization === `Bearer ${state.token}`;

const listConversations = (state: MockState) =>
  Array.from(state.conversations.values()).map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
  }));

const getConversationPayload = (conversation: MockConversation) => {
  conversation.reads += 1;

  if (conversation.kind === 'ask-all') {
    if (conversation.reads === 1) {
      return {
        id: conversation.id,
        status: 'running',
        messages: [{ role: 'user', content: conversation.userMessage } satisfies MockMessage],
        pendingTurn: {
          mode: 'ask-all',
          responses: [
            { model: 'qwen3.5:2b', status: 'completed', content: askAllReplies['qwen3.5:2b'] },
            { model: 'deepseek-r1:1.5b', status: 'running' },
            { model: 'llama3.2:1b', status: 'running' },
            { model: 'gemma3:1b', status: 'running' },
          ] satisfies MockPendingResponse[],
        },
      };
    }

    return {
      id: conversation.id,
      status: 'awaiting-selection',
      messages: [{ role: 'user', content: conversation.userMessage } satisfies MockMessage],
      pendingTurn: {
        mode: 'ask-all',
        responses: MODEL_NAMES.map((model) => ({
          model,
          status: 'completed',
          content: askAllReplies[model],
        } satisfies MockPendingResponse)),
      },
    };
  }

  if (conversation.reads === 1) {
    return {
      id: conversation.id,
      model: conversation.model,
      status: 'running',
      messages: [{ role: 'user', content: conversation.userMessage } satisfies MockMessage],
    };
  }

  return {
    id: conversation.id,
    model: conversation.model,
    status: 'completed',
    messages: [
      { role: 'user', content: conversation.userMessage },
      { role: 'assistant', model: conversation.model, content: conversation.assistantMessage || '' },
    ] satisfies MockMessage[],
  };
};

describe('puppeteer multi-model chat demo', () => {
  let browser: Browser | null = null;
  let page: Page | null = null;
  let server: ViteDevServer | null = null;
  let baseUrl = '';
  let originalTimeout = 0;
  let state = createMockState();

  beforeAll(async () => {
    if (typeof jasmine !== 'undefined') {
      originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
    }

    const port = await getAvailablePort();
    const root = path.resolve('.');

    server = await createServer({
      root,
      logLevel: 'error',
      server: {
        host: '127.0.0.1',
        port,
        strictPort: true,
      },
    });

    await server.listen();
    baseUrl = `http://127.0.0.1:${port}`;

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('navCollapsed', '0');
    });

    await page.setRequestInterception(true);
    page.on('request', async (request) => {
      const url = new URL(request.url());
      const pathname = url.pathname;

      if (!pathname.startsWith('/api/')) {
        await request.continue();
        return;
      }

      if (pathname === '/api/users' && request.method() === 'POST') {
        const body = parseRequestJson(request);
        state.username = typeof body.username === 'string' ? body.username : '';
        state.password = typeof body.password === 'string' ? body.password : '';
        await request.respond({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'user-demo' }),
        });
        return;
      }

      if (pathname === '/api/sessions' && request.method() === 'POST') {
        const body = parseRequestJson(request);
        const isValidLogin = body.username === state.username && body.password === state.password;
        await request.respond({
          status: isValidLogin ? 200 : 401,
          contentType: 'application/json',
          body: JSON.stringify(isValidLogin ? { token: state.token } : { error: 'Invalid credentials' }),
        });
        return;
      }

      if (pathname === '/api/users/me' && request.method() === 'GET') {
        const authorized = isAuthorized(request, state);
        await request.respond({
          status: authorized ? 200 : 401,
          contentType: 'application/json',
          body: JSON.stringify(authorized
            ? {
                username: state.username,
                profilePic: state.profilePic,
                preferences: state.preferences,
              }
            : { error: 'Unauthorized' }),
        });
        return;
      }

      if (pathname === '/api/users/me' && request.method() === 'PATCH') {
        if (!isAuthorized(request, state)) {
          await request.respond({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Unauthorized' }),
          });
          return;
        }

        const body = parseRequestJson(request);
        if (typeof body.profilePic === 'number') {
          state.profilePic = body.profilePic;
        }
        if (body.preferences && typeof body.preferences === 'object') {
          state.preferences = {
            ...state.preferences,
            ...(body.preferences as Partial<MockUserPreferences>),
          };
        }
        if (typeof body.username === 'string' && body.username.trim()) {
          state.username = body.username.trim();
        }

        await request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Account updated successfully' }),
        });
        return;
      }

      if (pathname === '/api/chat/models') {
        if (!isAuthorized(request, state)) {
          await request.respond({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Unauthorized' }),
          });
          return;
        }

        await request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            models: MODEL_NAMES.map((name) => ({ name, busy: false, conversationId: null })),
          }),
        });
        return;
      }

      if (pathname === '/api/chat' && request.method() === 'POST') {
        if (!isAuthorized(request, state)) {
          await request.respond({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Unauthorized' }),
          });
          return;
        }

        const body = parseRequestJson(request);
        const message = typeof body.message === 'string' ? body.message : '';
        const requestedModel = typeof body.model === 'string' ? body.model : '';

        if (requestedModel === '__ask_all__') {
          state.conversations.set('conv-ask-all', {
            id: 'conv-ask-all',
            title: message,
            kind: 'ask-all',
            userMessage: message,
            updatedAt: createUpdatedAt(state),
            reads: 0,
          });
          await request.respond({
            status: 202,
            contentType: 'application/json',
            body: JSON.stringify({
              conversationId: 'conv-ask-all',
              mode: 'ask-all',
              status: 'running',
            }),
          });
          return;
        }

        const conversationId = requestedModel === 'gemma3:1b' ? 'conv-gemma' : 'conv-llama';
        state.conversations.set(conversationId, {
          id: conversationId,
          title: message,
          kind: 'single',
          model: requestedModel,
          userMessage: message,
          assistantMessage: singleReplies[requestedModel] || `${requestedModel} replied.`,
          updatedAt: createUpdatedAt(state),
          reads: 0,
        });
        await request.respond({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({
            conversationId,
            model: requestedModel,
            status: 'running',
          }),
        });
        return;
      }

      if (pathname === '/api/conversations') {
        if (!isAuthorized(request, state)) {
          await request.respond({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Unauthorized' }),
          });
          return;
        }

        await request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(listConversations(state)),
        });
        return;
      }

      if (pathname.startsWith('/api/conversations/') && request.method() === 'GET') {
        if (!isAuthorized(request, state)) {
          await request.respond({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Unauthorized' }),
          });
          return;
        }

        const conversationId = decodeURIComponent(pathname.split('/').pop() || '');
        const conversation = state.conversations.get(conversationId);
        if (!conversation) {
          await request.respond({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Conversation not found' }),
          });
          return;
        }

        await request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(getConversationPayload(conversation)),
        });
        return;
      }

      await request.respond({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: `Unhandled mock endpoint: ${pathname}` }),
      });
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  }, 60000);

  afterAll(async () => {
    if (page) {
      await page.close();
    }
    if (browser) {
      await browser.close();
    }
    if (server) {
      await server.close();
    }
    if (typeof jasmine !== 'undefined') {
      jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    }
  }, 60000);

  it('signs up, logs in, chats across models, revisits history, opens settings, and logs out', async () => {
    if (!page) {
      throw new Error('Puppeteer page not initialized.');
    }

    const username = `demo_${Date.now()}`;
    const password = 'demo-password-123';
    const typingDelayMs = 40;

    const waitForHeading = async (heading: string) => {
      await page.waitForFunction(
        (expectedHeading) => document.querySelector('#app h1')?.textContent?.trim() === expectedHeading,
        {},
        heading,
      );
    };

    const openFreshChat = async () => {
      await page.evaluate(() => {
        (document.getElementById('nav-new-chat') as HTMLAnchorElement | null)?.click();
      });
      await page.waitForFunction(() => location.hash === '#/chat');
      await page.waitForFunction(() => {
        const startHint = document.querySelector('#chat-messages .start-hint');
        const input = document.getElementById('chat-input') as HTMLTextAreaElement | null;
        return Boolean(startHint && input && !input.disabled && input.value === '');
      });
    };

    const sendChatPrompt = async (model: string, prompt: string) => {
      await page.waitForSelector('#chat-model-select');
      await page.waitForFunction(
        (requestedModel) => {
          const select = document.getElementById('chat-model-select') as HTMLSelectElement | null;
          if (!select || select.disabled) {
            return false;
          }
          return Array.from(select.options).some((option) => option.value === requestedModel && !option.disabled);
        },
        {},
        model,
      );
      await page.evaluate((requestedModel, requestedPrompt) => {
        const select = document.getElementById('chat-model-select') as HTMLSelectElement | null;
        const input = document.getElementById('chat-input') as HTMLTextAreaElement | null;
        const form = document.getElementById('chatForm') as HTMLFormElement | null;
        if (!select || !input || !form) {
          throw new Error('Chat composer elements were not found.');
        }
        select.value = requestedModel;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        input.value = requestedPrompt;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        form.requestSubmit();
      }, model, prompt);
    };

    const openSidebarConversation = async (conversationId: string) => {
      await page.waitForFunction(
        (targetConversationId) => Boolean(document.querySelector(`a[href="#/chat?id=${targetConversationId}"]`)),
        {},
        conversationId,
      );
      await page.evaluate((targetConversationId) => {
        (document.querySelector(`a[href="#/chat?id=${targetConversationId}"]`) as HTMLAnchorElement | null)?.click();
      }, conversationId);
    };

    await waitForHeading('SHA-257');

    await page.click('#topbar-signup');
    await page.waitForSelector('#signupForm');
    await page.type('#username', username, { delay: typingDelayMs });
    await page.type('#password', password, { delay: typingDelayMs });
    await page.type('#password-confirm', password, { delay: typingDelayMs });
    await page.click('#signupForm button[type="submit"]');

    await page.waitForFunction(() => {
      const successPanel = document.getElementById('signup-success');
      return Boolean(successPanel && getComputedStyle(successPanel).display !== 'none');
    });
    await page.goto(`${baseUrl}/#/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#loginForm');

    const prefilledUsername = await page.$eval('#username', (element) =>
      (element as HTMLInputElement).value,
    );
    expect(prefilledUsername).toBe(username);

    await page.type('#password', password, { delay: typingDelayMs });
    await page.click('#loginForm button[type="submit"]');
    await waitForHeading('Chat');

    await sendChatPrompt('__ask_all__', 'what is 2+2');
    await page.waitForFunction(() => location.hash.includes('conv-ask-all'));

    await openFreshChat();
    await sendChatPrompt('gemma3:1b', 'what is 2+2');
    await page.waitForFunction(() => location.hash.includes('conv-gemma'));

    await openFreshChat();
    await sendChatPrompt('llama3.2:1b', 'what is 2=2');
    await page.waitForFunction(() => document.getElementById('chat-messages')?.textContent?.includes('what is 2=2'));

    await page.evaluate(() => {
      (document.getElementById('nav-history') as HTMLAnchorElement | null)?.click();
    });
    await page.waitForSelector('#history-list');
    await page.waitForFunction(() => document.querySelectorAll('.history-item').length === 3);
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.history-item')) as HTMLElement[];
      items[items.length - 1]?.click();
    });

    await waitForHeading('Chat');
    await page.waitForFunction(() => location.hash.includes('conv-ask-all'));
    await page.waitForFunction(() => document.querySelectorAll('.chat-response-option').length === 4);

    await openSidebarConversation('conv-gemma');
    await waitForHeading('Chat');
    await page.waitForFunction(() => location.hash.includes('conv-gemma'));
    await page.waitForFunction(() => {
      const replies = Array.from(document.querySelectorAll('.chat-message.llm .llm-text')).map((element) => element.textContent?.trim());
      return replies.includes('gemma3:1b says 2 + 2 = 4.');
    });

    await openSidebarConversation('conv-llama');
    await waitForHeading('Chat');
    await page.waitForFunction(() => location.hash.includes('conv-llama'));
    await page.waitForFunction(() => {
      const replies = Array.from(document.querySelectorAll('.chat-message.llm .llm-text')).map((element) => element.textContent?.trim());
      return replies.includes('llama3.2:1b says 2 = 2 is true.');
    });

    await page.waitForFunction(() => {
      const profileButton = document.getElementById('topbar-profile');
      return Boolean(profileButton && getComputedStyle(profileButton).display !== 'none');
    });
    await page.click('#topbar-profile');
    await page.waitForFunction(() => {
      const dropdown = document.getElementById('profile-dropdown');
      return Boolean(dropdown && getComputedStyle(dropdown).display !== 'none');
    });
    await page.click('#profile-dropdown-settings');
    await waitForHeading('Account Settings');

    await page.click('#logout-btn');
    await waitForHeading('Login');

    const storedToken = await page.evaluate(() => localStorage.getItem('token'));
    expect(storedToken).toBeNull();
  });
});