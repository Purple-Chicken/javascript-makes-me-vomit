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
    const models = resolveRequestedModels(
      (data.models || []).map((model) => model.name || ''),
      DEFAULT_CHAT_MODELS,
    );
    return models.length ? models : DEFAULT_CHAT_MODELS;
  } catch {
    return DEFAULT_CHAT_MODELS;
  }
}

const createConversationTitle = (model: string, message: string) => {
  const snippet = message.length > 48 ? `${message.slice(0, 48)}…` : message;
  return `${model}: ${snippet}`;
};

const runConversationInBackground = async (
  userId: string,
  conversationId: string,
  model: string,
  messages: { role: string; content: string }[],
) => {
  try {
    const reply = normalizeAssistantReply(await queryOllama(model, messages)) || 'No response.';
    await Conversation.findOneAndUpdate(
      { _id: conversationId, userId },
      {
        $push: { messages: { role: 'assistant', model, content: reply } },
        $set: { status: 'completed', lastError: null },
      },
    );
  } catch (err: any) {
    await Conversation.findOneAndUpdate(
      { _id: conversationId, userId },
      {
        $set: { status: 'error', lastError: err.message || 'Chat failed' },
      },
    );
  } finally {
    chatRunRegistry.release(userId, model);
  }
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

    let conversation: any;
    if (conversationId) {
      conversation = await Conversation.findOne({ _id: conversationId, userId });
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      if (conversation.model && conversation.model !== model) {
        return res.status(400).json({ error: 'Conversation already belongs to a different model' });
      }
      if (conversation.status === 'running') {
        return res.status(409).json({ error: 'Model is already busy', activeConversationId: String(conversation._id) });
      }
    } else {
      conversation = new Conversation({
        userId,
        model,
        title: createConversationTitle(model, message),
        status: 'idle',
        lastError: null,
        messages: [],
      });
    }

    const lock = chatRunRegistry.reserve({
      userId,
      model,
      conversationId: String(conversation._id),
    });
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
    conversation.model = conversation.model || model;
    conversation.status = 'running';
    conversation.lastError = null;
    await conversation.save();

    void runConversationInBackground(userId, String(conversation._id), model, ollamaMessages);

    res.status(202).json({
      conversationId: conversation._id,
      model,
      status: 'running',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Chat failed' });
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
    res.json({
      id: conversation._id,
      title: conversation.title,
      model: conversation.model,
      status: conversation.status,
      lastError: conversation.lastError,
      updatedAt: conversation.updatedAt,
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
