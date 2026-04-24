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

describe('puppeteer visible browser test', () => {
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
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720'],
      defaultViewport: null,
    });
    page = await browser.newPage();
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

  it('opens a real browser window and renders the home shell', async () => {
    if (!page) {
      throw new Error('Puppeteer page not initialized.');
    }

    await page.waitForSelector('#app h1');
    await pause(500);
    const homeText = await page.$eval('#app h1', (el) =>
      el.textContent?.trim(),
    );
    expect(homeText).toBe('SHA-257');
    await pause(1250);
  });
});
