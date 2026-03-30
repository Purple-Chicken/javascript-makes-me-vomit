import { router } from '../src/router.ts';

describe('Login Page UI', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      location: { hash: '#/login' },
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

  it('renders login form with required fields', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/login': {
        html: `
          <h1>Login</h1>
          <form id="loginForm">
            <input type="text" id="username" placeholder="Username" required>
            <input type="password" id="password" placeholder="Password" required>
            <button type="submit">Log In</button>
          </form>
        `
      },
    };

    await router(app as any, '/login', modules as any);

    expect(app.innerHTML).toContain('Login');
    expect(app.innerHTML).toContain('loginForm');
    expect(app.innerHTML).toContain('username');
    expect(app.innerHTML).toContain('password');
    expect(app.innerHTML).toContain('Log In');
  });

  it('includes form validation attributes', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/login': {
        html: `
          <form id="loginForm">
            <input type="text" id="username" required>
            <input type="password" id="password" required>
            <button type="submit">Log In</button>
          </form>
        `
      },
    };

    await router(app as any, '/login', modules as any);

    expect(app.innerHTML).toContain('required');
  });

  it('provides link to signup page', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/login': {
        html: `
          <p>Don't have an account? <a href="#/signup">Sign up here</a></p>
        `
      },
    };

    await router(app as any, '/login', modules as any);

    expect(app.innerHTML).toContain('Sign up here');
    expect(app.innerHTML).toContain('#/signup');
  });
});