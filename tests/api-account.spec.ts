import { createServer, Server } from 'node:http';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { connectDatabase, createApp } from '../server.js';

describe('user account API', () => {
  const mongoUri =
    process.env.MONGODB_URI ??
    'mongodb://admin:admin@127.0.0.1:27017/mydb?authSource=admin';
  let server: Server;
  let baseUrl = '';
  let originalTimeout = 5000;

  beforeAll(async () => {
    if (typeof jasmine !== 'undefined') {
      originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000;
    }

    process.env.MONGODB_URI = mongoUri;
    if (mongoose.connection.readyState === 0) {
      await connectDatabase();
    }

    const app = createApp();
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind test server');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await User.deleteMany({ username: /^api_spec_/ });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await mongoose.disconnect();
    if (typeof jasmine !== 'undefined') {
      jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    }
  });

  it('creates a user with POST /api/signup', async () => {
    const username = `api_spec_create_${Date.now()}`;
    const password = 'create-pass-123';
    const response = await fetch(`${baseUrl}/api/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.message).toBe('User created');

    const savedUser = await User.findOne({ username });
    expect(savedUser).toBeTruthy();
    expect(savedUser?.password).not.toBe(password);
  });

  it('modifies an account with PATCH /api/users/:username', async () => {
    const username = `api_spec_modify_${Date.now()}`;
    const password = 'old-pass-123';
    const newUsername = `${username}_updated`;
    const newPassword = 'new-pass-456';

    await User.create({ username, password });

    const response = await fetch(`${baseUrl}/api/users/${username}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername, password: newPassword }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toBe('User updated');
    expect(data.username).toBe(newUsername);

    const oldUser = await User.findOne({ username });
    expect(oldUser).toBeNull();

    const updatedUser = await User.findOne({ username: newUsername });
    expect(updatedUser).toBeTruthy();
    expect(updatedUser?.password).not.toBe(newPassword);
  });

  it('deletes an account with DELETE /api/users/:username', async () => {
    const username = `api_spec_delete_${Date.now()}`;
    await User.create({ username, password: 'delete-pass-123' });

    const response = await fetch(`${baseUrl}/api/users/${username}`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toBe('User deleted');

    const deletedUser = await User.findOne({ username });
    expect(deletedUser).toBeNull();
  });
});
