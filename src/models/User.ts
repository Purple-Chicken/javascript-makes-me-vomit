import mongoose from 'mongoose';

const DefaultModelSchema = new mongoose.Schema(
  {
    provider: { type: String, default: 'Ollama' },
    model: { type: String, required: true },
  },
  { _id: false },
);

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePic: { type: Number, default: 0 },
  preferences: {
    matrixRain: { type: Boolean, default: true },
    lightMode: { type: Boolean, default: false },
    font: { type: String, default: 'neo-tech', enum: ['neo-tech', 'sans', 'serif'] },
    themeColor: { type: String, default: 'green', enum: ['green', 'blue', 'purple', 'amber'] },
    defaultModelSet: {
      type: [DefaultModelSchema],
      default: [],
    },
  },
});

export const User = mongoose.model('User', UserSchema);
