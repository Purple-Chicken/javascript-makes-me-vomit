import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  role: { type: String, required: true, enum: ['user', 'assistant'] },
  model: { type: String },
  content: { type: String, required: true },
}, { _id: false });

const ConversationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, default: 'New conversation' },
  messages: { type: [MessageSchema], default: [] },
}, { timestamps: true });

export const Conversation = mongoose.model('Conversation', ConversationSchema);
