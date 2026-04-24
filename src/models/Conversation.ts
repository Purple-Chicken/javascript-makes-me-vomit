import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  role: { type: String, required: true, enum: ['user', 'assistant'] },
  model: { type: String },
  content: { type: String, required: true },
}, { _id: false });

const PendingResponseSchema = new mongoose.Schema({
  model: { type: String, required: true },
  status: { type: String, required: true, enum: ['running', 'completed', 'error'] },
  content: { type: String, default: '' },
  error: { type: String, default: null },
}, { _id: false });

const PendingTurnSchema = new mongoose.Schema({
  mode: { type: String, required: true, enum: ['ask-all'] },
  responses: { type: [PendingResponseSchema], default: [] },
}, { _id: false });

const ConversationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  model: { type: String },
  title: { type: String, default: 'New conversation' },
  status: { type: String, enum: ['idle', 'running', 'awaiting-selection', 'completed', 'error'], default: 'completed' },
  lastError: { type: String, default: null },
  pendingTurn: { type: PendingTurnSchema, default: null },
  messages: { type: [MessageSchema], default: [] },
}, { timestamps: true });

export const Conversation = mongoose.model('Conversation', ConversationSchema);
