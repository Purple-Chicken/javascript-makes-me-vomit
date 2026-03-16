import net from 'node:net';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

const baseUrl = 'http://127.0.0.1:5000';

const waitFor = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isPortOpen = async (host: string, port: number): Promise<boolean> =>
  await new Promise((resolve) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(750, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });

const waitForPort = async (host: string, port: number, timeoutMs = 20000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(host, port)) {
      return;
    }
    await waitFor(250);
  }
  throw new Error(`Timeout waiting for ${host}:${port}`);
};

const mergeCookies = (currentJar: string, headers: Headers): string => {
  const byName = new Map<string, string>();
  if (currentJar) {
    for (const cookie of currentJar.split(';').map((part) => part.trim())) {
      const [name, value] = cookie.split('=');
      if (name && typeof value !== 'undefined') {
        byName.set(name, value);
      }
    }
  }

  const headerAny = headers as any;
  const setCookies: string[] =
    typeof headerAny.getSetCookie === 'function'
      ? headerAny.getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie') as string]
        : [];

  for (const setCookie of setCookies) {
    const [cookiePair] = setCookie.split(';');
    const [name, value] = cookiePair.split('=');
    if (name && typeof value !== 'undefined') {
      byName.set(name.trim(), value.trim());
    }
  }

  return Array.from(byName.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
};

const apiRequest = async (
  endpoint: string,
  options: RequestInit = {},
  cookieJar = '',
): Promise<{ status: number; body: any; cookieJar: string }> => {
  const headers = new Headers(options.headers);
  if (cookieJar) {
    headers.set('cookie', cookieJar);
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers,
  });
  const nextJar = mergeCookies(cookieJar, response.headers);
  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();
  const body =
    contentType.includes('application/json') && text
      ? JSON.parse(text)
      : text;

  return { status: response.status, body, cookieJar: nextJar };
};

describe('auth API integration', () => {
  let apiProcess: ChildProcess | null = null;
  let startedByTest = false;
  let originalTimeout = 0;

  beforeAll(async () => {
    if (typeof jasmine !== 'undefined') {
      originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
    }

    const alreadyRunning = await isPortOpen('127.0.0.1', 5000);
    if (!alreadyRunning) {
      const root = path.resolve('.');
      apiProcess = spawn(
        process.execPath,
        ['--import', 'tsx', path.join(root, 'server.ts')],
        {
          cwd: root,
          stdio: 'ignore',
          env: { ...process.env },
        },
      );
      startedByTest = true;
    }

    await waitForPort('127.0.0.1', 5000, 25000);
  });

  afterAll(() => {
    if (startedByTest && apiProcess && !apiProcess.killed) {
      apiProcess.kill('SIGTERM');
    }
    if (typeof jasmine !== 'undefined') {
      jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    }
  });

  it('returns 401 for /api/me before login', async () => {
    const res = await apiRequest('/api/me');
    expect(res.status).toBe(401);
  });

  it('rejects duplicate signup attempts for the same username', async () => {
    const username = `dup_user_${Date.now()}`;
    const password = 'password-123';

    const first = await apiRequest('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const second = await apiRequest('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    expect(first.status).toBe(201);
    expect(second.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects login with invalid credentials', async () => {
    const username = `invalid_login_${Date.now()}`;
    const password = 'password-123';
    await apiRequest('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const badLogin = await apiRequest('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'wrong-password' }),
    });

    expect(badLogin.status).toBe(401);
  });

  it('authenticates then invalidates session after logout', async () => {
    const username = `session_user_${Date.now()}`;
    const password = 'password-123';
    let cookieJar = '';

    const signup = await apiRequest('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    expect(signup.status).toBe(201);

    const login = await apiRequest('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }, cookieJar);
    cookieJar = login.cookieJar;

    expect(login.status).toBe(200);
    expect(cookieJar).toContain('connect.sid=');

    const meAfterLogin = await apiRequest('/api/me', {}, cookieJar);
    expect(meAfterLogin.status).toBe(200);

    const logout = await apiRequest('/api/logout', {
      method: 'POST',
    }, cookieJar);
    cookieJar = logout.cookieJar;
    expect(logout.status).toBe(200);

    const meAfterLogout = await apiRequest('/api/me', {}, cookieJar);
    expect(meAfterLogout.status).toBe(401);
  });
});
