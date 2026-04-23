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
        await request.respond({ status: 200, contentType: 'application/json', body: '[]' });
        return;
      }
      if (url.pathname === '/api/chat/models') {
        await request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ models: ['qwen3:8b', 'mistral:7b'] }),
        });
        return;
      }
      if (url.pathname === '/api/chat') {
        await request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            conversationId: 'conv-1',
            replies: [
              { model: 'qwen3:8b', reply: 'Browser first reply' },
              { model: 'mistral:7b', reply: 'Browser second reply' },
            ],
          }),
        });
        return;
      }
      await request.continue();
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('token', 'jwt-token-1');
    });
    await page.goto(`${baseUrl}/#/chat`, { waitUntil: 'domcontentloaded' });
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

  it('selects two models and renders separate replies', async () => {
    if (!page) {
      throw new Error('Puppeteer page not initialized.');
    }

    await page.waitForSelector('#chat-models input[value="mistral:7b"]');
    await page.click('#chat-models input[value="mistral:7b"]');
    await page.type('#chat-input', 'Compare models in the browser');
    await page.click('#send-btn');

    await page.waitForFunction(() => {
      const labels = Array.from(document.querySelectorAll('.chat-message.llm .bubble-role')).map((el) => el.textContent?.trim());
      const replies = Array.from(document.querySelectorAll('.chat-message.llm .llm-text')).map((el) => el.textContent?.trim());
      return labels.includes('qwen3:8b') && labels.includes('mistral:7b') && replies.includes('Browser second reply');
    });

    const labels = await page.$$eval('.chat-message.llm .bubble-role', (elements) => elements.map((el) => el.textContent?.trim()));
    const replies = await page.$$eval('.chat-message.llm .llm-text', (elements) => elements.map((el) => el.textContent?.trim()));

    expect(labels).toContain('qwen3:8b');
    expect(labels).toContain('mistral:7b');
    expect(replies).toContain('Browser first reply');
    expect(replies).toContain('Browser second reply');
  });
});