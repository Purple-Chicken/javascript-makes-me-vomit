import express from 'express';
import session from 'express-session';
import passport from 'passport';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import { configurePassport } from './src/config/passport';
import { User } from './src/models/User';
import bcrypt from 'bcryptjs';

dotenv.config();
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sha257';

export async function connectDatabase() {
  await mongoose.connect(mongoUri);
}

export function createApp() {
  const app = express();

  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(session({
    secret: 'LOL', // Use an env variable in production
    resave: false,
    saveUninitialized: false
  }));

  configurePassport();
  app.use(passport.initialize());
  app.use(passport.session());

  // API Routes
  app.post('/api/signup', async (req, res) => {
    try {
      const { username, password } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = new User({ username, password: hashedPassword });
      await newUser.save();
      res.status(201).json({ message: 'User created' });
    } catch (err: any) {
      console.error('❌ Signup Error:', err);
      res.status(500).json({ error: err.message || 'Signup failed' });
    }
  });

  app.patch('/api/users/:username', async (req, res) => {
    try {
      const { username: currentUsername } = req.params;
      const { username, password } = req.body as { username?: string; password?: string };
      const update: { username?: string; password?: string } = {};

      if (username) {
        update.username = username;
      }
      if (password) {
        update.password = await bcrypt.hash(password, 10);
      }

      const updatedUser = await User.findOneAndUpdate(
        { username: currentUsername },
        { $set: update },
        { returnDocument: 'after' }
      );

      if (!updatedUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ message: 'User updated', username: updatedUser.username });
    } catch (err: any) {
      console.error('❌ Update Error:', err);
      res.status(500).json({ error: err.message || 'Update failed' });
    }
  });

  app.delete('/api/users/:username', async (req, res) => {
    try {
      const { username } = req.params;
      const result = await User.deleteOne({ username });

      if (result.deletedCount === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ message: 'User deleted' });
    } catch (err: any) {
      console.error('❌ Delete Error:', err);
      res.status(500).json({ error: err.message || 'Delete failed' });
    }
  });

  app.post('/api/login', passport.authenticate('local'), (req, res) => {
    res.json({ message: 'Logged in', user: req.user });
  });
  app.get('/api/me', (req, res) => {
    if (req.isAuthenticated()) {
      res.json(req.user);
    } else {
      res.status(401).json({ error: 'Not authenticated' });
    }
  });

  app.post('/api/logout', (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ message: 'Logged out' });
    });
  });

  return app;
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMain) {
  connectDatabase()
    .then(() => {
      console.log('✅ MongoDB Connected');
      const app = createApp();
      app.listen(5000, () => console.log('Server running on http://localhost:5000'));
    })
    .catch((err) => console.error('❌ MongoDB Connection Error:', err));
}
