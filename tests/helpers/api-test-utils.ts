import net from 'node:net';
import { MongoClient } from 'mongodb';

export const waitFor = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const getAvailablePort = async (): Promise<number> =>
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address?.port) {
          resolve(address.port);
        } else {
          reject(new Error('Could not acquire a free port.'));
        }
      });
    });
  });

export const isPortOpen = async (host: string, port: number): Promise<boolean> =>
  await new Promise((resolve) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(750, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });

export const waitForPort = async (
  host: string,
  port: number,
  timeoutMs = 20000,
) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(host, port)) {
      return;
    }
    await waitFor(250);
  }
  throw new Error(`Timeout waiting for ${host}:${port}`);
};

export const resolveWritableMongoUri = async (): Promise<string> => {
  const candidates = [
    process.env.MONGODB_URI,
    'mongodb://admin:admin@127.0.0.1:27017/mydb?authSource=admin',
    'mongodb://127.0.0.1:27017/sha257',
    'mongodb://127.0.0.1:27017/mydb',
  ].filter((uri): uri is string => Boolean(uri));

  for (const uri of candidates) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000,
    });
    try {
      await client.connect();
      const dbName = new URL(uri).pathname.replace('/', '') || 'test';
      const collectionName = `api_test_probe_${Date.now()}`;
      const collection = client.db(dbName).collection(collectionName);
      const probeId = `probe_${Date.now()}`;
      await collection.insertOne({ probeId });
      await collection.deleteOne({ probeId });
      await collection.drop().catch(() => undefined);
      return uri;
    } catch {
      // Try next URI candidate.
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  throw new Error('No writable MongoDB URI found for API tests.');
};

export const createApiRequest =
  (baseUrl: string) =>
  async (
    endpoint: string,
    options: RequestInit = {},
    token = '',
  ): Promise<{ status: number; body: any }> => {
    const headers = new Headers(options.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers,
    });
    const contentType = response.headers.get('content-type') ?? '';
    const text = await response.text();
    const body =
      contentType.includes('application/json') && text ? JSON.parse(text) : text;

    return { status: response.status, body };
  };
