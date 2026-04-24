import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  role: { type: String, required: true, enum: ['user', 'assistant'] },
  content: { type: String, required: true },
  modelMetadata: {
    provider: { type: String },
    model: { type: String },
  },
}, { _id: false });

const ConversationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, default: 'New conversation' },
  selectedModels: {
    type: [{ provider: { type: String }, model: { type: String } }],
    default: [],
  },
  messages: { type: [MessageSchema], default: [] },
}, { timestamps: true });

export const Conversation = mongoose.model('Conversation', ConversationSchema);
