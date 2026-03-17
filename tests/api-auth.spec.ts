import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  createApiRequest,
  getAvailablePort,
  resolveWritableMongoUri,
  waitForPort,
} from './helpers/api-test-utils.ts';

describe('auth API integration', () => {
  const stopProcess = async (child: ChildProcess | null) => {
    if (!child || child.killed) {
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 1000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill('SIGTERM');
    });
  };

  let apiProcess: ChildProcess | null = null;
  let originalTimeout = 0;
  let apiRequest: ReturnType<typeof createApiRequest>;
  let baseUrl = '';

  beforeAll(async () => {
    if (typeof jasmine !== 'undefined') {
      originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
    }

    const root = path.resolve('.');
    const port = await getAvailablePort();
    const mongoUri = await resolveWritableMongoUri();
    baseUrl = `http://127.0.0.1:${port}`;
    apiRequest = createApiRequest(baseUrl);

    apiProcess = spawn(
      process.execPath,
      ['--import', 'tsx', path.join(root, 'server.ts')],
      {
        cwd: root,
        stdio: 'ignore',
        env: { ...process.env, PORT: String(port), MONGODB_URI: mongoUri },
      },
    );

    await waitForPort('127.0.0.1', port, 25000);
  });

  afterAll(async () => {
    await stopProcess(apiProcess);
    if (typeof jasmine !== 'undefined') {
      jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    }
  });

  it('returns 401 for /api/users/me before login', async () => {
    const res = await apiRequest('/api/users/me');
    expect(res.status).toBe(401);
  });

  it('rejects duplicate signup attempts for the same username', async () => {
    const username = `dup_user_${Date.now()}`;
    const password = 'password-123';

    const first = await apiRequest('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const second = await apiRequest('/api/users', {
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
    await apiRequest('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const badLogin = await apiRequest('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'wrong-password' }),
    });

    expect(badLogin.status).toBe(400);
  });

  it('authenticates and can use bearer token on /api/users/me', async () => {
    const username = `token_user_${Date.now()}`;
    const password = 'password-123';

    const signup = await apiRequest('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    expect(signup.status).toBe(201);

    const login = await apiRequest('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    expect(login.status).toBe(200);
    expect(typeof login.body.token).toBe('string');
    expect(login.body.token.length).toBeGreaterThan(0);

    const meAfterLogin = await apiRequest('/api/users/me', {}, login.body.token);
    expect(meAfterLogin.status).toBe(200);
    expect(meAfterLogin.body.username).toBe(username);
  });

  it('rejects signup when username is missing', async () => {
    const res = await apiRequest('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'password-123' }),
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects signup when password is missing', async () => {
    const username = `no_pass_${Date.now()}`;
    const res = await apiRequest('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects login when password is missing', async () => {
    const username = `missing_login_pass_${Date.now()}`;
    await apiRequest('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'password-123' }),
    });

    const res = await apiRequest('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects signup with unsupported content type', async () => {
    const res = await apiRequest('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'username=plain&password=plain',
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
