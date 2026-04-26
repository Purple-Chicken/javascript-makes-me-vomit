import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  role: { type: String, required: true, enum: ['user', 'assistant'] },
  content: { type: String, required: true },
}, { _id: false });

const ConversationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, default: 'New conversation' },
  modelId: { type: String, default: 'qwen3:0.5b' },
  systemPrompt: { type: String, default: '' },
  isTemporary: { type: Boolean, default: false },
  expiresAt: { type: Date, default: null },
  messages: { type: [MessageSchema], default: [] },
}, { timestamps: true });

export const Conversation = mongoose.model('Conversation', ConversationSchema);
