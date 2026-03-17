import net from 'node:net';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

describe('user account API', () => {
  const baseUrl = 'http://127.0.0.1:5000';
  let apiProcess: ChildProcess | null = null;
  let startedByTest = false;
  let originalTimeout = 0;

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

  it('creates a user with POST /api/signup', async () => {
    const username = `api_spec_create_${Date.now()}`;
    const password = 'create-pass-123';

    const signup = await apiRequest('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    expect(signup.status).toBe(201);
    expect(signup.body.message).toBe('User created');

    const login = await apiRequest('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    expect(login.status).toBe(200);
  });

  it('modifies an account password with PATCH /api/change-password', async () => {
    const username = `api_spec_modify_${Date.now()}`;
    const oldPassword = 'old-pass-123';
    const newPassword = 'new-pass-456';
    let cookieJar = '';

    const signup = await apiRequest('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: oldPassword }),
    });
    expect(signup.status).toBe(201);

    const loginOld = await apiRequest('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: oldPassword }),
    }, cookieJar);
    cookieJar = loginOld.cookieJar;
    expect(loginOld.status).toBe(200);

    const changePassword = await apiRequest('/api/change-password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword }),
    }, cookieJar);
    expect(changePassword.status).toBe(200);
    expect(changePassword.body.message).toContain('Password updated');

    const logout = await apiRequest('/api/logout', { method: 'POST' }, cookieJar);
    cookieJar = logout.cookieJar;
    expect(logout.status).toBe(200);

    const loginWithOld = await apiRequest('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: oldPassword }),
    });
    expect(loginWithOld.status).toBe(401);

    const loginWithNew = await apiRequest('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: newPassword }),
    });
    expect(loginWithNew.status).toBe(200);
  });

  it('deletes an account with DELETE /api/delete-user', async () => {
    const username = `api_spec_delete_${Date.now()}`;
    const password = 'delete-pass-123';
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

    const deleteUser = await apiRequest('/api/delete-user', {
      method: 'DELETE',
    }, cookieJar);
    expect(deleteUser.status).toBe(200);
    expect(deleteUser.body.message).toContain('User deleted');

    const loginAfterDelete = await apiRequest('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    expect(loginAfterDelete.status).toBe(401);
  });
});
