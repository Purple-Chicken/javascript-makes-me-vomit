import { handleRoute, router } from '../src/router.js';

describe('router', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      location: { hash: '#/' },
      addEventListener: jasmine.createSpy('addEventListener'),
      removeEventListener: jasmine.createSpy('removeEventListener'),
    };
    (globalThis as any).location = (globalThis as any).window.location;
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).location;
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

    expect(fetchSpy).toHaveBeenCalledWith('/api/me');
    expect((globalThis as any).window.location.hash).toBe('#/login');
    expect(app.innerHTML).toBe('');
  });

  it('renders protected routes when authenticated', async () => {
    const app = { innerHTML: '' };
    spyOn(globalThis as any, 'fetch').and.resolveTo({ ok: true } as Response);
    const modules = {
      '/chat': { html: '<h1>Chat</h1>', protected: true },
      '404': { html: '<h1>404</h1>' },
    };

    await router(app as any, '/chat', modules as any);

    expect(app.innerHTML).toBe('<h1>Chat</h1>');
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
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).location;
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

    const hashes = ['#/settings', '#/history', '#/keyboard'];
    for (const hash of hashes) {
      (globalThis as any).location.hash = hash;
      await handleRoute();
      expect(app.innerHTML).not.toContain('<h1>404</h1>');
    }
  });
});
