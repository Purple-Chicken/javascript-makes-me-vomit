import express from 'express';
import session from 'express-session';
import passport from 'passport';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { configurePassport } from './src/config/passport';
import { User } from './src/models/User';
import bcrypt from 'bcryptjs';

dotenv.config();
const app = express();

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sha257')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

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
    res.status(201).json({ message: "User created" });
  } catch (err: any) {
    console.error('❌ Signup Error:', err); // This will show in your terminal now
    res.status(500).json({ error: err.message || "Signup failed" });
  }
});

app.post('/api/login', passport.authenticate('local'), (req, res) => {
  res.json({ message: "Logged in", user: req.user });
});
app.get('/api/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

app.post('/api/logout', (req, res, next) => {
  // Passport's logout method is now asynchronous and requires a callback
  req.logout((err) => {
    if (err) {
      console.error('❌ Logout Error:', err);
      return res.status(500).json({ error: 'Failed to log out' });
    }
    
    // This clears the session from the server-side store
    req.session.destroy(() => {
      res.clearCookie('connect.sid'); // Clear the session cookie on the client
      res.json({ message: 'Logged out successfully' });
    });
  });
});
app.patch('/api/change-password', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Use the user ID from the Passport session to find and update the user
    await User.findByIdAndUpdate((req.user as any)._id, { password: hashedPassword });
    
    res.json({ message: 'Password updated successfully' });
  } catch (err: any) {
    console.error('❌ Change Password Error:', err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

app.delete('/api/delete-user', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const userId = (req.user as any)._id;
    await User.findByIdAndDelete(userId);

    // After deleting the record, we must invalidate the session
    req.logout((err) => {
      if (err) return res.status(500).json({ error: 'Error logging out after deletion' });
      res.json({ message: 'User deleted and logged out' });
    });
  } catch (err: any) {
    console.error('❌ Delete User Error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.listen(5000, () => console.log('Server running on http://localhost:5000'));
