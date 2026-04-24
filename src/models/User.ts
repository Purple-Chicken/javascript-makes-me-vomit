import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePic: { type: Number, default: 0 },
  preferences: {
    matrixRain: { type: Boolean, default: true },
    lightMode: { type: Boolean, default: false },
    font: { type: String, default: 'neo-tech', enum: ['neo-tech', 'sans', 'serif'] },
    themeColor: { type: String, default: 'green', enum: ['green', 'blue', 'purple', 'amber'] },
    multiLLM: { type: Boolean, default: false },
    llmModels: { type: [String], default: ['qwen3:8b', 'llama3:8b', 'mistral:7b'] },
  },
});

export const User = mongoose.model('User', UserSchema);
