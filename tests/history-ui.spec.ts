import { router } from '../src/router.ts';

describe('History Page UI', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      location: { hash: '#/history' },
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

  it('renders chat history page when authenticated', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/history': {
        html: '<h1>Chat History</h1><div id="history-list"></div>',
        protected: true
      },
    };

    await router(app as any, '/history', modules as any);

    expect(app.innerHTML).toContain('Chat History');
    expect(app.innerHTML).toContain('history-list');
  });

  it('displays previous conversations', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/history': {
        html: `
          <h1>Chat History</h1>
          <div id="history-list">
            <div class="conversation-item">Conversation 1</div>
            <div class="conversation-item">Conversation 2</div>
          </div>
        `,
        protected: true
      },
    };

    await router(app as any, '/history', modules as any);

    expect(app.innerHTML).toContain('Conversation 1');
    expect(app.innerHTML).toContain('Conversation 2');
    expect(app.innerHTML).toMatch(/conversation-item/g);
  });

  it('provides navigation back to chat', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/history': {
        html: '<a href="#/chat" id="back-to-chat">Back to Chat</a>',
        protected: true
      },
    };

    await router(app as any, '/history', modules as any);

    expect(app.innerHTML).toContain('back-to-chat');
    expect(app.innerHTML).toContain('Back to Chat');
    expect(app.innerHTML).toContain('#/chat');
  });
});