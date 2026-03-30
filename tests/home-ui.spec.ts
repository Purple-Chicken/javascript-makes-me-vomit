import { router } from '../src/router.ts';

describe('Home Page UI', () => {
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

  it('renders home page content', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/': { html: '<h1>Welcome Home</h1><p>This is the home page</p>' },
    };

    await router(app as any, '/', modules as any);

    expect(app.innerHTML).toContain('Welcome Home');
    expect(app.innerHTML).toContain('This is the home page');
  });

  it('displays navigation elements on home page', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/': { html: '<nav><a href="#/login">Login</a><a href="#/signup">Sign Up</a></nav><h1>Home</h1>' },
    };

    await router(app as any, '/', modules as any);

    expect(app.innerHTML).toContain('<nav>');
    expect(app.innerHTML).toContain('Login');
    expect(app.innerHTML).toContain('Sign Up');
  });
});