import net from 'node:net';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { createServer, type ViteDevServer } from 'vite';

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

describe('puppeteer multi-model chat flow', () => {
  let browser: Browser | null = null;
  let page: Page | null = null;
  let server: ViteDevServer | null = null;
  let baseUrl = '';
  let originalTimeout = 0;
  let llamaConversationReads = 0;

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

    await page.setRequestInterception(true);
    page.on('request', async (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/users/me') {
        await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ username: 'tester' }) });
        return;
      }
      if (url.pathname === '/api/conversations') {
        await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'conv-qwen', title: 'qwen3.5:2b: Hold qwen open', updatedAt: new Date().toISOString() }]) });
        return;
      }
      if (url.pathname === '/api/chat/models') {
        await request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ models: [
            { name: 'qwen3.5:2b', busy: true, conversationId: 'conv-qwen' },
            { name: 'llama3.2:1b', busy: false, conversationId: null },
          ] }),
        });
        return;
      }
      if (url.pathname === '/api/conversations/conv-qwen') {
        await request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'conv-qwen',
            model: 'qwen3.5:2b',
            status: 'running',
            messages: [{ role: 'user', content: 'Hold qwen open' }],
          }),
        });
        return;
      }
      if (url.pathname === '/api/chat') {
        await request.respond({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({
            conversationId: 'conv-llama',
            model: 'llama3.2:1b',
            status: 'running',
          }),
        });
        return;
      }
      if (url.pathname === '/api/conversations/conv-llama') {
        llamaConversationReads += 1;
        const body = llamaConversationReads === 1
          ? {
              id: 'conv-llama',
              model: 'llama3.2:1b',
              status: 'running',
              messages: [{ role: 'user', content: 'Compare models in the browser' }],
            }
          : {
              id: 'conv-llama',
              model: 'llama3.2:1b',
              status: 'completed',
              messages: [
                { role: 'user', content: 'Compare models in the browser' },
                { role: 'assistant', model: 'llama3.2:1b', content: 'Browser llama reply' },
              ],
            };
        await request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
        return;
      }
      await request.continue();
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('token', 'jwt-token-1');
    });
    await page.goto(`${baseUrl}/#/chat?id=conv-qwen`, { waitUntil: 'domcontentloaded' });
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

  it('opens a new chat while qwen is busy and starts a llama conversation', async () => {
    if (!page) {
      throw new Error('Puppeteer page not initialized.');
    }

    await page.waitForSelector('#nav-new-chat');
    await page.evaluate(() => {
      (document.getElementById('nav-new-chat') as HTMLElement | null)?.click();
    });
    await page.waitForFunction(() => {
      const select = document.querySelector('#chat-model-select') as HTMLSelectElement | null;
      return window.location.hash === '#/chat' && !!select && select.value === 'llama3.2:1b';
    });

    const optionStates = await page.$$eval('#chat-model-select option', (options) =>
      options.map((option) => ({ value: option.getAttribute('value'), disabled: option.disabled }))
    );
    expect(optionStates).toContain(jasmine.objectContaining({ value: 'qwen3.5:2b', disabled: true }));

    await page.select('#chat-model-select', 'llama3.2:1b');
    await page.type('#chat-input', 'Compare models in the browser');
    await page.evaluate(() => {
      (document.getElementById('chatForm') as HTMLFormElement | null)?.requestSubmit();
    });

    await page.waitForFunction(() => {
      const labels = Array.from(document.querySelectorAll('.chat-message.llm .bubble-role')).map((el) => el.textContent?.trim());
      const replies = Array.from(document.querySelectorAll('.chat-message.llm .llm-text')).map((el) => el.textContent?.trim());
      return labels.includes('llama3.2:1b') && replies.includes('Browser llama reply');
    });

    const labels = await page.$$eval('.chat-message.llm .bubble-role', (elements) => elements.map((el) => el.textContent?.trim()));
    const replies = await page.$$eval('.chat-message.llm .llm-text', (elements) => elements.map((el) => el.textContent?.trim()));

    expect(labels).toContain('llama3.2:1b');
    expect(replies).toContain('Browser llama reply');
  });
});