import express from 'express';
import passport from 'passport';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { configurePassport } from './src/config/passport';
import { User } from './src/models/User';
import { Conversation } from './src/models/Conversation';
import bcrypt from 'bcryptjs';
import { createChatRunRegistry } from './src/lib/chatRunRegistry';
import {
  normalizeAssistantReply,
  resolveRequestedModels,
} from './src/lib/multiLlm';

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
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:8b';
const DEFAULT_CHAT_MODELS = resolveRequestedModels(
  (process.env.OLLAMA_MODELS || OLLAMA_MODEL).split(','),
  [OLLAMA_MODEL],
);
const ASK_ALL_VALUE = '__ask_all__';
const chatRunRegistry = createChatRunRegistry();

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

async function queryOllama(model: string, messages: { role: string; content: string }[]): Promise<string> {
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

async function fetchLocalOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) {
      throw new Error(`Ollama tags error ${res.status}`);
    }

    const data = await res.json() as { models?: Array<{ name?: string }> };
    const installedModels = new Set(
      resolveRequestedModels(
        (data.models || []).map((model) => model.name || ''),
        DEFAULT_CHAT_MODELS,
      ),
    );
    const configuredModels = DEFAULT_CHAT_MODELS.filter((model) => installedModels.has(model));
    return configuredModels.length ? configuredModels : DEFAULT_CHAT_MODELS;
  } catch {
    return DEFAULT_CHAT_MODELS;
  }
}

const createConversationTitle = (model: string, message: string) => {
  const snippet = message.length > 48 ? `${message.slice(0, 48)}…` : message;
  return `${model}: ${snippet}`;
};

const serializePendingTurn = (pendingTurn: any) => {
  if (!pendingTurn) {
    return null;
  }

  return {
    mode: pendingTurn.mode,
    responses: (pendingTurn.responses || []).map((response: any) => ({
      model: response.model,
      status: response.status,
      ...(response.content ? { content: response.content } : {}),
      ...(response.error ? { error: response.error } : {}),
    })),
  };
};

const serializeConversation = (conversation: any) => ({
  id: conversation._id,
  title: conversation.title,
  model: conversation.model ?? null,
  status: conversation.status,
  lastError: conversation.lastError ?? null,
  pendingTurn: serializePendingTurn(conversation.pendingTurn),
  updatedAt: conversation.updatedAt,
  messages: conversation.messages,
});

const reserveModels = (
  userId: string,
  models: string[],
  conversationId: string,
) => {
  const reservedModels: string[] = [];

  for (const model of models) {
    const reservation = chatRunRegistry.reserve({ userId, model, conversationId });
    if (!reservation.granted) {
      reservedModels.forEach((reservedModel) => chatRunRegistry.release(userId, reservedModel));
      return reservation;
    }
    reservedModels.push(model);
  }

  return { granted: true } as const;
};

const runConversationInBackground = async (
  userId: string,
  conversationId: string,
  models: string[],
  messages: { role: string; content: string }[],
) => {
  const responses = await Promise.all(models.map(async (model) => {
    try {
      return {
        model,
        status: 'completed' as const,
        content: normalizeAssistantReply(await queryOllama(model, messages)) || 'No response.',
        error: null,
      };
    } catch (err: any) {
      return {
        model,
        status: 'error' as const,
        content: '',
        error: err.message || 'Chat failed',
      };
    } finally {
      chatRunRegistry.release(userId, model);
    }
  }));

  const completedResponses = responses.filter((response) => response.status === 'completed' && response.content);
  if (models.length === 1) {
    const onlyResponse = completedResponses[0];
    if (onlyResponse) {
      await Conversation.findOneAndUpdate(
        { _id: conversationId, userId },
        {
          $push: { messages: { role: 'assistant', model: onlyResponse.model, content: onlyResponse.content } },
          $set: {
            model: onlyResponse.model,
            status: 'completed',
            lastError: null,
            pendingTurn: null,
          },
        },
      );
      return;
    }

    await Conversation.findOneAndUpdate(
      { _id: conversationId, userId },
      {
        $set: {
          status: 'error',
          lastError: responses[0]?.error || 'Chat failed',
          pendingTurn: null,
        },
      },
    );
    return;
  }

  if (completedResponses.length) {
    await Conversation.findOneAndUpdate(
      { _id: conversationId, userId },
      {
        $set: {
          status: 'awaiting-selection',
          lastError: responses.some((response) => response.error)
            ? responses.map((response) => response.error).filter(Boolean).join('; ')
            : null,
          pendingTurn: {
            mode: 'ask-all',
            responses,
          },
        },
      },
    );
    return;
  }

  await Conversation.findOneAndUpdate(
    { _id: conversationId, userId },
    {
      $set: {
        status: 'error',
        lastError: responses.map((response) => response.error).filter(Boolean).join('; ') || 'Chat failed',
        pendingTurn: null,
      },
    },
  );
};

const resolveChatModels = async (requestedModel: string) => {
  if (requestedModel !== ASK_ALL_VALUE) {
    return [requestedModel];
  }

  return await fetchLocalOllamaModels();
};

app.get('/api/chat/models', authenticateJWT, async (req, res) => {
  const userId = String((req.user as any)._id);
  const models = await fetchLocalOllamaModels();
  res.json({ models: chatRunRegistry.getModelStates(userId, models) });
});

// POST /api/chat — start a single-model chat run that continues server-side
app.post('/api/chat', authenticateJWT, async (req, res) => {
  try {
    const { message, conversationId, model } = req.body;
    const userId = String((req.user as any)._id);

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    if (!model || typeof model !== 'string') {
      return res.status(400).json({ error: 'model is required' });
    }

    const requestedModels = await resolveChatModels(model);
    if (model === ASK_ALL_VALUE && requestedModels.length < 2) {
      return res.status(400).json({ error: 'Ask all requires at least two local models' });
    }

    let conversation: any;
    if (conversationId) {
      conversation = await Conversation.findOne({ _id: conversationId, userId });
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      if (conversation.status === 'running' || conversation.status === 'awaiting-selection') {
        return res.status(409).json({ error: 'This conversation already has a pending response' });
      }
    } else {
      conversation = new Conversation({
        userId,
        model: model === ASK_ALL_VALUE ? null : model,
        title: createConversationTitle(model === ASK_ALL_VALUE ? 'Ask all' : model, message),
        status: 'idle',
        lastError: null,
        pendingTurn: null,
        messages: [],
      });
    }

    const lock = reserveModels(userId, requestedModels, String(conversation._id));
    if (!lock.granted) {
      return res.status(409).json({
        error: 'Model is already busy',
        activeConversationId: lock.activeConversationId,
      });
    }

    const ollamaMessages = [
      ...conversation.messages.map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    conversation.messages.push({ role: 'user', content: message });
    conversation.model = model === ASK_ALL_VALUE ? conversation.model ?? null : model;
    conversation.status = 'running';
    conversation.lastError = null;
    conversation.pendingTurn = null;
    await conversation.save();

    void runConversationInBackground(userId, String(conversation._id), requestedModels, ollamaMessages);

    res.status(202).json(
      model === ASK_ALL_VALUE
        ? {
            conversationId: conversation._id,
            mode: 'ask-all',
            status: 'running',
          }
        : {
            conversationId: conversation._id,
            model,
            status: 'running',
          },
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Chat failed' });
  }
});

app.post('/api/conversations/:id/select-response', authenticateJWT, async (req, res) => {
  try {
    const userId = (req.user as any)._id;
    const { model } = req.body;

    if (!model || typeof model !== 'string') {
      return res.status(400).json({ error: 'model is required' });
    }

    const conversation: any = await Conversation.findOne({ _id: req.params.id, userId });
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    if (conversation.status !== 'awaiting-selection' || !conversation.pendingTurn?.responses?.length) {
      return res.status(409).json({ error: 'This conversation has no pending responses to select from' });
    }

    const selectedResponse = conversation.pendingTurn.responses.find((response: any) => response.model === model);
    if (!selectedResponse || selectedResponse.status !== 'completed' || !selectedResponse.content) {
      return res.status(400).json({ error: 'Selected model response is not available' });
    }

    conversation.messages.push({ role: 'assistant', model, content: selectedResponse.content });
    conversation.model = model;
    conversation.status = 'completed';
    conversation.lastError = null;
    conversation.pendingTurn = null;
    await conversation.save();

    res.json(serializeConversation(conversation.toObject()));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save selected response' });
  }
});

// GET /api/conversations  — list all conversations for the current user
app.get('/api/conversations', authenticateJWT, async (req, res) => {
  try {
    const userId = (req.user as any)._id;
    const conversations = await Conversation.find({ userId })
      .select('title model status lastError createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .lean();

    const result = conversations.map(c => ({
      id: c._id,
      title: c.title,
      model: c.model,
      status: c.status,
      lastError: c.lastError,
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
    res.json(serializeConversation(conversation));
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
