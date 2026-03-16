import { Given, When, Then } from '@cucumber/cucumber';
import { handleRoute } from '../../src/router.ts';

let app = null;

Given('the app is loaded', () => {
  app = { innerHTML: '' };
  globalThis.document = {
    getElementById: (id) => {
      if (id === 'app') return app;
      return null;
    },
  };

  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  globalThis.location = { hash: '#/' };
});

When('I navigate to {string}', async (path) => {
  globalThis.location.hash = `#${path}`;
  await handleRoute();
});

Then('I should see {string}', (text) => {
  if (!app || !app.innerHTML.includes(text)) {
    throw new Error(`Expected app to include "${text}", got: ${app?.innerHTML}`);
  }
});
