import express from 'express';
import passport from 'passport';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { configurePassport } from './src/config/passport';
import { User } from './src/models/User';
import bcrypt from 'bcryptjs';

dotenv.config();
const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'LOL'; 
const PORT = Number(process.env.PORT || '5000');
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb://admin:admin@127.0.0.1:27017/mydb?authSource=admin';

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sha257')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

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
  passport.authenticate('local', { session: false }, (err, user, info) => {
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

app.get('/api/me', authenticateJWT, (req, res) => {
  res.json(req.user);
});

app.patch('/api/me', authenticateJWT, async (req, res) => {
  try {
    const { password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.findByIdAndUpdate((req.user as any)._id, { password: hashedPassword });
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

app.delete('/api/users/me', authenticateJWT, async (req, res) => {
  try {
    await User.findByIdAndDelete((req.user as any)._id);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Deletion failed' });
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
