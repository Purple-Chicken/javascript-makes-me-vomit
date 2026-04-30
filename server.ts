import express from 'express';
import passport from 'passport';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import pdfParse from 'pdf-parse';
import { configurePassport } from './src/config/passport';
import { User } from './src/models/User';
import { Conversation } from './src/models/Conversation';
import bcrypt from 'bcryptjs';
import { lookupWeatherReplyFromMessages } from './src/lib/weather';

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
const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
const OLLAMA_URL = process.env.OLLAMA_URL || DEFAULT_OLLAMA_URL;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:8b';
const OLLAMA_REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_REQUEST_TIMEOUT_MS || '60000');

const getOllamaUrlCandidates = (baseUrl: string) => {
  const urls = [baseUrl];
  try {
    const parsed = new URL(baseUrl);
    const isLocalhost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
    if (isLocalhost) {
      const port = parsed.port || '11434';
      const dockerUrl = `${parsed.protocol}//ollama:${port}`;
      if (!urls.includes(dockerUrl)) {
        urls.push(dockerUrl);
      }
    }
  } catch {
    // Keep the user-provided URL only if it is not a valid URL string.
  }
  return urls;
};

type Provider = 'ollama' | 'openai' | 'google' | 'anthropic';

type ModelCatalogItem = {
  id: string;
  label: string;
  provider: Provider;
  category: 'local' | 'cloud';
  envVar?: string;
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const MODEL_CATALOG: ModelCatalogItem[] = [
  { id: 'qwen3:0.6b', label: 'qwen3:0.6b', provider: 'ollama', category: 'local' },
  { id: 'qwen3:8b', label: 'qwen3:8b', provider: 'ollama', category: 'local' },
  { id: 'qwen2.5:0.5b', label: 'qwen2.5:0.5b', provider: 'ollama', category: 'local' },
  { id: 'qwen2.5:1.5b', label: 'qwen2.5:1.5b', provider: 'ollama', category: 'local' },
  { id: 'qwen2.5:3b', label: 'qwen2.5:3b', provider: 'ollama', category: 'local' },
  { id: 'tinyllama:1.1b', label: 'tinyllama:1.1b', provider: 'ollama', category: 'local' },
  { id: 'gpt-4o', label: 'gpt-4o', provider: 'openai', category: 'cloud', envVar: 'OPENAI_API_KEY' },
  { id: 'gpt-4o-mini', label: 'gpt-4o-mini', provider: 'openai', category: 'cloud', envVar: 'OPENAI_API_KEY' },
  { id: 'gpt-4', label: 'gpt-4', provider: 'openai', category: 'cloud' },
  { id: 'gemini-1.5-flash', label: 'gemini-1.5-flash', provider: 'google', category: 'cloud', envVar: 'GOOGLE_API_KEY' },
  { id: 'gemini-1.5-pro', label: 'gemini-1.5-pro', provider: 'google', category: 'cloud', envVar: 'GOOGLE_API_KEY' },
  { id: 'claude-3-haiku', label: 'claude-3-haiku', provider: 'anthropic', category: 'cloud', envVar: 'ANTHROPIC_API_KEY' },
  { id: 'claude-3-5-sonnet', label: 'claude-3-5-sonnet', provider: 'anthropic', category: 'cloud', envVar: 'ANTHROPIC_API_KEY' },
];

const DEFAULT_MODEL_ID = MODEL_CATALOG.find((m) => m.id === 'qwen3:0.6b')?.id || OLLAMA_MODEL;

const getModelById = (id?: string): ModelCatalogItem | undefined =>
  MODEL_CATALOG.find((m) => m.id === id);

const isCloudModelAvailable = (model: ModelCatalogItem): boolean =>
  !model.envVar || Boolean(process.env[model.envVar]);

const modelsResponse = () =>
  MODEL_CATALOG.map((model) => ({
    id: model.id,
    label: model.label,
    provider: model.provider,
    category: model.category,
    requiresApiKey: model.category === 'cloud',
    envVar: model.envVar,
    available: model.category === 'local' ? true : isCloudModelAvailable(model),
  }));

const stripThinkTags = (text: string) => text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

const solveBasicMath = (prompt: string): string | null => {
  const normalized = prompt.toLowerCase().replace(/\?/g, '');
  const match = normalized.match(/(-?\d+(?:\.\d+)?)\s*(plus|\+|minus|-|times|x|\*|multiplied by|divided by|\/)\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;

  const left = Number(match[1]);
  const op = match[2];
  const right = Number(match[3]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;

  if (op === 'plus' || op === '+') return String(left + right);
  if (op === 'minus' || op === '-') return String(left - right);
  if (op === 'times' || op === 'x' || op === '*' || op === 'multiplied by') return String(left * right);
  if (op === 'divided by' || op === '/') return right === 0 ? 'undefined (division by zero)' : String(left / right);
  return null;
};

const extractPrimaryPrompt = (prompt: string) =>
  prompt.split('\n\n[Attached file:')[0]?.trim() || prompt;

const synthesizeReply = (prompt: string, modelId: string): string => {
  const primaryPrompt = extractPrimaryPrompt(prompt);
  const math = solveBasicMath(primaryPrompt);
  if (math !== null) {
    return `The answer is ${math}.`;
  }

  if (/weather|temperature|rain|forecast|seattle/i.test(primaryPrompt)) {
    return 'I cannot access live weather data here, but Seattle is typically cool and often cloudy with possible light rain.';
  }

  const normalizedPrompt = primaryPrompt.replace(/\s+/g, ' ').trim();
  if (!normalizedPrompt) {
    return `[${modelId}] I’m ready for your next message.`;
  }

  return `[${modelId}] I could not reach the model backend, so here is a fallback response. You asked: "${normalizedPrompt.slice(0, 180)}${normalizedPrompt.length > 180 ? '...' : ''}"`;
};

const DEFAULT_TOKEN_QUOTA = Number(process.env.TOKEN_QUOTA || '100000');

type ModelTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  tokenCost: number;
  exact: true;
  source: 'ollama';
};

type GenerateResult = {
  reply: string;
  tokenUsage?: ModelTokenUsage;
};

const normalizeTokenCount = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0;
};

const sanitizeText = (value: string, maxLen = 1600) =>
  value.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '').slice(0, maxLen).trim();

const extractPdfTextFallback = (buffer: Buffer) => {
  const raw = buffer.toString('latin1');
  const matches = Array.from(raw.matchAll(/\(([^()]*)\)\s*Tj/g)).map((m) => m[1]);
  if (matches.length) {
    return sanitizeText(matches.join(' '));
  }

  // Secondary fallback: collect long printable runs from the binary payload.
  const printableRuns = raw.match(/[\x20-\x7E]{8,}/g) || [];
  return sanitizeText(printableRuns.slice(0, 12).join(' '));
};

const readFileSummary = async (filename: string, mimeType: string, contentBase64: string) => {
  const buffer = Buffer.from(contentBase64, 'base64');
  const lowerName = filename.toLowerCase();
  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf' || /\.pdf$/i.test(lowerName);
  const textLike = mimeType.startsWith('text/') || /\.(txt|md|json|js|ts|csv|yaml|yml|xml|html|css)$/i.test(lowerName);

  if (isImage) {
    return {
      summary: `Image file ${filename} (${mimeType || 'unknown type'}, ${buffer.length} bytes). The image is attached for model interpretation.`,
      type: 'image',
      sizeBytes: buffer.length,
    };
  }

  if (textLike) {
    const text = sanitizeText(buffer.toString('utf8'));
    const excerpt = text ? `Content excerpt: ${text}` : 'Content excerpt is empty.';
    return {
      summary: `Text file ${filename} (${buffer.length} bytes). ${excerpt}`,
      type: 'text',
      sizeBytes: buffer.length,
    };
  }

  if (isPdf) {
    try {
      const parsed = await pdfParse(buffer);
      const extracted = sanitizeText(parsed.text || '');
      const excerpt = extracted ? `Extracted text excerpt: ${extracted}` : 'Extracted text appears empty.';
      return {
        summary: `PDF file ${filename} (${buffer.length} bytes). ${excerpt}`,
        type: 'pdf',
        sizeBytes: buffer.length,
      };
    } catch {
      const fallbackText = extractPdfTextFallback(buffer);
      const fallbackExcerpt = fallbackText ? `Extracted text excerpt: ${fallbackText}` : 'Unable to extract text; binary summary only.';
      return {
        summary: `PDF file ${filename} (${buffer.length} bytes). ${fallbackExcerpt}`,
        type: 'pdf',
        sizeBytes: buffer.length,
      };
    }
  }

  const hexPreview = buffer.subarray(0, 24).toString('hex');
  return {
    summary: `Binary file ${filename} (${mimeType || 'application/octet-stream'}, ${buffer.length} bytes). Hex preview: ${hexPreview}`,
    type: 'binary',
    sizeBytes: buffer.length,
  };
};

const applyUsageUpdate = async (userId: string, tokenCost: number) => {
  const user = await User.findById(userId);
  if (!user) {
    return { tokenCost, tokenQuota: DEFAULT_TOKEN_QUOTA, tokensUsed: 0, tokensRemaining: DEFAULT_TOKEN_QUOTA };
  }

  const quota = Number(user.usage?.tokenQuota ?? DEFAULT_TOKEN_QUOTA);
  const usedBefore = Number(user.usage?.tokensUsed ?? 0);
  const used = usedBefore + Math.max(0, tokenCost);
  user.usage = { tokenQuota: quota, tokensUsed: used } as any;
  await user.save();

  const remaining = Math.max(0, quota - used);
  return { tokenCost, tokenQuota: quota, tokensUsed: used, tokensRemaining: remaining };
};

const applyExactTokenUsage = async (userId: string, usage?: ModelTokenUsage) => {
  if (!usage) return undefined;
  const accountUsage = await applyUsageUpdate(userId, usage.tokenCost);
  return {
    ...accountUsage,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    exact: true as const,
    source: usage.source,
  };
};

// Middleware
app.use(express.json({ limit: '10mb' }));
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

app.get('/api/models', authenticateJWT, (_req, res) => {
  res.json(modelsResponse());
});

app.post('/api/files/scan', authenticateJWT, async (req, res) => {
  try {
    const { filename, mimeType, contentBase64 } = req.body as {
      filename?: string;
      mimeType?: string;
      contentBase64?: string;
    };

    if (!filename || !contentBase64 || typeof filename !== 'string' || typeof contentBase64 !== 'string') {
      return res.status(400).json({ error: 'filename and contentBase64 are required' });
    }

    const parsed = await readFileSummary(filename, String(mimeType || 'application/octet-stream'), contentBase64);
    res.json({ filename, mimeType: mimeType || 'application/octet-stream', ...parsed });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to scan file' });
  }
});

app.get('/api/tokens/me', authenticateJWT, async (req, res) => {
  try {
    const userId = (req.user as any)._id;
    const user = await User.findById(userId).lean();
    const tokenQuota = Number(user?.usage?.tokenQuota ?? DEFAULT_TOKEN_QUOTA);
    const tokensUsed = Number(user?.usage?.tokensUsed ?? 0);
    res.json({
      tokenQuota,
      tokensUsed,
      tokensRemaining: Math.max(0, tokenQuota - tokensUsed),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load token balance' });
  }
});

app.get('/api/settings/me', authenticateJWT, async (req, res) => {
  try {
    const userId = (req.user as any)._id;
    const user = await User.findById(userId).lean();
    const prefs = user?.preferences || {};
    res.json({
      defaultModel: prefs.defaultModel || DEFAULT_MODEL_ID,
      modelCategory: prefs.modelCategory || 'local',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load settings' });
  }
});

app.put('/api/settings/me', authenticateJWT, async (req, res) => {
  try {
    const userId = (req.user as any)._id;
    const { defaultModel, modelCategory } = req.body as { defaultModel?: string; modelCategory?: string };

    if (defaultModel && !getModelById(defaultModel)) {
      return res.status(400).json({ error: 'Unknown model' });
    }
    if (modelCategory && !['local', 'cloud'].includes(modelCategory)) {
      return res.status(400).json({ error: 'Unknown model category' });
    }

    await User.findByIdAndUpdate(userId, {
      $set: {
        ...(defaultModel ? { 'preferences.defaultModel': defaultModel } : {}),
        ...(modelCategory ? { 'preferences.modelCategory': modelCategory } : {}),
      },
    });

    res.json({
      message: 'Settings saved',
      defaultModel: defaultModel || DEFAULT_MODEL_ID,
      modelCategory: modelCategory || 'local',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save settings' });
  }
});

app.get('/api/users/me', authenticateJWT, async (req, res) => {
  try {
    const userId = (req.user as any)._id;
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      ...user,
      usage: {
        tokenQuota: Number(user?.usage?.tokenQuota ?? DEFAULT_TOKEN_QUOTA),
        tokensUsed: Number(user?.usage?.tokensUsed ?? 0),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load user' });
  }
});

app.patch('/api/users/me', authenticateJWT, async (req, res) => {
  try {
    const user = req.user as any;
    const { oldPassword, newPassword, password, username, profilePic, preferences } = req.body;

    const updates: Record<string, any> = {};

    // Password change (requires old password verification)
    const nextPassword = newPassword || password;
    if (nextPassword) {
      if (oldPassword) {
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
          return res.status(400).json({ error: 'Incorrect old password' });
        }
      }
      updates.password = await bcrypt.hash(nextPassword, 10);
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
      const validFonts = ['neo-tech', 'ibm-plex', 'sans', 'serif', 'mono'];
      const validColors = ['green', 'blue', 'purple', 'amber'];
      if (typeof preferences.matrixRain === 'boolean') updates['preferences.matrixRain'] = preferences.matrixRain;
      if (typeof preferences.lightMode === 'boolean') updates['preferences.lightMode'] = preferences.lightMode;
      if (validFonts.includes(preferences.font)) updates['preferences.font'] = preferences.font;
      if (validColors.includes(preferences.themeColor)) updates['preferences.themeColor'] = preferences.themeColor;
      if (preferences.defaultModel && getModelById(preferences.defaultModel)) {
        updates['preferences.defaultModel'] = preferences.defaultModel;
      }
      if (['local', 'cloud'].includes(preferences.modelCategory)) {
        updates['preferences.modelCategory'] = preferences.modelCategory;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await User.findByIdAndUpdate(user._id, { $set: updates });
    if (updates.password) {
      return res.json({ message: 'Password updated successfully' });
    }
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

async function queryOllamaAt(baseUrl: string, messages: { role: string; content: string }[], modelId: string): Promise<GenerateResult> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const request = (async () => {
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: modelId,
          messages,
          stream: false,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama error ${res.status}: ${text}`);
      }

      const data = await res.json() as {
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };

      const reply = data.message?.content?.trim() || '';
      const inputTokens = normalizeTokenCount(data.prompt_eval_count);
      const outputTokens = normalizeTokenCount(data.eval_count);
      const hasExactUsage = inputTokens > 0 || outputTokens > 0;

      return {
        reply,
        tokenUsage: hasExactUsage
          ? {
              inputTokens,
              outputTokens,
              tokenCost: inputTokens + outputTokens,
              exact: true,
              source: 'ollama',
            }
          : undefined,
      };
    } finally {
      controller.abort();
    }
  })();

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Ollama request timed out after ${OLLAMA_REQUEST_TIMEOUT_MS}ms`));
    }, OLLAMA_REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function queryOllama(messages: { role: string; content: string }[], modelId: string): Promise<GenerateResult> {
  const candidates = getOllamaUrlCandidates(OLLAMA_URL);
  let lastError: unknown;

  for (const baseUrl of candidates) {
    try {
      return await queryOllamaAt(baseUrl, messages, modelId);
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('Ollama request failed');
}

async function generateReply(messages: { role: string; content: string }[], modelId: string): Promise<GenerateResult> {
  const model = getModelById(modelId);
  if (!model) {
    throw new HttpError(400, `Unknown model: ${modelId}`);
  }

  if (model.category === 'cloud' && !isCloudModelAvailable(model)) {
    throw new HttpError(401, `${model.id} requires ${model.envVar}`);
  }

  const latestUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const weatherReply = await lookupWeatherReplyFromMessages(messages);
  if (weatherReply) {
    return { reply: weatherReply };
  }

  if (model.category === 'local') {
    try {
      const result = await queryOllama(messages, model.id);
      const cleanedReply = stripThinkTags(result.reply);
      if (cleanedReply.trim()) {
        return {
          reply: cleanedReply,
          tokenUsage: result.tokenUsage,
        };
      }
    } catch {
      if (model.id !== OLLAMA_MODEL) {
        try {
          const fallbackResult = await queryOllama(messages, OLLAMA_MODEL);
          const fallbackReply = stripThinkTags(fallbackResult.reply);
          if (fallbackReply.trim()) {
            return {
              reply: fallbackReply,
              tokenUsage: fallbackResult.tokenUsage,
            };
          }
        } catch {
          // Fall through to deterministic synthetic fallback.
        }
      }
      return { reply: synthesizeReply(latestUserMessage, model.id) };
    }
    return { reply: synthesizeReply(latestUserMessage, model.id) };
  }

  // Cloud models are represented here with a deterministic fallback to keep tests stable.
  return { reply: synthesizeReply(latestUserMessage, model.id) };
}

// POST /api/chat  — send a message, get a random reply, persist both
app.post('/api/chat', authenticateJWT, async (req, res) => {
  try {
    const { message, conversationId, modelId, isTemporary, systemPrompt, attachmentContext, attachmentName } = req.body;
    const userId = (req.user as any)._id;
    const user = req.user as any;
    const selectedModelId = modelId || user?.preferences?.defaultModel || DEFAULT_MODEL_ID;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    if (!getModelById(selectedModelId)) {
      return res.status(400).json({ error: `Unknown model: ${selectedModelId}` });
    }

    const effectiveMessage = attachmentContext
      ? `${message}\n\n[Attached file: ${attachmentName || 'uploaded file'}]\n${String(attachmentContext)}`
      : message;

    if (isTemporary) {
      const generated = await generateReply([{ role: 'user', content: effectiveMessage }], selectedModelId);
      const reply = generated.reply;
      const tokenUsage = await applyExactTokenUsage(String(userId), generated.tokenUsage);
      return res.json({ reply, conversationId: null, modelId: selectedModelId, isTemporary: true, tokenUsage });
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
      conversation = new Conversation({ userId, title, modelId: selectedModelId, systemPrompt: systemPrompt || '', isTemporary: false, messages: [] });
    }

    // Build the message history for Ollama (full conversation context)
    const ollamaMessages = [
      ...conversation.messages.map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: effectiveMessage },
    ];

    const generated = await generateReply(ollamaMessages, selectedModelId);
    const reply = generated.reply;

    conversation.messages.push({ role: 'user', content: effectiveMessage });
    conversation.messages.push({ role: 'assistant', content: reply });
    conversation.modelId = selectedModelId;
    await conversation.save();

    const tokenUsage = await applyExactTokenUsage(String(userId), generated.tokenUsage);

    res.json({ reply, conversationId: conversation._id, modelId: selectedModelId, tokenUsage });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Chat failed' });
  }
});

// POST /api/chat/stream — streamed version, sends NDJSON tokens + thinking
app.post('/api/chat/stream', authenticateJWT, async (req, res) => {
  let conversation: any;
  try {
    const { message, conversationId, modelId, isTemporary, systemPrompt, attachmentContext, attachmentName } = req.body;
    const userId = (req.user as any)._id;
    const user = req.user as any;
    const selectedModelId = modelId || user?.preferences?.defaultModel || DEFAULT_MODEL_ID;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    if (!getModelById(selectedModelId)) {
      return res.status(400).json({ error: 'Unknown model' });
    }

    const effectiveMessage = attachmentContext
      ? `${message}\n\n[Attached file: ${attachmentName || 'uploaded file'}]\n${String(attachmentContext)}`
      : message;

    if (!isTemporary && conversationId) {
      conversation = await Conversation.findOne({ _id: conversationId, userId });
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    } else if (!isTemporary) {
      const title = message.length > 60 ? message.slice(0, 60) + '…' : message;
      conversation = new Conversation({ userId, title, modelId: selectedModelId, systemPrompt: systemPrompt || '', isTemporary: false, messages: [] });
      await conversation.save(); // Persist immediately so the sidebar can show it before streaming ends
    }

    const historyMessages = conversation?.messages || [];
    const promptMessages = [
      ...historyMessages.map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: effectiveMessage },
    ];

    // Track client disconnect to abort Ollama and skip saving
    let clientDisconnected = false;
    const abortController = new AbortController();
    req.on('close', () => {
      clientDisconnected = true;
      abortController.abort();
    });

    // Stream as NDJSON tokens
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    if (conversation?._id) {
      res.setHeader('X-Conversation-Id', String(conversation._id));
    }
    res.flushHeaders();
    // Send init chunk immediately so the client knows the conversation ID before LLM responds
    res.write(JSON.stringify({ init: true, conversationId: conversation?._id ? String(conversation._id) : null, modelId: selectedModelId }) + '\n');

    let reply = '';
    let usageFromProvider: ModelTokenUsage | undefined;
    try {
      const generated = await generateReply(promptMessages, selectedModelId);
      reply = generated.reply;
      usageFromProvider = generated.tokenUsage;
    } catch (err) {
      if (err instanceof HttpError) {
        res.write(JSON.stringify({ error: err.message }) + '\n');
        res.end();
        return;
      }
      throw err;
    }

    let fullContent = '';
    for (const ch of reply) {
      if (clientDisconnected) break;
      fullContent += ch;
      res.write(JSON.stringify({ token: ch }) + '\n');
      await new Promise((resolve) => setTimeout(resolve, 3));
    }

    // Only save if client is still connected (stop endpoint handles saves for aborted requests)
    if (!clientDisconnected && !isTemporary) {
      const cleanReply = stripThinkTags(fullContent);

      conversation.messages.push({ role: 'user', content: effectiveMessage });
      conversation.messages.push({ role: 'assistant', content: cleanReply });
      conversation.modelId = selectedModelId;
      await conversation.save();

      const tokenUsage = await applyExactTokenUsage(String(userId), usageFromProvider);

      res.write(JSON.stringify({ done: true, conversationId: conversation._id, tokenUsage }) + '\n');
      res.end();
    } else if (!clientDisconnected) {
      const cleanReply = stripThinkTags(fullContent);
      const tokenUsage = await applyExactTokenUsage(String(userId), usageFromProvider);
      res.write(JSON.stringify({ done: true, conversationId: null, tokenUsage }) + '\n');
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
    const { message, conversationId, isTemporary, modelId } = req.body;
    const userId = (req.user as any)._id;
    const user = req.user as any;
    const selectedModelId = modelId || user?.preferences?.defaultModel || DEFAULT_MODEL_ID;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    if (isTemporary) {
      return res.json({ conversationId: null, isTemporary: true });
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
    conversation.modelId = selectedModelId;
    await conversation.save();

    res.json({ conversationId: conversation._id });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Stop failed' });
  }
});

const listChats = async (req: express.Request, res: express.Response) => {
  try {
    const userId = (req.user as any)._id;
    const conversations = await Conversation.find({ userId })
      .select('title createdAt updatedAt modelId expiresAt')
      .sort({ updatedAt: -1 })
      .lean();

    const result = conversations.map(c => ({
      id: c._id,
      header: c.title,
      title: c.title,
      modelId: c.modelId || DEFAULT_MODEL_ID,
      expiresAt: c.expiresAt || null,
      date: c.updatedAt,
      updatedAt: c.updatedAt,
    }));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list conversations' });
  }
};

const getChatById = async (req: express.Request, res: express.Response) => {
  try {
    if (req.params.id.startsWith('temp_')) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    const userId = (req.user as any)._id;
    const conversation = await Conversation.findOne({ _id: req.params.id, userId }).lean();
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json({
      id: conversation._id,
      header: conversation.title,
      title: conversation.title,
      modelId: conversation.modelId || DEFAULT_MODEL_ID,
      expiresAt: conversation.expiresAt || null,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get conversation' });
  }
};

const deleteChatById = async (req: express.Request, res: express.Response) => {
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
};

app.get('/api/chats', authenticateJWT, listChats);
app.get('/api/conversations', authenticateJWT, listChats);

app.post('/api/chats', authenticateJWT, async (req, res) => {
  try {
    const userId = (req.user as any)._id;
    const user = req.user as any;
    const modelId = req.body?.modelId || req.body?.model || user?.preferences?.defaultModel || DEFAULT_MODEL_ID;
    const isTemporary = Boolean(req.body?.isTemporary);
    const systemPrompt = typeof req.body?.sysprompt === 'string' ? req.body.sysprompt : (req.body?.systemPrompt || '');
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
    const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;

    if (!getModelById(modelId)) {
      return res.status(400).json({ error: 'Unknown model' });
    }

    if (isTemporary) {
      return res.status(201).json({
        id: `temp_${Date.now()}`,
        isTemporary: true,
        modelId,
        systemPrompt,
        expiresAt: expiresAt?.toISOString() || null,
      });
    }

    const titleSource = prompt || systemPrompt || 'New conversation';
    const title = titleSource.length > 60 ? `${titleSource.slice(0, 60)}...` : titleSource;
    const conversation = new Conversation({
      userId,
      title,
      modelId,
      systemPrompt,
      isTemporary: false,
      expiresAt,
      messages: [],
    });
    await conversation.save();

    res.status(201).json({
      id: conversation._id,
      header: conversation.title,
      modelId,
      isTemporary: false,
      systemPrompt,
      expiresAt: expiresAt?.toISOString() || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create chat' });
  }
});

app.get('/api/chats/:id', authenticateJWT, getChatById);
app.get('/api/conversations/:id', authenticateJWT, getChatById);
app.get('/api/chats/:id/tree', authenticateJWT, getChatById);
app.get('/api/chats/:id/thread', authenticateJWT, getChatById);

app.post('/api/chats/:id/messages', authenticateJWT, async (req, res) => {
  try {
    const userId = (req.user as any)._id;
    const chatId = req.params.id;
    const content = req.body?.content;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }

    if (chatId.startsWith('temp_')) {
      const modelId = req.body?.modelId || DEFAULT_MODEL_ID;
      try {
        const generated = await generateReply([{ role: 'user', content }], modelId);
        const reply = generated.reply;
        const tokenUsage = await applyExactTokenUsage(String(userId), generated.tokenUsage);
        return res.status(201).json({ id: `tempmsg_${Date.now()}`, role: 'assistant', content: reply, parentId: req.body?.parentId || null, tokenUsage });
      } catch (err: any) {
        const status = err instanceof HttpError ? err.status : 500;
        return res.status(status).json({ error: err.message || 'Failed to generate message' });
      }
    }

    const conversation = await Conversation.findOne({ _id: chatId, userId });
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    conversation.messages.push({ role: 'user', content });
    const modelId = conversation.modelId || DEFAULT_MODEL_ID;
    const generated = await generateReply(conversation.messages as { role: string; content: string }[], modelId);
    const reply = generated.reply;
    conversation.messages.push({ role: 'assistant', content: reply });
    await conversation.save();

    const tokenUsage = await applyExactTokenUsage(String(userId), generated.tokenUsage);

    res.status(201).json({ id: `msg_${conversation.messages.length}`, parentId: req.body?.parentId || null, reply, modelId, tokenUsage });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Failed to append message' });
  }
});

app.delete('/api/chats/:id', authenticateJWT, deleteChatById);
app.delete('/api/conversations/:id', authenticateJWT, deleteChatById);

const startServer = async () => {
  await mongoose.connect(MONGODB_URI);
  console.log(green + 'MongoDB Connected' + endc);
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
};

startServer().catch((err) => {
  console.error('Failed to start API server:', err);
  process.exit(1);
});
