import { router } from '../src/router.ts';

describe('Settings Page UI', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      location: { hash: '#/settings' },
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

  it('renders settings page with configuration options', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/settings': {
        html: '<h1>Settings</h1><div id="settings-panel"></div>',
        protected: true
      },
    };

    await router(app as any, '/settings', modules as any);

    expect(app.innerHTML).toContain('Settings');
    expect(app.innerHTML).toContain('settings-panel');
  });

  it('includes toggle switches and knobs', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/settings': {
        html: `
          <div id="settings-panel">
            <label><input type="checkbox" id="dark-mode"> Dark Mode</label>
            <label><input type="checkbox" id="notifications"> Enable Notifications</label>
            <input type="range" id="font-size" min="12" max="24">
          </div>
        `,
        protected: true
      },
    };

    await router(app as any, '/settings', modules as any);

    expect(app.innerHTML).toContain('dark-mode');
    expect(app.innerHTML).toContain('notifications');
    expect(app.innerHTML).toContain('font-size');
    expect(app.innerHTML).toContain('Dark Mode');
    expect(app.innerHTML).toContain('Enable Notifications');
  });

  it('provides save settings functionality', async () => {
    const app = { innerHTML: '' };
    const modules = {
      '/settings': {
        html: '<button id="save-settings">Save Settings</button>',
        protected: true
      },
    };

    await router(app as any, '/settings', modules as any);

    expect(app.innerHTML).toContain('save-settings');
    expect(app.innerHTML).toContain('Save Settings');
  });
});