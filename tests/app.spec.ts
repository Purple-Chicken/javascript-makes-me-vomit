import { JSDOM } from 'jsdom';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import { handleRoute, router } from '../src/router.js';

describe('account database', () => {
  it('exists and can be written to and read from', async () => {
    const fixturePath = path.resolve('tests/fixtures/accounts.json');
    const content = await fs.readFile(fixturePath, 'utf-8');
    const data = JSON.parse(content) as Array<{ id: string; username: string }>;

    expect(Array.isArray(data)).toBeTrue();

    const tempPath = path.join(os.tmpdir(), `accounts-${Date.now()}.json`);
    const updated = [...data, { id: 'acct-2', username: 'second_user' }];

    await fs.writeFile(tempPath, JSON.stringify(updated, null, 2), 'utf-8');
    const reread = JSON.parse(await fs.readFile(tempPath, 'utf-8')) as Array<{
      id: string;
      username: string;
    }>;

    expect(reread.length).toBe(updated.length);
    expect(reread.some((acct) => acct.id === 'acct-2')).toBeTrue();
  });
});

describe('mongo database', () => {
  const mongoUri =
    process.env.MONGODB_URI ??
    'mongodb://admin:admin@127.0.0.1:27017/mydb?authSource=admin';
  const url = new URL(mongoUri);
  const host = url.hostname || '127.0.0.1';
  const port = Number(url.port || '27017');
  let originalTimeout = 5000;

  beforeAll(() => {
    if (typeof jasmine !== 'undefined') {
      originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 15000;
    }
  });

  afterAll(() => {
    if (typeof jasmine !== 'undefined') {
      jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    }
  });

  it('can reach the MongoDB server port', async () => {
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host, port }, () => {
        socket.end();
        resolve();
      });
      socket.setTimeout(2000, () => {
        socket.destroy();
        reject(new Error(`Timeout connecting to ${host}:${port}`));
      });
      socket.on('error', reject);
    });
  });

  it('can add, find, and remove a user', async () => {
    const client = new MongoClient(mongoUri);
    try {
      await client.connect();
      const db = client.db();
      const users = db.collection('users');
      const username = `jasmine_test_${Date.now()}`;

      await users.insertOne({ username, ts: new Date() });
      const found = await users.findOne({ username });
      expect(found?.username).toBe(username);

      const deleted = await users.deleteOne({ username });
      expect(deleted.deletedCount).toBe(1);
    } finally {
      await client.close();
    }
  });
});

describe('routing status', () => {
  it('returns a valid page for known routes and 404 for unknown routes', () => {
    const app = { innerHTML: '' };
    const modules = {
      '/valid': { html: '<h1>200 OK</h1>' },
      '404': { html: '<h1>404</h1>' },
    };

    router(app as any, '/valid', modules as any);
    expect(app.innerHTML).toContain('200 OK');
    expect(app.innerHTML).not.toContain('404');

    router(app as any, '/missing', modules as any);
    expect(app.innerHTML).toContain('404');
  });
});

describe('button navigation', () => {
  beforeEach(() => {
    const app = { innerHTML: '' };
    const keyOutput = { textContent: '' };

    (globalThis as any).document = {
      getElementById: (id: string) => {
        if (id === 'app') return app;
        if (id === 'keyOutput') return keyOutput;
        return null;
      },
    };

    (globalThis as any).location = { hash: '#/' };
    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).location;
  });

  it('redirects correctly when a button click updates the hash', () => {
    const button = { onclick: null as null | (() => void) };

    button.onclick = () => {
      (globalThis as any).location.hash = '#/login';
      handleRoute();
    };

    button.onclick();

    const app = (globalThis as any).document.getElementById('app');
    expect(app.innerHTML).toContain('Login');
  });
});


describe('image assets', () => {
  it('loads image resources from disk', async () => {
    const pngPath = path.resolve('static/assets/logo.png');
    const icoPath = path.resolve('static/assets/favicon.ico');

    const png = await fs.readFile(pngPath);
    const ico = await fs.readFile(icoPath);

    expect(png.length).toBeGreaterThan(0);
    expect(ico.length).toBeGreaterThan(0);

    const isPng =
      png[0] === 0x89 &&
      png[1] === 0x50 &&
      png[2] === 0x4e &&
      png[3] === 0x47;

    expect(isPng).toBeTrue();
  });
});
