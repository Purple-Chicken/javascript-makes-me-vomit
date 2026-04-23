/// <reference types="jasmine" />

import http from 'node:http';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  createApiRequest,
  getAvailablePort,
  resolveWritableMongoUri,
  waitForPort,
} from './helpers/api-test-utils.ts';

describe('chat API multi-model integration', () => {
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
  let ollamaServer: http.Server | null = null;
  let originalTimeout = 0;
  let apiRequest: ReturnType<typeof createApiRequest>;

  beforeAll(async () => {
    if (typeof jasmine !== 'undefined') {
      originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
    }

    const root = path.resolve('.');
    const apiPort = await getAvailablePort();
    const ollamaPort = await getAvailablePort();
    const mongoUri = await resolveWritableMongoUri();
    apiRequest = createApiRequest(`http://127.0.0.1:${apiPort}`);

    ollamaServer = http.createServer(async (req, res) => {
      if (req.method !== 'POST' || req.url !== '/api/chat') {
        res.writeHead(404).end();
        return;
      }

      const body = await new Promise<string>((resolve, reject) => {
        let buffer = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => {
          buffer += chunk;
        });
        req.on('end', () => resolve(buffer));
        req.on('error', reject);
      });

      const payload = JSON.parse(body) as { model?: string; stream?: boolean; messages?: Array<{ role: string; content: string }> };
      const prompt = payload.messages?.at(-1)?.content ?? '';
      const model = payload.model ?? 'unknown';
      const content = `<think>internal</think>${model} answered ${prompt}`;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: { content } }));
    });

    await new Promise<void>((resolve, reject) => {
      ollamaServer!.once('error', reject);
      ollamaServer!.listen(ollamaPort, '127.0.0.1', () => resolve());
    });

    apiProcess = spawn(
      process.execPath,
      ['--import', 'tsx', path.join(root, 'server.ts')],
      {
        cwd: root,
        stdio: 'ignore',
        env: {
          ...process.env,
          PORT: String(apiPort),
          MONGODB_URI: mongoUri,
          OLLAMA_URL: `http://127.0.0.1:${ollamaPort}`,
          OLLAMA_MODEL: 'qwen3:8b',
          OLLAMA_MODELS: 'qwen3:8b,mistral:7b,llama3.2:3b',
        },
      },
    );

    await waitForPort('127.0.0.1', apiPort, 25000);
  }, 60000);

  afterAll(async () => {
    await stopProcess(apiProcess);
    if (ollamaServer) {
      await new Promise<void>((resolve, reject) => {
        ollamaServer!.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
    if (typeof jasmine !== 'undefined') {
      jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    }
  }, 60000);

  it('lists the configured chat models', async () => {
    const username = `chat_models_${Date.now()}`;
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

    const models = await apiRequest('/api/chat/models', {}, login.body.token as string);

    expect(models.status).toBe(200);
    expect(models.body.models).toEqual(['qwen3:8b', 'mistral:7b', 'llama3.2:3b']);
  });

  it('returns one reply per requested model and persists model labels', async () => {
    const username = `chat_multi_${Date.now()}`;
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
    const token = login.body.token as string;

    const chat = await apiRequest(
      '/api/chat',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Compare these models',
          models: ['mistral:7b', 'qwen3:8b'],
        }),
      },
      token,
    );

    expect(chat.status).toBe(200);
    expect(chat.body.replies).toEqual([
      { model: 'mistral:7b', reply: 'mistral:7b answered Compare these models' },
      { model: 'qwen3:8b', reply: 'qwen3:8b answered Compare these models' },
    ]);

    const conversation = await apiRequest(`/api/conversations/${chat.body.conversationId}`, {}, token);
    expect(conversation.status).toBe(200);
    expect(conversation.body.messages).toEqual([
      { role: 'user', content: 'Compare these models' },
      { role: 'assistant', model: 'mistral:7b', content: 'mistral:7b answered Compare these models' },
      { role: 'assistant', model: 'qwen3:8b', content: 'qwen3:8b answered Compare these models' },
    ]);
  });
});