import loginModule from '../src/routes/login.js';
import signupModule from '../src/routes/signup.js';

type SubmitHandler = (event: { preventDefault: () => void }) => Promise<void> | void;

describe('login route', () => {
  let submitHandler: SubmitHandler | null = null;
  let form: { addEventListener: (event: string, handler: SubmitHandler) => void };
  let usernameInput: { value: string };
  let passwordInput: { value: string };

  beforeEach(() => {
    submitHandler = null;
    form = {
      addEventListener: (event, handler) => {
        if (event === 'submit') {
          submitHandler = handler;
        }
      },
    };
    usernameInput = { value: 'alice' };
    passwordInput = { value: 'hunter2' };

    (globalThis as any).document = {
      getElementById: (id: string) => {
        if (id === 'loginForm') return form;
        if (id === 'username') return usernameInput;
        if (id === 'password') return passwordInput;
        return null;
      },
    };
    (globalThis as any).window = { location: { hash: '#/login' } };
    (globalThis as any).location = (globalThis as any).window.location;
    (globalThis as any).alert = jasmine.createSpy('alert');
    (globalThis as any).localStorage = {
      setItem: jasmine.createSpy('setItem'),
      getItem: jasmine.createSpy('getItem').and.returnValue(null),
      removeItem: jasmine.createSpy('removeItem'),
    };
  });

  afterEach(() => {
    delete (globalThis as any).document;
    delete (globalThis as any).window;
    delete (globalThis as any).location;
    delete (globalThis as any).alert;
    delete (globalThis as any).localStorage;
  });

  it('posts credentials and redirects to chat on success', async () => {
    const fetchSpy = spyOn(globalThis as any, 'fetch').and.resolveTo({
      ok: true,
      json: async () => ({ token: 'jwt-token-1' }),
    } as Response);

    loginModule.onLoad?.();
    await submitHandler?.({ preventDefault: () => {} });

    expect(fetchSpy).toHaveBeenCalledWith('/api/sessions', jasmine.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
    const [, options] = fetchSpy.calls.mostRecent().args as [string, { body: string }];
    expect(options.body).toBe(JSON.stringify({ username: 'alice', password: 'hunter2' }));
    expect((globalThis as any).localStorage.setItem).toHaveBeenCalledWith('token', 'jwt-token-1');
    expect((globalThis as any).window.location.hash).toBe('#/chat');
  });

  it('alerts on failed login', async () => {
    spyOn(globalThis as any, 'fetch').and.resolveTo({
      ok: false,
      json: async () => ({ error: 'Incorrect password.' }),
    } as Response);

    loginModule.onLoad?.();
    await submitHandler?.({ preventDefault: () => {} });

    expect((globalThis as any).alert).toHaveBeenCalledWith('Incorrect password.');
  });
});

describe('signup route', () => {
  let submitHandler: SubmitHandler | null = null;
  let form: { addEventListener: (event: string, handler: SubmitHandler) => void };
  let usernameInput: { value: string };
  let passwordInput: { value: string; addEventListener: (event: string, handler: () => void) => void };
  let confirmInput: { value: string; addEventListener: (event: string, handler: () => void) => void };
  let passwordError: { textContent: string };
  let matchError: { textContent: string };

  beforeEach(() => {
    submitHandler = null;
    form = {
      addEventListener: (event, handler) => {
        if (event === 'submit') {
          submitHandler = handler;
        }
      },
    };
    usernameInput = { value: 'bob' };
    passwordInput = {
      value: 'secret123',
      addEventListener: () => {},
    };
    confirmInput = {
      value: 'secret123',
      addEventListener: () => {},
    };
    passwordError = { textContent: '' };
    matchError = { textContent: '' };

    (globalThis as any).document = {
      getElementById: (id: string) => {
        if (id === 'signupForm') return form;
        if (id === 'username') return usernameInput;
        if (id === 'password') return passwordInput;
        if (id === 'password-confirm') return confirmInput;
        if (id === 'password-error') return passwordError;
        if (id === 'match-error') return matchError;
        return null;
      },
    };
    (globalThis as any).window = { location: { hash: '#/signup' } };
    (globalThis as any).location = (globalThis as any).window.location;
    (globalThis as any).alert = jasmine.createSpy('alert');
  });

  afterEach(() => {
    delete (globalThis as any).document;
    delete (globalThis as any).window;
    delete (globalThis as any).location;
    delete (globalThis as any).alert;
  });

  it('posts credentials, alerts success, and redirects on success', async () => {
    const fetchSpy = spyOn(globalThis as any, 'fetch').and.resolveTo({ ok: true } as Response);

    signupModule.onLoad?.();
    await submitHandler?.({ preventDefault: () => {} });

    expect(fetchSpy).toHaveBeenCalledWith('/api/users', jasmine.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
    const [, options] = fetchSpy.calls.mostRecent().args as [string, { body: string }];
    expect(options.body).toBe(JSON.stringify({ username: 'bob', password: 'secret123' }));
    expect((globalThis as any).alert).toHaveBeenCalledWith('Account created! Please log in.');
    expect((globalThis as any).window.location.hash).toBe('#/login');
  });

  it('alerts API-provided error message on failure', async () => {
    spyOn(globalThis as any, 'fetch').and.resolveTo({
      ok: false,
      json: async () => ({ error: 'Username already exists' }),
    } as Response);

    signupModule.onLoad?.();
    await submitHandler?.({ preventDefault: () => {} });

    expect((globalThis as any).alert).toHaveBeenCalledWith('Username already exists');
  });

  it('falls back to a generic message when API error payload has no message', async () => {
    spyOn(globalThis as any, 'fetch').and.resolveTo({
      ok: false,
      json: async () => ({}),
    } as Response);

    signupModule.onLoad?.();
    await submitHandler?.({ preventDefault: () => {} });

    expect((globalThis as any).alert).toHaveBeenCalledWith('Signup failed');
  });

  it('falls back to generic message when error response is not JSON', async () => {
    spyOn(globalThis as any, 'fetch').and.resolveTo({
      ok: false,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    } as unknown as Response);

    signupModule.onLoad?.();
    await submitHandler?.({ preventDefault: () => {} });

    expect((globalThis as any).alert).toHaveBeenCalledWith('Signup failed');
  });
});
