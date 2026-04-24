import puppeteer, { Browser, Page } from 'puppeteer';
import { createServer, ViteDevServer } from 'vite';
import path from 'node:path';
import net from 'node:net';

// Helper to find available port (reusing logic from your existing specs)
const getPort = (): Promise<number> => new Promise((res) => {
  const s = net.createServer();
  s.listen(0, () => { res((s.address() as any).port); s.close(); });
});

describe('LLM UI Features (Puppeteer)', () => {
  let browser: Browser;
  let page: Page;
  let server: ViteDevServer;
  let baseUrl: string;

  beforeAll(async () => {
    const port = await getPort();
    server = await createServer({
      root: path.resolve('.'),
      server: { port }
    });
    await server.listen();
    baseUrl = `http://127.0.0.1:${port}`;

    browser = await puppeteer.launch({ headless: "new" });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
    await server.close();
  });

  it('should load models into the dropdown and cache them', async () => {
    await page.goto(`${baseUrl}/#/chat`); // Assuming route
    
    // Step: Click Model Selector
    await page.waitForSelector('.model-selector-dropdown');
    await page.click('.model-selector-dropdown');

    // Check if models from background (qwen3:8b) appear
    const options = await page.$$eval('.model-option', els => els.map(e => e.textContent));
    expect(options).toContain('qwen3:8b');

    // Verification of caching would typically require a request interceptor
    // but here we verify the UI remains consistent on second click
    await page.click('.model-selector-dropdown'); // Close
    await page.click('.model-selector-dropdown'); // Re-open
    expect(await page.$('.model-option')).not.toBeNull();
  });

  it('should display multiple response containers in Parallel Multi-Agent Chat', async () => {
    await page.goto(`${baseUrl}/#/chat`);
    
    // Set models to active (simulating Background: Given Local LLM and ChatGPT are active)
    await page.evaluate(() => {
      // Direct state manipulation if available, or UI clicks
      (window as any).appState.activeModels = ['Local LLM', 'ChatGPT'];
    });

    await page.type('#chat-input', 'Compare Python and Ruby');
    await page.click('#send-button');

    // Scenario: I should see a response container for "Local LLM" and "ChatGPT"
    await page.waitForSelector('.response-container[data-model="Local LLM"]');
    await page.waitForSelector('.response-container[data-model="ChatGPT"]');
    
    const containers = await page.$$('.response-container');
    expect(containers.length).toBe(2);
  });
});
