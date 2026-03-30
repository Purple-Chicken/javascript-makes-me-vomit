import { router } from '../src/router.ts';

describe('Account Page UI', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      location: { hash: '#/account' },
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
    (globalThis as any).document = {
      getElementById: jasmine.createSpy('getElementById').and.callFake((id) => {
        if (id === 'app') return { innerHTML: '' };
        return { value: '', addEventListener: jasmine.createSpy('addEventListener') };
      })
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).location;
    delete (globalThis as any).localStorage;
    delete (globalThis as any).fetch;
  });

  it('renders account settings page with password change form', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/account': {
        html: `
          <h1>Account Settings</h1>
          <form id="changepwdForm">
            <label>Old Password</label>
            <input type="password" id="old-password" required>
            <label>New Password</label>
            <input type="password" id="password" required>
            <label>Confirm Password</label>
            <input type="password" id="password-confirm" required>
            <button type="submit">Update Password</button>
          </form>
        `,
        protected: true
      },
    };

    await router(app as any, '/account', modules as any);

    expect(app.innerHTML).toContain('Account Settings');
    expect(app.innerHTML).toContain('changepwdForm');
    expect(app.innerHTML).toContain('old-password');
    expect(app.innerHTML).toContain('password');
    expect(app.innerHTML).toContain('password-confirm');
    expect(app.innerHTML).toContain('Update Password');
  });

  it('includes account deletion option', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/account': {
        html: `
          <div class="danger-zone">
            <button id="delete-btn" class="button-danger">Delete My Account</button>
          </div>
        `,
        protected: true
      },
    };

    await router(app as any, '/account', modules as any);

    expect(app.innerHTML).toContain('delete-btn');
    expect(app.innerHTML).toContain('Delete My Account');
    expect(app.innerHTML).toContain('danger-zone');
  });

  it('validates password confirmation field', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/account': {
        html: `
          <form id="changepwdForm">
            <input type="password" id="password" required>
            <input type="password" id="password-confirm" required>
          </form>
        `,
        protected: true
      },
    };

    await router(app as any, '/account', modules as any);

    expect(app.innerHTML).toContain('password-confirm');
    expect(app.innerHTML).toMatch(/required/g);
  });

  it('displays user profile information section', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/account': {
        html: `
          <div class="profile-section">
            <h2>Profile Information</h2>
            <p>Username: testuser</p>
            <p>Email: test@example.com</p>
          </div>
        `,
        protected: true
      },
    };

    await router(app as any, '/account', modules as any);

    expect(app.innerHTML).toContain('Profile Information');
    expect(app.innerHTML).toContain('testuser');
    expect(app.innerHTML).toContain('test@example.com');
  });
});