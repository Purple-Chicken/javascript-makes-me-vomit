import net from 'node:net';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { MongoClient } from 'mongodb';
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

const waitForPort = async (host: string, port: number, timeoutMs = 15000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection({ host, port }, () => {
          socket.end();
          resolve();
        });
        socket.on('error', reject);
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timeout waiting for ${host}:${port}`);
};

const resolveMongoUri = async (): Promise<string> => {
  const candidates = [
    process.env.MONGODB_URI,
    'mongodb://127.0.0.1:27017/sha257',
    'mongodb://127.0.0.1:27017/mydb',
    'mongodb://admin:admin@127.0.0.1:27017/mydb?authSource=admin',
  ].filter((uri): uri is string => Boolean(uri));

  for (const uri of candidates) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000,
    });
    try {
      await client.connect();
      return uri;
    } catch {
      // Try next URI candidate.
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  throw new Error(
    'No reachable MongoDB URI found. Set MONGODB_URI or start MongoDB (for example: docker compose -f backend/docker-compose.yaml up -d).',
  );
};

describe('puppeteer signup/login flow', () => {
  let browser: Browser | null = null;
  let page: Page | null = null;
  let server: ViteDevServer | null = null;
  let baseUrl = '';
  let originalTimeout = 0;
  let apiProcess: ChildProcess | null = null;
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
    const mongoUri = await resolveMongoUri();

    apiProcess = spawn(
      process.execPath,
      ['--import', 'tsx', path.join(root, 'server.ts')],
      {
        cwd: root,
        stdio: 'ignore',
        env: { ...process.env, MONGODB_URI: mongoUri },
      },
    );

    await waitForPort('127.0.0.1', 5000, 20000);

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
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720'],
      defaultViewport: null,
    });
    page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await pause(1000);
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
    if (apiProcess) {
      apiProcess.kill('SIGTERM');
    }
    if (typeof jasmine !== 'undefined') {
      jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    }
  });

  it('creates an account and logs in', async () => {
    if (!page) {
      throw new Error('Puppeteer page not initialized.');
    }

    const username = `puppeteer_${Date.now()}`;
    const password = 'test-password-123';

    await page.waitForSelector('nav a[href="#/login"]');
    await page.click('nav a[href="#/login"]');
    await pause(750);
    await page.waitForFunction(
      () => document.querySelector('#app h1')?.textContent?.trim() === 'Login',
    );

    await page.click('a[href="#/signup"]');
    await pause(750);
    await page.waitForSelector('#signupForm');

    await page.type('#username', username);
    await pause(500);
    await page.type('#password', password);
    await pause(500);
    await page.type('#password-confirm', password);
    await pause(500);

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.click('#signupForm button[type="submit"]');
    await pause(1000);

    await page.waitForFunction(
      () => document.querySelector('#app h1')?.textContent?.trim() === 'Login',
    );

    await page.type('#username', username);
    await pause(500);
    await page.type('#password', password);
    await pause(500);
    await page.click('button[type="submit"]');
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
