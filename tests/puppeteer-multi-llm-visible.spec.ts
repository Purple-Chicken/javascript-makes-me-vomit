import net from 'node:net';
import path from 'node:path';
import puppeteer, { type Browser, type HTTPRequest, type Page } from 'puppeteer';
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

const respondWithMockApi = async (request: HTTPRequest) => {
  const url = new URL(request.url());
  const { pathname } = url;
  const method = request.method();

  if (method === 'GET' && pathname === '/api/users/me') {
    await request.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        username: 'puppeteer-user',
        preferences: {
          matrixRain: true,
          lightMode: false,
          font: 'ibm-plex',
          themeColor: 'green',
          defaultModelSet: [
            { provider: 'Ollama', model: 'qwen2.5:3b' },
            { provider: 'Ollama', model: 'mistral:7b' },
          ],
        },
      }),
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/chat') {
    const payload = JSON.parse(request.postData() || '{}') as {
      message?: string;
      selectedModels?: Array<{ provider?: string; model?: string }>;
    };

    const selected = Array.isArray(payload.selectedModels) ? payload.selectedModels : [];
    const responses = selected.map((m) => ({
      provider: m.provider || 'Ollama',
      model: m.model || 'unknown-model',
      content: `Mock reply from ${m.model || 'unknown-model'}: ${payload.message || ''}`,
    }));

    await request.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        conversationId: 'conv-puppeteer-1',
        responses,
        errors: [],
      }),
    });
    return;
  }

  await request.continue();
};

describe('puppeteer visible multi-LLM flow', () => {
  let browser: Browser | null = null;
  let page: Page | null = null;
  let server: ViteDevServer | null = null;
  let baseUrl = '';
  let originalTimeout = 0;

  const pause = (ms: number) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

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
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
      defaultViewport: null,
    });

    page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('token', 'puppeteer-visible-token');
    });

    await page.setRequestInterception(true);
    page.on('request', (request) => {
      void respondWithMockApi(request);
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await pause(1500);
  });

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
  });

  it('shows side-by-side responses for default multi-model selection', async () => {
    if (!page) {
      throw new Error('Puppeteer page not initialized.');
    }

    await page.waitForSelector('nav a[href="#/chat"]');
    await page.click('nav a[href="#/chat"]');

    await page.waitForFunction(
      () => document.querySelector('#app h1')?.textContent?.trim() === 'Chat',
    );

    await page.waitForSelector('#chat-input');
    await page.type('#chat-input', 'Compare shortest path algorithms');
    await page.keyboard.press('Enter');

    await page.waitForFunction(
      () => document.querySelectorAll('.multi-model-group .multi-model-card').length >= 2,
    );

    const labels = await page.$$eval('.multi-model-group .bubble-role', (nodes) =>
      nodes.map((n) => (n.textContent || '').trim()),
    );

    expect(labels).toContain('Ollama / qwen2.5:3b');
    expect(labels).toContain('Ollama / mistral:7b');

    const responseCount = await page.$$eval('.multi-model-group .llm-text', (nodes) =>
      nodes.filter((n) => (n.textContent || '').trim().length > 0).length,
    );
    expect(responseCount).toBeGreaterThanOrEqual(2);

    await pause(2500);
  });
});

