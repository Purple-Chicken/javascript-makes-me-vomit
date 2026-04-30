import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePic: { type: Number, default: 0 },
  preferences: {
    matrixRain: { type: Boolean, default: true },
    lightMode: { type: Boolean, default: false },
    font: { type: String, default: 'ibm-plex', enum: ['neo-tech', 'ibm-plex', 'sans', 'serif', 'mono'] },
    themeColor: { type: String, default: 'green', enum: ['green', 'blue', 'purple', 'amber'] },
    defaultModel: { type: String, default: 'qwen3:0.5b' },
    modelCategory: { type: String, default: 'local', enum: ['local', 'cloud'] },
  },
  usage: {
    tokenQuota: { type: Number, default: 100000 },
    tokensUsed: { type: Number, default: 0 },
  },
});

export const User = mongoose.model('User', UserSchema);
