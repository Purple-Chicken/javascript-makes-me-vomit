import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import puppeteer from 'puppeteer';
import { createServer, type ViteDevServer } from 'vite';

const execFileAsync = promisify(execFile);
const outputDir = path.resolve('tests', 'puppeteer-video-output');
const ffmpegOutput = path.join(outputDir, 'multi-llm-chat.mp4');
const frameDir = path.join(outputDir, 'frames');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureDirectory(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function clearDirectory(dir: string) {
  try {
    const entries = await fs.readdir(dir);
    await Promise.all(entries.map((entry) => fs.unlink(path.join(dir, entry))));
  } catch (err) {
    // ignore missing directory
  }
}

async function startScreencast(page: puppeteer.Page): Promise<{ stop: () => Promise<number> }> {
  const client = await page.target().createCDPSession();
  await client.send('Page.enable');
  await client.send('Page.startScreencast', {
    format: 'png',
    quality: 70,
    maxWidth: 1280,
    maxHeight: 1080,
    everyNthFrame: 1,
  });

  let frameCount = 0;
  await ensureDirectory(frameDir);
  await clearDirectory(frameDir);

  client.on('Page.screencastFrame', async (event: any) => {
    const filename = path.join(frameDir, `frame-${String(frameCount).padStart(4, '0')}.png`);
    await fs.writeFile(filename, Buffer.from(event.data, 'base64'));
    await client.send('Page.screencastFrameAck', { sessionId: event.sessionId });
    frameCount += 1;
  });

  return {
    stop: async () => {
      await client.send('Page.stopScreencast');
      return frameCount;
    },
  };
}

async function buildVideoFromFrames() {
  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-framerate', '10',
      '-i', path.join(frameDir, 'frame-%04d.png'),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      ffmpegOutput,
    ]);
    console.log(`Video written to ${ffmpegOutput}`);
  } catch (error) {
    console.warn('ffmpeg not available or failed to create video. Frames are stored in:', frameDir);
    console.warn('Install ffmpeg and rerun this script to generate the MP4 file.');
  }
}

async function getAvailablePort(): Promise<number> {
  const net = await import('node:net');
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address?.port) {
          resolve(address.port);
        } else {
          reject(new Error('Could not acquire an available port.'));
        }
      });
    });
  });
}

async function run() {
  await ensureDirectory(outputDir);
  await ensureDirectory(frameDir);
  await clearDirectory(frameDir);

  const port = await getAvailablePort();
  const root = path.resolve('.');

  const server: ViteDevServer = await createServer({
    root,
    logLevel: 'error',
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
    },
  });
  await server.listen();

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,640'],
    defaultViewport: null,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 640 });

  const baseUrl = `http://127.0.0.1:${port}`;
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await wait(1000);

  const recorder = await startScreencast(page);

  const username = `puppeteer-video-${Date.now()}`;
  const password = 'MultiLLM123!';

  await page.goto(`${baseUrl}/#/signup`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#signupForm');
  await page.type('#signupForm #username', username);
  await page.type('#signupForm #password', password);
  await page.type('#signupForm #password-confirm', password);
  await page.click('#signupForm button[type=submit]');
  await page.waitForFunction(
    () => window.location.hash === '#/login',
    { timeout: 20000 },
  );
  await wait(100);

  await page.type('#loginForm #password', password);
  await page.click('#loginForm button[type=submit]');
  await page.waitForFunction(
    () => window.location.hash.startsWith('#/chat'),
    { timeout: 20000 },
  );

  await page.waitForSelector('#multiLLM');

  const multiCheckbox = await page.$('#multiLLM');
  if (multiCheckbox) {
    const isChecked = await page.evaluate((el) => (el as HTMLInputElement).checked, multiCheckbox);
    if (!isChecked) {
      await multiCheckbox.click();
    }
  }

  await page.select('#llm1', 'llama3.2:1b');
  await page.select('#llm2', 'qwen3:8b');
  await page.select('#llm3', 'mistral:7b');
  await page.click('#save-chat-settings');
  await wait(120);

  await page.click('#chat-input');
  await page.type(
    '#chat-input',
    'Show a short friendly summary of how multi-LLM chat works in this app.',
  );
  await page.keyboard.press('Enter');

  await page.waitForFunction(
    () => document.querySelectorAll('.chat-message.llm').length >= 1,
    { timeout: 60000 },
  );
  await wait(8000);

  const frames = await recorder.stop();
  console.log(`Captured ${frames} frames.`);

  await buildVideoFromFrames();

  await page.screenshot({ path: path.join(outputDir, 'final-state.png') });
  await browser.close();
  await server.close();
}

run().catch((error) => {
  console.error('Puppeteer video script failed:', error);
  process.exit(1);
});
