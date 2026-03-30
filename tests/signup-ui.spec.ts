import { router } from '../src/router.ts';

describe('Signup Page UI', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      location: { hash: '#/signup' },
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

  it('renders signup form with username and password fields', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/signup': {
        html: `
          <h1>Sign Up</h1>
          <form id="signupForm">
            <input type="text" id="username" placeholder="Choose a username" required>
            <input type="password" id="password" placeholder="Choose a password" required>
            <button type="submit">Create Account</button>
          </form>
        `
      },
    };

    await router(app as any, '/signup', modules as any);

    expect(app.innerHTML).toContain('Sign Up');
    expect(app.innerHTML).toContain('signupForm');
    expect(app.innerHTML).toContain('Choose a username');
    expect(app.innerHTML).toContain('Choose a password');
    expect(app.innerHTML).toContain('Create Account');
  });

  it('includes password confirmation field', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/signup': {
        html: `
          <form id="signupForm">
            <input type="password" id="password" required>
            <input type="password" id="confirm-password" placeholder="Confirm password" required>
          </form>
        `
      },
    };

    await router(app as any, '/signup', modules as any);

    expect(app.innerHTML).toContain('confirm-password');
    expect(app.innerHTML).toContain('Confirm password');
  });

  it('provides link back to login page', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/signup': {
        html: `
          <p>Already have an account? <a href="#/login">Log in here</a></p>
        `
      },
    };

    await router(app as any, '/signup', modules as any);

    expect(app.innerHTML).toContain('Log in here');
    expect(app.innerHTML).toContain('#/login');
  });
});