import { handleRoute, router } from '../src/router.js';

describe('router', () => {
  beforeEach(() => {
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

  it('renders html and calls onLoad when present', () => {
    const app = { innerHTML: '' };
    let loaded = false;
    const modules = {
      '/': { html: '<h1>Home</h1>', onLoad: () => { loaded = true; } },
      '404': { html: '<h1>404</h1>' },
    };

    router(app as any, '/', modules as any);

    expect(app.innerHTML).toBe('<h1>Home</h1>');
    expect(loaded).toBeTrue();
  });

  it('uses 404 module when route is missing', () => {
    const app = { innerHTML: '' };
    const modules = {
      '/': { html: '<h1>Home</h1>' },
      '404': { html: '<h1>404</h1>' },
    };

    router(app as any, '/missing', modules as any);

    expect(app.innerHTML).toBe('<h1>404</h1>');
  });

  it('runs cleanup and logs errors when cleanup throws', () => {
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

    router(app as any, '/', modules as any);
    router(app as any, '/next', modules as any);

    expect(cleaned).toBeTrue();
    expect(consoleSpy).toHaveBeenCalled();
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

  it('renders the route based on the hash', () => {
    handleRoute();

    const app = (globalThis as any).document.getElementById('app');
    expect(app.innerHTML).toContain('Login');
  });
});
