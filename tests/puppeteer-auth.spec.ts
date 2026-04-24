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

type AuthState = {
  username: string;
  password: string;
  token: string;
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

describe('puppeteer signup/login flow', () => {
  let browser: Browser | null = null;
  let page: Page | null = null;
  let server: ViteDevServer | null = null;
  let baseUrl = '';
  let originalTimeout = 0;
  let state: AuthState = { username: '', password: '', token: 'jwt-token-auth' };
  const pause = (ms: number) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  beforeAll(async () => {
    if (typeof jasmine !== 'undefined') {
      originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
    }

    const root = path.resolve('.');

    const port = await getAvailablePort();
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
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--start-maximized',
      ],
      defaultViewport: null,
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
          body: JSON.stringify({ id: 'user-auth' }),
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
        const authorized = request.headers().authorization === `Bearer ${state.token}`;
        await request.respond({
          status: authorized ? 200 : 401,
          contentType: 'application/json',
          body: JSON.stringify(authorized
            ? {
                username: state.username,
                profilePic: 0,
                preferences: {
                  matrixRain: true,
                  lightMode: false,
                  font: 'ibm-plex',
                  themeColor: 'green',
                },
              }
            : { error: 'Unauthorized' }),
        });
        return;
      }

      if (pathname === '/api/conversations' && request.method() === 'GET') {
        await request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
        return;
      }

      if (pathname === '/api/chat/models' && request.method() === 'GET') {
        await request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            models: [
              { name: 'qwen3.5:2b', busy: false, conversationId: null },
              { name: 'gemma3:1b', busy: false, conversationId: null },
            ],
          }),
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
    await pause(1000);
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

  it('creates an account and logs in', async () => {
    if (!page) {
      throw new Error('Puppeteer page not initialized.');
    }

    const username = `puppeteer_${Date.now()}`;
    const password = 'test-password-123';
    const typingDelayMs = 120;

    await page.waitForSelector('#topbar-signup');
    await page.click('#topbar-signup');
    await pause(750);
    await page.waitForSelector('#signupForm');

    await page.type('#username', username, { delay: typingDelayMs });
    await pause(500);
    await page.type('#password', password, { delay: typingDelayMs });
    await pause(500);
    await page.type('#password-confirm', password, { delay: typingDelayMs });
    await pause(500);

    await page.evaluate(() => {
      (document.getElementById('signupForm') as HTMLFormElement | null)?.requestSubmit();
    });
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
    await pause(500);
    await page.evaluate(() => {
      (document.getElementById('loginForm') as HTMLFormElement | null)?.requestSubmit();
    });
    await pause(1000);

    await page.waitForFunction(
      () => document.querySelector('#app h1')?.textContent?.trim() === 'Chat',
    );

    const chatText = await page.$eval('#app h1', (el) =>
      el.textContent?.trim(),
    );
    expect(chatText).toBe('Chat');
    await pause(1500);
  });
});
