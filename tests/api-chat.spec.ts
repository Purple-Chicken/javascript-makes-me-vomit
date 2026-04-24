/// <reference types="jasmine" />

import http from 'node:http';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  createApiRequest,
  getAvailablePort,
  resolveWritableMongoUri,
  waitFor,
  waitForPort,
} from './helpers/api-test-utils.ts';

describe('chat API model session integration', () => {
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
  const pendingModels = new Map<string, () => void>();

  const waitForConversationStatus = async (
    token: string,
    conversationId: string,
    status: string,
    timeoutMs = 5000,
  ) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const conversation = await apiRequest(`/api/conversations/${conversationId}`, {}, token);
      if (conversation.status === 200 && conversation.body.status === status) {
        return conversation.body;
      }
      await waitFor(100);
    }
    throw new Error(`Timeout waiting for conversation ${conversationId} to reach ${status}`);
  };

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
      if (req.method === 'GET' && req.url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          models: [
            { name: 'qwen3.5:2b' },
            { name: 'llama3.2:1b' },
            { name: 'gemma3:1b' },
          ],
        }));
        return;
      }

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

      if (prompt.includes('Hold qwen open')) {
        await new Promise<void>((resolve) => {
          pendingModels.set(model, resolve);
        });
      }

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
          OLLAMA_MODEL: 'qwen3.5:2b',
          OLLAMA_MODELS: 'qwen3.5:2b,llama3.2:1b,gemma3:1b',
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

  it('lists local chat models with per-model busy state', async () => {
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
    expect(models.body.models).toEqual([
      { name: 'qwen3.5:2b', busy: false, conversationId: null },
      { name: 'llama3.2:1b', busy: false, conversationId: null },
      { name: 'gemma3:1b', busy: false, conversationId: null },
    ]);
  });

  it('blocks a second run on the same model while allowing a different model', async () => {
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

    const qwenChat = await apiRequest(
      '/api/chat',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Hold qwen open',
          model: 'qwen3.5:2b',
        }),
      },
      token,
    );

    expect(qwenChat.status).toBe(202);

    const busyModels = await apiRequest('/api/chat/models', {}, token);
    expect(busyModels.status).toBe(200);
    expect(busyModels.body.models).toEqual([
      { name: 'qwen3.5:2b', busy: true, conversationId: qwenChat.body.conversationId },
      { name: 'llama3.2:1b', busy: false, conversationId: null },
      { name: 'gemma3:1b', busy: false, conversationId: null },
    ]);

    const duplicateQwen = await apiRequest(
      '/api/chat',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Second qwen prompt',
          model: 'qwen3.5:2b',
        }),
      },
      token,
    );
    expect(duplicateQwen.status).toBe(409);
    expect(duplicateQwen.body.activeConversationId).toBe(qwenChat.body.conversationId);

    const llamaChat = await apiRequest(
      '/api/chat',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Talk to llama',
          model: 'llama3.2:1b',
        }),
      },
      token,
    );
    expect(llamaChat.status).toBe(202);

    pendingModels.get('qwen3.5:2b')?.();

    const completedQwen = await waitForConversationStatus(token, qwenChat.body.conversationId, 'completed');
    const completedLlama = await waitForConversationStatus(token, llamaChat.body.conversationId, 'completed');

    expect(completedQwen.model).toBe('qwen3.5:2b');
    expect(completedQwen.messages).toEqual([
      { role: 'user', content: 'Hold qwen open' },
      { role: 'assistant', model: 'qwen3.5:2b', content: 'qwen3.5:2b answered Hold qwen open' },
    ]);
    expect(completedLlama.model).toBe('llama3.2:1b');
    expect(completedLlama.messages).toEqual([
      { role: 'user', content: 'Talk to llama' },
      { role: 'assistant', model: 'llama3.2:1b', content: 'llama3.2:1b answered Talk to llama' },
    ]);

    const unlockedModels = await apiRequest('/api/chat/models', {}, token);
    expect(unlockedModels.body.models).toEqual([
      { name: 'qwen3.5:2b', busy: false, conversationId: null },
      { name: 'llama3.2:1b', busy: false, conversationId: null },
      { name: 'gemma3:1b', busy: false, conversationId: null },
    ]);
  });
});