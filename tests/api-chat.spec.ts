import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  createApiRequest,
  getAvailablePort,
  resolveWritableMongoUri,
  waitForPort,
} from './helpers/api-test-utils.ts';

describe('Chat API', () => {
  const stopProcess = async (child: ChildProcess | null) => {
    if (!child || child.killed) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 1000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      child.kill('SIGTERM');
    });
  };

  let apiProcess: ChildProcess | null = null;
  let apiRequest: ReturnType<typeof createApiRequest>;
  let userToken: string;

  // Setup server and a test user for authenticated requests
  beforeAll(async () => {
    if (typeof jasmine !== 'undefined') jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

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

    // Create a global user for these tests
    const username = `chat_tester_${Date.now()}`;
    const password = 'password123';
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
    userToken = login.body.token;
  });

  afterAll(async () => {
    await stopProcess(apiProcess);
  });

  it('retrieves available models with GET /api/models', async () => {
    const res = await apiRequest('/api/models', { method: 'GET' }, userToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0].id).toBeDefined();
    }
  });

  it('manages the lifecycle of a chat session', async () => {
    // 1. Create a new chat
    let createRes = await apiRequest('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        modelId: 'gpt-4', 
        isTemporary: false,
        systemPrompt: 'You are a helpful assistant.' 
      }),
    }, userToken);
    
    // 1. Create a new chat with an expiration (e.g., 1 hour from now)
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + 1);

    createRes = await apiRequest('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        modelId: 'gpt-4', 
        isTemporary: false,
        systemPrompt: 'You are a helpful assistant.',
        expiresAt: expiryDate.toISOString()
      }),
    }, userToken);
    
    expect(createRes.status).toBe(201);
    expect(createRes.body.expiresAt).toBe(expiryDate.toISOString());

    const chatId = createRes.body.id;
    expect(chatId).toBeDefined();

    // 2. Send a message (Root message)
    const msgRes = await apiRequest(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        content: 'Hello, world!',
        parentId: null 
      }),
    }, userToken);
    expect(msgRes.status).toBe(201);
    const rootMsgId = msgRes.body.id;

    // 3. Verify chat appears in list
    const listRes = await apiRequest('/api/chats', { method: 'GET' }, userToken);
    expect(listRes.body.some((c: any) => c.id === chatId)).toBe(true);

    // 4. Retrieve specific chat metadata
    const getRes = await apiRequest(`/api/chats/${chatId}`, { method: 'GET' }, userToken);
    expect(getRes.status).toBe(200);
    expect(getRes.body.modelId).toBe('gpt-4');

    // 5. Delete the chat
    const delRes = await apiRequest(`/api/chats/${chatId}`, { method: 'DELETE' }, userToken);
    expect(delRes.status).toBe(200);

    // 6. Verify it is gone
    const verifyGone = await apiRequest(`/api/chats/${chatId}`, { method: 'GET' }, userToken);
    expect(verifyGone.status).toBe(404);
  });

  it('supports branching by using parentId', async () => {
    // Create chat
    const chat = await apiRequest('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: 'gpt-4', isTemporary: false }),
    }, userToken);
    const chatId = chat.body.id;

    // Send original message
    const original = await apiRequest(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Message 1', parentId: null }),
    }, userToken);
    const originalId = original.body.id;

    // Branch from original message
    const branch = await apiRequest(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'A different Message 2', parentId: originalId }),
    }, userToken);

    expect(branch.status).toBe(201);
    expect(branch.body.parentId).toBe(originalId);
  });

  it('rejects chat access without token', async () => {
    const res = await apiRequest('/api/chats', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('handles temporary chats as memory-only (no database record)', async () => {
    // In the new privacy model, the server handles the stream but does not persist a chat object
    const tempChat = await apiRequest('/api/chats', {      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: 'gpt-4', isTemporary: true }),
    }, userToken);
    
    // If the chat is memory-only, the POST might return the stream/success but 
    // a subsequent GET for that ID should fail as it was never saved to DB.
    const chatId = tempChat.body.id;
    const getRes = await apiRequest(`/api/chats/${chatId}`, { method: 'GET' }, userToken);
    expect(getRes.status).toBe(404);
  });

  it('gets user settings', async () => {
    const res = await apiRequest('/api/settings', { method: 'GET' }, userToken);
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(res.body.multiLLM).toBeDefined();
  });

  it('updates user settings', async () => {
    const update = { multiLLM: true, llmModels: ['qwen3:8b', 'llama3:8b', 'mistral:7b'] };
    const res = await apiRequest('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    }, userToken);
    expect(res.status).toBe(200);

    // Verify
    const getRes = await apiRequest('/api/settings', { method: 'GET' }, userToken);
    expect(getRes.body.multiLLM).toBe(true);
    expect(getRes.body.llmModels).toEqual(['qwen3:8b', 'llama3:8b', 'mistral:7b']);
  });

  it('sends message with multi-LLM enabled', async () => {
    // Enable multi-LLM
    await apiRequest('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ multiLLM: true, llmModels: ['qwen3:8b', 'llama3:8b', 'mistral:7b'] })
    }, userToken);

    const res = await apiRequest('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello' })
    }, userToken);
    expect(res.status).toBe(200);
    expect(res.body.reply).toContain('[LLM1]');
    expect(res.body.reply).toContain('[LLM2]');
    expect(res.body.reply).toContain('[LLM3]');
  });
});
