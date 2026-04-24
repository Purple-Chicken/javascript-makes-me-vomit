import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  createApiRequest,
  getAvailablePort,
  resolveWritableMongoUri,
  waitForPort,
} from './helpers/api-test-utils.ts';

describe('user account API', () => {
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

  beforeAll(async () => {
    if (typeof jasmine !== 'undefined') {
      originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
    }

    const root = path.resolve('.');
    const port = await getAvailablePort();
    const mongoUri = await resolveWritableMongoUri();
    apiRequest = createApiRequest(`http://127.0.0.1:${port}`);

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

  it('creates a user with POST /api/users', async () => {
    const username = `api_spec_create_${Date.now()}`;
    const password = 'create-pass-123';

    const signup = await apiRequest('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    expect(signup.status).toBe(201);
    expect(signup.body.message).toBe('User created');

    const login = await apiRequest('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    expect(login.status).toBe(200);
  });

  it('modifies an account password with PATCH /api/users/me', async () => {
    const username = `api_spec_modify_${Date.now()}`;
    const oldPassword = 'old-pass-123';
    const newPassword = 'new-pass-456';

    await apiRequest('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: oldPassword }),
    });

    const loginOld = await apiRequest('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: oldPassword }),
    });
    const token = loginOld.body.token as string;
    expect(loginOld.status).toBe(200);

    const changePassword = await apiRequest(
      '/api/users/me',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword }),
      },
      token,
    );
    expect(changePassword.status).toBe(200);
    expect(changePassword.body.message).toContain('Account updated');

    const loginWithOld = await apiRequest('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: oldPassword }),
    });
    expect(loginWithOld.status).toBe(400);

    const loginWithNew = await apiRequest('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: newPassword }),
    });
    expect(loginWithNew.status).toBe(200);
  });

  it('saves a default model set with PATCH /api/users/me', async () => {
    const username = `api_spec_defaults_${Date.now()}`;
    const password = 'default-pass-123';

    await apiRequest('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const login = await apiRequest('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const token = login.body.token as string;
    expect(login.status).toBe(200);

    const defaultModelSet = [
      { provider: 'Ollama', model: 'qwen2.5:3b' },
      { provider: 'Ollama', model: 'mistral:7b' },
    ];

    const update = await apiRequest(
      '/api/users/me',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: { defaultModelSet } }),
      },
      token,
    );

    expect(update.status).toBe(200);
    expect(update.body.message).toContain('Account updated');

    const profile = await apiRequest('/api/users/me', {}, token);
    expect(profile.status).toBe(200);
    expect(profile.body.preferences.defaultModelSet).toEqual(defaultModelSet);
  });

  it('deletes an account with DELETE /api/users/me', async () => {
    const username = `api_spec_delete_${Date.now()}`;
    const password = 'delete-pass-123';

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
    const token = login.body.token as string;
    expect(login.status).toBe(200);

    const deleteUser = await apiRequest('/api/users/me', { method: 'DELETE' }, token);
    expect(deleteUser.status).toBe(200);
    expect(deleteUser.body.message).toContain('User deleted');

    const meAfterDelete = await apiRequest('/api/users/me', {}, token);
    expect(meAfterDelete.status).toBe(401);

    const loginAfterDelete = await apiRequest('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    expect(loginAfterDelete.status).toBe(400);
  });

  it('rejects change password without an authenticated token', async () => {
    const res = await apiRequest('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'new-pass-123' }),
    });

    expect(res.status).toBe(401);
  });

  it('rejects delete user without an authenticated token', async () => {
    const res = await apiRequest('/api/users/me', {
      method: 'DELETE',
    });

    expect(res.status).toBe(401);
  });

  it('rejects change password when password is missing', async () => {
    const username = `change_missing_${Date.now()}`;
    const password = 'old-pass-123';

    await apiRequest('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const login = await apiRequest('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const res = await apiRequest(
      '/api/users/me',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      login.body.token as string,
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
