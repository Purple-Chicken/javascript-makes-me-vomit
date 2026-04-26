import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  createApiRequest,
  getAvailablePort,
  resolveWritableMongoUri,
  waitForPort,
} from './helpers/api-test-utils.ts';

describe('model API integration', () => {
  const stopProcess = async (child: ChildProcess | null) => {
    if (!child || child.killed) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 1000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill('SIGTERM');
    });
  };

  let apiProcess: ChildProcess | null = null;
  let apiRequest: ReturnType<typeof createApiRequest>;
  let token = '';

  beforeAll(async () => {
    const root = path.resolve('.');
    const port = await getAvailablePort();
    const mongoUri = await resolveWritableMongoUri();
    apiRequest = createApiRequest(`http://127.0.0.1:${port}`);

    apiProcess = spawn(process.execPath, ['--import', 'tsx', path.join(root, 'server.ts')], {
      cwd: root,
      stdio: 'ignore',
      env: { ...process.env, PORT: String(port), MONGODB_URI: mongoUri },
    });

    await waitForPort('127.0.0.1', port, 25000);

    const username = `model_user_${Date.now()}`;
    const password = 'password-123';
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
    token = login.body.token;
  });

  afterAll(async () => {
    await stopProcess(apiProcess);
  });

  it('returns local and cloud models from GET /api/models', async () => {
    const res = await apiRequest('/api/models', { method: 'GET' }, token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBeTrue();

    const categories = new Set((res.body as Array<{ category: string }>).map((m) => m.category));
    expect(categories.has('local')).toBeTrue();
    expect(categories.has('cloud')).toBeTrue();

    const localModel = (res.body as Array<{ id: string; provider: string }>).find((m) => m.id === 'qwen3:0.5b');
    const cloudModel = (res.body as Array<{ id: string; provider: string }>).find((m) => m.id === 'gpt-4o');
    expect(localModel?.provider).toBe('ollama');
    expect(cloudModel?.provider).toBe('openai');
  });

  it('returns a numeric answer for a math prompt on a local model', async () => {
    const res = await apiRequest('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'What is 2 divided by 1?', modelId: 'qwen3:0.5b', isTemporary: true }),
    }, token);

    expect(res.status).toBe(200);
    expect(String(res.body.reply)).toContain('2');
  });

  it('returns an auth error when selecting a cloud model with missing credentials', async () => {
    const res = await apiRequest('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'What is the weather like in Seattle?', modelId: 'gpt-4o', isTemporary: true }),
    }, token);

    if (process.env.OPENAI_API_KEY) {
      expect(res.status).toBe(200);
      expect(String(res.body.reply).toLowerCase()).toContain('seattle');
      return;
    }

    expect([400, 401]).toContain(res.status);
    expect(String(res.body.error)).toContain('OPENAI_API_KEY');
  });
});

