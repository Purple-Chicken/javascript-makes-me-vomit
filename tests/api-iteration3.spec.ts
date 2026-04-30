import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  createApiRequest,
  getAvailablePort,
  resolveWritableMongoUri,
  waitForPort,
} from './helpers/api-test-utils.ts';

const buildSimplePdfBase64 = (text: string) => {
  const lines: string[] = [];
  const offsets: number[] = [0];
  const pushObject = (obj: string) => {
    const current = lines.join('');
    offsets.push(Buffer.byteLength(current, 'utf8'));
    lines.push(obj);
  };

  lines.push('%PDF-1.4\n');
  pushObject('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  pushObject('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  pushObject('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n');

  const escaped = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const contentStream = `BT\n/F1 18 Tf\n30 90 Td\n(${escaped}) Tj\nET`;
  pushObject(`4 0 obj\n<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream\nendobj\n`);
  pushObject('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  const xrefPos = Buffer.byteLength(lines.join(''), 'utf8');
  lines.push(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  lines.push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);
  return Buffer.from(lines.join(''), 'utf8').toString('base64');
};

describe('iteration 3 feature API', () => {
  const stopProcess = async (child: ChildProcess | null) => {
    if (!child || child.killed) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 1000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill('SIGTERM');
    });
  };

  let apiProcess: ChildProcess | null = null;
  let apiRequest: ReturnType<typeof createApiRequest>;
  let token = '';

  beforeAll(async () => {
    const root = path.resolve('.');
    const port = await getAvailablePort();
    const mongoUri = await resolveWritableMongoUri();
    apiRequest = createApiRequest(`http://127.0.0.1:${port}`);

    apiProcess = spawn(process.execPath, ['--import', 'tsx', path.join(root, 'server.ts')], {
      cwd: root,
      stdio: 'ignore',
      env: { ...process.env, PORT: String(port), MONGODB_URI: mongoUri },
    });

    await waitForPort('127.0.0.1', port, 25000);

    const username = `iter3_user_${Date.now()}`;
    const password = 'password-123';
    await apiRequest('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const login = await apiRequest('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    token = login.body.token;
  });

  afterAll(async () => {
    await stopProcess(apiProcess);
  });

  it('scans uploaded image metadata', async () => {
    const pngStub = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
    const res = await apiRequest('/api/files/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'diagram.png',
        mimeType: 'image/png',
        contentBase64: pngStub,
      }),
    }, token);

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('image');
    expect(String(res.body.summary)).toContain('diagram.png');
  });

  it('scans uploaded non-image file and returns excerpt', async () => {
    const text = Buffer.from('first line\nsecond line\nthird line', 'utf8').toString('base64');
    const res = await apiRequest('/api/files/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'notes.txt',
        mimeType: 'text/plain',
        contentBase64: text,
      }),
    }, token);

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('text');
    expect(String(res.body.summary)).toContain('first line');
  });

  it('extracts readable text from uploaded PDFs', async () => {
    const pdfBase64 = buildSimplePdfBase64('Uploaded PDF text sample');
    const res = await apiRequest('/api/files/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'sample.pdf',
        mimeType: 'application/pdf',
        contentBase64: pdfBase64,
      }),
    }, token);

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('pdf');
    expect(String(res.body.summary)).toContain('Uploaded PDF text sample');
  });

  it('returns token cost and reduced remaining balance after a prompt', async () => {
    const before = await apiRequest('/api/tokens/me', { method: 'GET' }, token);
    expect(before.status).toBe(200);

    const chat = await apiRequest('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'What is 2 divided by 1?',
        modelId: 'qwen3:0.5b',
        isTemporary: true,
      }),
    }, token);

    expect(chat.status).toBe(200);
    if (chat.body.tokenUsage) {
      expect(chat.body.tokenUsage.tokenCost).toBeGreaterThan(0);
      expect(chat.body.tokenUsage.exact).toBe(true);
      expect(chat.body.tokenUsage.source).toBe('ollama');
    }

    const after = await apiRequest('/api/tokens/me', { method: 'GET' }, token);
    expect(after.status).toBe(200);
    expect(after.body.tokensRemaining).toBeLessThanOrEqual(before.body.tokensRemaining);
  });

  it('does not treat attachment text as weather intent', async () => {
    const res = await apiRequest('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Please summarize this uploaded file.',
        modelId: 'qwen3:0.5b',
        isTemporary: true,
        attachmentName: 'requirements.pdf',
        attachmentContext: 'This file mentions weather in Seattle as a sample test prompt.',
      }),
    }, token);

    expect(res.status).toBe(200);
    expect(String(res.body.reply)).not.toContain('cannot access live weather data');
  });
});




