import { handleRoute, router } from '../src/router.ts';

describe('router', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      location: { hash: '#/' },
      addEventListener: jasmine.createSpy('addEventListener'),
      removeEventListener: jasmine.createSpy('removeEventListener'),
    };
    (globalThis as any).location = (globalThis as any).window.location;
    (globalThis as any).localStorage = {
      getItem: jasmine.createSpy('getItem').and.returnValue(null),
      setItem: jasmine.createSpy('setItem'),
      removeItem: jasmine.createSpy('removeItem'),
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).location;
    delete (globalThis as any).localStorage;
  });

  it('renders html and calls onLoad when present', async () => {
    const app = { innerHTML: '' };
    let loaded = false;
    const modules = {
      '/': { html: '<h1>Home</h1>', onLoad: () => { loaded = true; } },
      '404': { html: '<h1>404</h1>' },
    };

    await router(app as any, '/', modules as any);

    expect(app.innerHTML).toBe('<h1>Home</h1>');
    expect(loaded).toBeTrue();
  });

  it('uses 404 module when route is missing', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/': { html: '<h1>Home</h1>' },
      '404': { html: '<h1>404</h1>' },
    };

    await router(app as any, '/missing', modules as any);

    expect(app.innerHTML).toBe('<h1>404</h1>');
  });

  it('runs cleanup and logs errors when cleanup throws', async () => {
    const app = { innerHTML: '' };
    let cleaned = false;
    const modules = {
      '/': {
        html: '<p>One</p>',
        cleanup: () => {
          cleaned = true;
          throw new Error('boom');
        },
      },
      '/next': { html: '<p>Two</p>' },
      '404': { html: '<h1>404</h1>' },
    };

    const consoleSpy = spyOn(console, 'error');

    await router(app as any, '/', modules as any);
    await router(app as any, '/next', modules as any);

    expect(cleaned).toBeTrue();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('redirects protected routes to login when not authenticated', async () => {
    const app = { innerHTML: '' };
    const fetchSpy = spyOn(globalThis as any, 'fetch').and.resolveTo({ ok: false } as Response);
    const modules = {
      '/chat': { html: '<h1>Chat</h1>', protected: true },
      '404': { html: '<h1>404</h1>' },
    };

    await router(app as any, '/chat', modules as any);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect((globalThis as any).window.location.hash).toBe('#/login');
    expect(app.innerHTML).toBe('');
  });

  it('renders protected routes when authenticated', async () => {
    const app = { innerHTML: '' };
    (globalThis as any).localStorage.getItem.and.returnValue('jwt-token-1');
    const fetchSpy = spyOn(globalThis as any, 'fetch').and.resolveTo({ ok: true } as Response);
    const modules = {
      '/chat': { html: '<h1>Chat</h1>', protected: true },
      '404': { html: '<h1>404</h1>' },
    };

    await router(app as any, '/chat', modules as any);

    expect(fetchSpy).toHaveBeenCalledWith('/api/users/me', {
      headers: {
        Authorization: 'Bearer jwt-token-1',
      },
    });
    expect(app.innerHTML).toBe('<h1>Chat</h1>');
  });

  it('runs cleanup once and invokes onLoad on protected route transitions', async () => {
    const app = { innerHTML: '' };
    let cleanupCount = 0;
    let chatLoadCount = 0;
    let settingsLoadCount = 0;
    (globalThis as any).localStorage.getItem.and.returnValue('jwt-token-1');
    spyOn(globalThis as any, 'fetch').and.resolveTo({ ok: true } as Response);

    const modules = {
      '/chat': {
        html: '<h1>Chat</h1>',
        protected: true,
        onLoad: () => {
          chatLoadCount += 1;
        },
        cleanup: () => {
          cleanupCount += 1;
        },
      },
      '/settings': {
        html: '<h1>Settings</h1>',
        protected: true,
        onLoad: () => {
          settingsLoadCount += 1;
        },
      },
      '404': { html: '<h1>404</h1>' },
    };

    await router(app as any, '/chat', modules as any);
    await router(app as any, '/settings', modules as any);

    expect(chatLoadCount).toBe(1);
    expect(settingsLoadCount).toBe(1);
    expect(cleanupCount).toBe(1);
    expect(app.innerHTML).toBe('<h1>Settings</h1>');
  });

  it('redirects to login when auth check fails due to network error', async () => {
    const app = { innerHTML: '' };
    (globalThis as any).localStorage.getItem.and.returnValue('jwt-token-1');
    spyOn(globalThis as any, 'fetch').and.rejectWith(new Error('network down'));
    const modules = {
      '/chat': { html: '<h1>Chat</h1>', protected: true },
      '404': { html: '<h1>404</h1>' },
    };

    await router(app as any, '/chat', modules as any);

    expect((globalThis as any).window.location.hash).toBe('#/login');
    expect(app.innerHTML).toBe('');
  });
});

describe('handleRoute', () => {
  beforeEach(() => {
    const app = { innerHTML: '' };
    const keyOutput = { textContent: '' };

    (globalThis as any).document = {
      getElementById: (id: string) => {
        if (id === 'app') return app;
        if (id === 'keyOutput') return keyOutput;
        return null;
      },
    };

    (globalThis as any).location = {
      hash: '#/login',
    };

    (globalThis as any).window = {
      addEventListener: jasmine.createSpy('addEventListener'),
      removeEventListener: jasmine.createSpy('removeEventListener'),
    };
    (globalThis as any).localStorage = {
      getItem: jasmine.createSpy('getItem').and.returnValue('jwt-token-1'),
      setItem: jasmine.createSpy('setItem'),
      removeItem: jasmine.createSpy('removeItem'),
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).location;
    delete (globalThis as any).localStorage;
  });

  it('renders the route based on the hash', async () => {
    await handleRoute();

    const app = (globalThis as any).document.getElementById('app');
    expect(app.innerHTML).toContain('Login');
  });

  it('logs an error when #app container is missing', async () => {
    (globalThis as any).document = {
      getElementById: () => null,
    };
    const consoleSpy = spyOn(console, 'error');

    await handleRoute();

    expect(consoleSpy).toHaveBeenCalledWith('Route target not found: #app');
  });

  it('renders registered routes without falling back to 404', async () => {
    const app = { innerHTML: '' };
    (globalThis as any).document = {
      getElementById: (id: string) => (id === 'app' ? app : null),
    };
    spyOn(globalThis as any, 'fetch').and.resolveTo({ ok: true } as Response);

    const hashes = ['#/settings', '#/history', '#/login', '#/account', '#/'];
    for (const hash of hashes) {
      (globalThis as any).location.hash = hash;
      await handleRoute();
      expect(app.innerHTML).not.toContain('<h1>404</h1>');
    }
  });
});
