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

const API_BASE_URL = process.env.PUPPETEER_API_BASE_URL || 'http://127.0.0.1:5000';

const waitForApi = async (timeoutMs = 30000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/me`);
      if ([200, 401].includes(res.status)) {
        return;
      }
    } catch {
      // Retry until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for API server at ${API_BASE_URL}`);
};

const createAuthToken = async () => {
  const username = `puppeteer_visible_${Date.now()}`;
  const password = 'puppeteer-visible-pass-123';

  await fetch(`${API_BASE_URL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const login = await fetch(`${API_BASE_URL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const body = await login.json().catch(() => ({}));
  if (!login.ok || typeof body.token !== 'string' || !body.token) {
    throw new Error(`Failed to authenticate Puppeteer user against ${API_BASE_URL}`);
  }

  return body.token as string;
};

describe('puppeteer visible multi-LLM flow', () => {
  let browser: Browser | null = null;
  let page: Page | null = null;
  let server: ViteDevServer | null = null;
  let baseUrl = '';
  let authToken = '';
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

    await waitForApi();
    authToken = await createAuthToken();

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
    await page.evaluateOnNewDocument((token) => {
      localStorage.setItem('token', token);
    }, authToken);

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
    await page.evaluate(() => {
      window.location.hash = '#/chat';
    });

    await page.waitForFunction(
      () => document.querySelector('#app h1')?.textContent?.trim() === 'Chat',
    );

    // Force a deterministic two-model comparison for the real API run.
    const comparedModels = ['qwen2.5:0.5b', 'qwen2.5:1.5b'];
    await page.evaluate((models) => {
      const wanted = new Set(models);
      document.querySelectorAll<HTMLInputElement>('.model-select').forEach((input) => {
        input.checked = wanted.has(input.value);
      });
    }, comparedModels);

    await page.waitForSelector('#chat-input');
    await page.type('#chat-input', 'Compare shortest path algorithms');
    await page.keyboard.press('Enter');

    await page.waitForFunction(
      () => {
        const cards = document.querySelectorAll('.multi-model-group .multi-model-card').length;
        const hasText = Array.from(document.querySelectorAll('.multi-model-group .llm-text')).some(
          (node) => (node.textContent || '').trim().length > 0,
        );
        return cards >= 2 && hasText;
      },
      { timeout: 120000 },
    );

    const labels = await page.$$eval('.multi-model-group .bubble-role', (nodes) =>
      nodes.map((n) => (n.textContent || '').trim()),
    );

    expect(labels).toContain('Ollama / qwen2.5:0.5b');
    expect(labels).toContain('Ollama / qwen2.5:1.5b');

    const responseCount = await page.$$eval('.multi-model-group .llm-text', (nodes) =>
      nodes.filter((n) => (n.textContent || '').trim().length > 0).length,
    );
    expect(responseCount).toBeGreaterThanOrEqual(2);

    await pause(2500);
  });
});

