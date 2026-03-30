import { router } from '../src/router.ts';

describe('Chat Page UI', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      location: { hash: '#/chat' },
      addEventListener: jasmine.createSpy('addEventListener'),
      removeEventListener: jasmine.createSpy('removeEventListener'),
    };
    (globalThis as any).location = (globalThis as any).window.location;
    (globalThis as any).localStorage = {
      getItem: jasmine.createSpy('getItem').and.returnValue('mock-token'),
      setItem: jasmine.createSpy('setItem'),
      removeItem: jasmine.createSpy('removeItem'),
    };
    (globalThis as any).fetch = jasmine.createSpy('fetch').and.returnValue(
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      })
    );
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).location;
    delete (globalThis as any).localStorage;
    delete (globalThis as any).fetch;
  });

  it('renders chat interface when authenticated', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/chat': {
        html: '<h1>Chat</h1><div id="chat-messages"></div><input id="message-input"><button id="send-button">Send</button>',
        protected: true
      },
    };

    await router(app as any, '/chat', modules as any);

    expect(app.innerHTML).toContain('Chat');
    expect(app.innerHTML).toContain('chat-messages');
    expect(app.innerHTML).toContain('message-input');
    expect(app.innerHTML).toContain('send-button');
    expect(app.innerHTML).toContain('Send');
  });

  it('includes message display area', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/chat': {
        html: '<div id="chat-messages" class="messages-container"></div>',
        protected: true
      },
    };

    await router(app as any, '/chat', modules as any);

    expect(app.innerHTML).toContain('chat-messages');
    expect(app.innerHTML).toContain('messages-container');
  });

  it('provides message input functionality', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/chat': {
        html: '<input id="message-input" placeholder="Type your message...">',
        protected: true
      },
    };

    await router(app as any, '/chat', modules as any);

    expect(app.innerHTML).toContain('message-input');
    expect(app.innerHTML).toContain('Type your message');
  });
});