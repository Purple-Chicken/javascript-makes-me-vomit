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
            { name: 'llama3.2:1b' },
            { name: 'qwen3.5:2b' },
            { name: 'gemma3:1b' },
            { name: 'deepseek-r1:1.5b' },
            { name: 'mistral:7b' },
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
          OLLAMA_MODELS: 'qwen3.5:2b,deepseek-r1:1.5b,llama3.2:1b,gemma3:1b',
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

  it('lists the configured chat models in env order with per-model busy state', async () => {
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
      { name: 'deepseek-r1:1.5b', busy: false, conversationId: null },
      { name: 'llama3.2:1b', busy: false, conversationId: null },
      { name: 'gemma3:1b', busy: false, conversationId: null },
    ]);
  });

  it('asks all models for one prompt and persists the selected response', async () => {
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

    const askAllChat = await apiRequest(
      '/api/chat',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Compare these models',
          model: '__ask_all__',
        }),
      },
      token,
    );

    expect(askAllChat.status).toBe(202);
    expect(askAllChat.body).toEqual(jasmine.objectContaining({
      conversationId: jasmine.any(String),
      status: 'running',
      mode: 'ask-all',
    }));

    const awaitingSelection = await waitForConversationStatus(token, askAllChat.body.conversationId, 'awaiting-selection');
    expect(awaitingSelection.messages).toEqual([
      { role: 'user', content: 'Compare these models' },
    ]);
    expect(awaitingSelection.pendingTurn).toEqual({
      mode: 'ask-all',
      responses: [
        { model: 'qwen3.5:2b', status: 'completed', content: 'qwen3.5:2b answered Compare these models' },
        { model: 'deepseek-r1:1.5b', status: 'completed', content: 'deepseek-r1:1.5b answered Compare these models' },
        { model: 'llama3.2:1b', status: 'completed', content: 'llama3.2:1b answered Compare these models' },
        { model: 'gemma3:1b', status: 'completed', content: 'gemma3:1b answered Compare these models' },
      ],
    });

    const selectedResponse = await apiRequest(
      `/api/conversations/${askAllChat.body.conversationId}/select-response`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama3.2:1b' }),
      },
      token,
    );

    expect(selectedResponse.status).toBe(200);
    expect(selectedResponse.body.status).toBe('completed');
    expect(selectedResponse.body.model).toBe('llama3.2:1b');
    expect(selectedResponse.body.pendingTurn).toBeNull();
    expect(selectedResponse.body.messages).toEqual([
      { role: 'user', content: 'Compare these models' },
      { role: 'assistant', model: 'llama3.2:1b', content: 'llama3.2:1b answered Compare these models' },
    ]);

    const savedConversation = await apiRequest(`/api/conversations/${askAllChat.body.conversationId}`, {}, token);
    expect(savedConversation.status).toBe(200);
    expect(savedConversation.body.model).toBe('llama3.2:1b');
    expect(savedConversation.body.messages).toEqual([
      { role: 'user', content: 'Compare these models' },
      { role: 'assistant', model: 'llama3.2:1b', content: 'llama3.2:1b answered Compare these models' },
    ]);
  });
});