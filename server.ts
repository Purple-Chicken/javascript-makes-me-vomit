import express from 'express';
import passport from 'passport';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { configurePassport } from './src/config/passport';
import { User } from './src/models/User';
import { Conversation } from './src/models/Conversation';
import bcrypt from 'bcryptjs';

dotenv.config();

const red = '\x1b[91m';
const green = '\x1b[92m';
const endc = '\x1b[0m';

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'LOL'; 
const PORT = Number(process.env.PORT || '5000');
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb://admin:admin@127.0.0.1:27017/mydb?authSource=admin';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:0.5b';

type SelectedModel = { provider: string; model: string };

const DEFAULT_AVAILABLE_MODELS: SelectedModel[] = [
  { provider: 'Ollama', model: 'qwen2.5:0.5b' },
  { provider: 'Ollama', model: 'qwen2.5:1.5b' },
  { provider: 'Ollama', model: 'tinyllama:1.1b' },
  { provider: 'Ollama', model: 'qwen2.5:3b' },
  { provider: 'Ollama', model: 'mistral:7b' },
  { provider: 'Ollama', model: 'llama3.1:8b' },
];

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sha257')
  .then(() => console.log(green + 'MongoDB Connected' + endc))
  .catch(err => console.error(red + 'MongoDB Connection Error:' + endc, err));

// Middleware
app.use(express.json());
configurePassport();
app.use(passport.initialize()); 

app.post('/api/users', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: "User created" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Signup failed" });
  }
});

app.post('/api/sessions', (req, res, next) => {
  passport.authenticate('local', { session: false }, (err: Error | null, user: InstanceType<typeof User> | false, info: { message: string }) => {
    if (err || !user) {
      return res.status(400).json({ error: info?.message || 'Login failed' });
    }

    // Sign the token with the user ID
    const token = jwt.sign({ id: user._id.toString() }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ message: "Logged in", token, user: { username: user.username } });
  })(req, res, next);
});

// Helper for protected routes
const authenticateJWT = passport.authenticate('jwt', { session: false });

app.get('/api/users/me', authenticateJWT, (req, res) => {
  res.json(req.user);
});

app.get('/api/models', authenticateJWT, (_req, res) => {
  const models = DEFAULT_AVAILABLE_MODELS.map((m) => ({
    id: `${m.provider.toLowerCase()}/${m.model}`,
    provider: m.provider,
    model: m.model,
  }));
  res.json(models);
});

app.patch('/api/users/me', authenticateJWT, async (req, res) => {
  try {
    const user = req.user as any;
    const { oldPassword, newPassword, username, profilePic, preferences } = req.body;

    const updates: Record<string, any> = {};

    // Password change (requires old password verification)
    if (oldPassword && newPassword) {
      const isMatch = await bcrypt.compare(oldPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'Incorrect old password' });
      }
      updates.password = await bcrypt.hash(newPassword, 10);
    }

    // Username change
    if (username && typeof username === 'string' && username !== user.username) {
      const existing = await User.findOne({ username });
      if (existing) {
        return res.status(400).json({ error: 'Username already taken' });
      }
      updates.username = username;
    }

    // Profile picture (0, 1, or 2)
    if (profilePic !== undefined && [0, 1, 2].includes(profilePic)) {
      updates.profilePic = profilePic;
    }

    // Appearance preferences
    if (preferences && typeof preferences === 'object') {
      const validFonts = ['neo-tech', 'sans', 'serif'];
      const validColors = ['green', 'blue', 'purple', 'amber'];
      if (typeof preferences.matrixRain === 'boolean') updates['preferences.matrixRain'] = preferences.matrixRain;
      if (typeof preferences.lightMode === 'boolean') updates['preferences.lightMode'] = preferences.lightMode;
      if (validFonts.includes(preferences.font)) updates['preferences.font'] = preferences.font;
      if (validColors.includes(preferences.themeColor)) updates['preferences.themeColor'] = preferences.themeColor;
      if (Array.isArray(preferences.defaultModelSet)) {
        updates['preferences.defaultModelSet'] = preferences.defaultModelSet
          .filter((m: any) => m && typeof m.model === 'string' && m.model.trim())
          .map((m: any) => ({ provider: String(m.provider || 'Ollama'), model: String(m.model) }));
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await User.findByIdAndUpdate(user._id, { $set: updates });
    res.json({ message: 'Account updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

app.delete('/api/users/me', authenticateJWT, async (req, res) => {
  try {
    const userId = (req.user as any)._id;
    // Delete all conversations belonging to the user as well
    await Conversation.deleteMany({ userId });
    await User.findByIdAndDelete(userId);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Deletion failed' });
  }
});

// ── Chat / Conversation endpoints ──

async function queryOllama(messages: { role: string; content: string }[], model: string = OLLAMA_MODEL): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  const data = await res.json() as { message?: { content?: string } };
  return data.message?.content?.trim() || '';
}

function parseSelectedModels(input: unknown): SelectedModel[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      if (typeof entry === 'string') {
        return { provider: 'Ollama', model: entry };
      }
      if (entry && typeof entry === 'object' && typeof (entry as any).model === 'string') {
        return {
          provider: String((entry as any).provider || 'Ollama'),
          model: String((entry as any).model),
        };
      }
      return null;
    })
    .filter((m): m is SelectedModel => !!m && !!m.model.trim());
}

function resolveSelectedModels(user: any, conversation: any, requestModels: unknown): SelectedModel[] {
  const requested = parseSelectedModels(requestModels);
  if (requested.length) return requested;
  if (Array.isArray(conversation?.selectedModels) && conversation.selectedModels.length) {
    return conversation.selectedModels.map((m: any) => ({
      provider: String(m.provider || 'Ollama'),
      model: String(m.model),
    }));
  }
  if (Array.isArray(user?.preferences?.defaultModelSet) && user.preferences.defaultModelSet.length) {
    return user.preferences.defaultModelSet.map((m: any) => ({
      provider: String(m.provider || 'Ollama'),
      model: String(m.model),
    }));
  }
  return [{ provider: 'Ollama', model: OLLAMA_MODEL }];
}

// POST /api/chat  — send a message, get a random reply, persist both
app.post('/api/chat', authenticateJWT, async (req, res) => {
  try {
    const { message, conversationId, selectedModels } = req.body;
    const userId = (req.user as any)._id;
    const user = req.user as any;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    let conversation;
    if (conversationId) {
      conversation = await Conversation.findOne({ _id: conversationId, userId });
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    } else {
      // Create a new conversation; use the first message (truncated) as the title
      const title = message.length > 60 ? message.slice(0, 60) + '…' : message;
      conversation = new Conversation({ userId, title, messages: [] });
    }

    const activeModels = resolveSelectedModels(user, conversation, selectedModels);
    (conversation as any).selectedModels = activeModels;

    // Build the message history for Ollama (full conversation context)
    const ollamaMessages = [
      ...conversation.messages.map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    const responses = await Promise.all(activeModels.map(async (m) => {
      try {
        const content = (await queryOllama(ollamaMessages, m.model)).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        return { provider: m.provider, model: m.model, content };
      } catch (err: any) {
        return { provider: m.provider, model: m.model, error: err.message || 'Provider unavailable' };
      }
    }));

    const successes = responses.filter((r: any) => !r.error && r.content);
    const errors = responses.filter((r: any) => r.error).map((r: any) => ({
      provider: r.provider,
      model: r.model,
      message: r.error,
      nonBlocking: true,
    }));

    conversation.messages.push({ role: 'user', content: message });
    for (const reply of successes as any[]) {
      conversation.messages.push({
        role: 'assistant',
        content: reply.content,
        modelMetadata: { provider: reply.provider, model: reply.model },
      });
    }
    await conversation.save();

    if (!successes.length) {
      return res.status(502).json({
        error: 'All selected models failed',
        errors,
        conversationId: conversation._id,
      });
    }

    res.json({
      reply: (successes[0] as any).content,
      responses: successes,
      errors,
      selectedModels: activeModels,
      conversationId: conversation._id,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Chat failed' });
  }
});

// POST /api/chat/stream — streamed version, sends NDJSON tokens + thinking
app.post('/api/chat/stream', authenticateJWT, async (req, res) => {
  let conversation: any;
  try {
    const { message, conversationId, selectedModels } = req.body;
    const userId = (req.user as any)._id;
    const user = req.user as any;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    if (conversationId) {
      conversation = await Conversation.findOne({ _id: conversationId, userId });
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    } else {
      const title = message.length > 60 ? message.slice(0, 60) + '…' : message;
      conversation = new Conversation({ userId, title, messages: [] });
      await conversation.save(); // Persist immediately so the sidebar can show it before streaming ends
    }

    const ollamaMessages = [
      ...conversation.messages.map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    const activeModels = resolveSelectedModels(user, conversation, selectedModels);
    (conversation as any).selectedModels = activeModels;

    if (activeModels.length > 1) {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Conversation-Id', String(conversation._id));
      res.flushHeaders();
      res.write(JSON.stringify({ init: true, conversationId: String(conversation._id) }) + '\n');

      const multiResults = await Promise.all(activeModels.map(async (m) => {
        try {
          const content = (await queryOllama(ollamaMessages, m.model)).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
          return { provider: m.provider, model: m.model, content };
        } catch (err: any) {
          return { provider: m.provider, model: m.model, error: err.message || 'Provider unavailable' };
        }
      }));

      conversation.messages.push({ role: 'user', content: message });
      for (const r of multiResults as any[]) {
        if (r.error) {
          res.write(JSON.stringify({ model: r.model, provider: r.provider, error: r.error }) + '\n');
          continue;
        }
        conversation.messages.push({
          role: 'assistant',
          content: r.content,
          modelMetadata: { provider: r.provider, model: r.model },
        });
        // Send one model-scoped update chunk; frontend can render per-model cards.
        res.write(JSON.stringify({ model: r.model, provider: r.provider, token: r.content, doneModel: true }) + '\n');
      }

      await conversation.save();
      res.write(JSON.stringify({ done: true, conversationId: conversation._id }) + '\n');
      res.end();
      return;
    }

    // Track client disconnect to abort Ollama and skip saving
    let clientDisconnected = false;
    const abortController = new AbortController();
    req.on('close', () => {
      clientDisconnected = true;
      abortController.abort();
    });

    // Stream from Ollama
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Conversation-Id', String(conversation._id));
    res.flushHeaders();
    // Send init chunk immediately so the client knows the conversation ID before LLM responds
    res.write(JSON.stringify({ init: true, conversationId: String(conversation._id) }) + '\n');

    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: activeModels[0]?.model || OLLAMA_MODEL,
        messages: ollamaMessages,
        stream: true,
      }),
      signal: abortController.signal,
    });

    if (!ollamaRes.ok || !ollamaRes.body) {
      // Remove the empty conversation that was pre-saved for the sidebar
      if (conversation.messages.length === 0) {
        await Conversation.findByIdAndDelete(conversation._id);
      }
      res.write(JSON.stringify({ error: 'Ollama error' }) + '\n');
      res.end();
      return;
    }

    let fullContent = '';
    const reader = ollamaRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (clientDisconnected) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            const token = chunk.message?.content || '';
            if (token) {
              fullContent += token;
              if (!clientDisconnected) res.write(JSON.stringify({ token }) + '\n');
            }
            if (chunk.done) {
              break;
            }
          } catch {}
        }
      }
    } catch {
      // AbortError from reader when client disconnects — expected
    }

    // Process any remaining buffer (only if client still connected)
    if (!clientDisconnected && buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer);
        const token = chunk.message?.content || '';
        if (token) {
          fullContent += token;
          res.write(JSON.stringify({ token }) + '\n');
        }
      } catch {}
    }

    // Only save if client is still connected (stop endpoint handles saves for aborted requests)
    if (!clientDisconnected) {
      const reply = fullContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

      conversation.messages.push({ role: 'user', content: message });
      conversation.messages.push({
        role: 'assistant',
        content: reply,
        modelMetadata: {
          provider: activeModels[0]?.provider || 'Ollama',
          model: activeModels[0]?.model || OLLAMA_MODEL,
        },
      });
      await conversation.save();

      res.write(JSON.stringify({ done: true, conversationId: conversation._id }) + '\n');
      res.end();
    }
  } catch (err: any) {
    // Remove the empty conversation that was pre-saved for the sidebar
    try { if (conversation && conversation.messages.length === 0) await Conversation.findByIdAndDelete(conversation._id); } catch {}
    try { res.write(JSON.stringify({ error: err.message || 'Chat failed' }) + '\n'); } catch {}
    try { res.end(); } catch {}
  }
});

// POST /api/chat/stop — save user message + "Response stopped" when user cancels mid-stream
app.post('/api/chat/stop', authenticateJWT, async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    const userId = (req.user as any)._id;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    let conversation;
    if (conversationId) {
      conversation = await Conversation.findOne({ _id: conversationId, userId });
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    } else {
      const title = message.length > 60 ? message.slice(0, 60) + '…' : message;
      conversation = new Conversation({ userId, title, messages: [] });
    }

    conversation.messages.push({ role: 'user', content: message });
    conversation.messages.push({ role: 'assistant', content: 'Response stopped' });
    await conversation.save();

    res.json({ conversationId: conversation._id });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Stop failed' });
  }
});

// GET /api/conversations  — list all conversations for the current user
app.get('/api/conversations', authenticateJWT, async (req, res) => {
  try {
    const userId = (req.user as any)._id;
    const conversations = await Conversation.find({ userId })
      .select('title createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .lean();

    const result = conversations.map(c => ({
      id: c._id,
      title: c.title,
      updatedAt: c.updatedAt,
    }));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list conversations' });
  }
});

// GET /api/conversations/:id  — get a single conversation with messages
app.get('/api/conversations/:id', authenticateJWT, async (req, res) => {
  try {
    const userId = (req.user as any)._id;
    const conversation = await Conversation.findOne({ _id: req.params.id, userId }).lean();
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json({
      id: conversation._id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
      selectedModels: conversation.selectedModels || [],
      messages: conversation.messages,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get conversation' });
  }
});

// DELETE /api/conversations/:id  — delete a single conversation
app.delete('/api/conversations/:id', authenticateJWT, async (req, res) => {
  try {
    const userId = (req.user as any)._id;
    const result = await Conversation.findOneAndDelete({ _id: req.params.id, userId });
    if (!result) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json({ message: 'Conversation deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete conversation' });
  }
});

const startServer = async () => {
  await mongoose.connect(MONGODB_URI);
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
};

startServer().catch((err) => {
  console.error('Failed to start API server:', err);
  process.exit(1);
});
