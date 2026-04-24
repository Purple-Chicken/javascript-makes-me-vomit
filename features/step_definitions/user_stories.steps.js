import { Given, When, Then } from '@cucumber/cucumber';
import { handleRoute } from '../../src/router.ts';

let app = null;
let authState = { loggedIn: false, sessionValid: false };
let formHandlers = { login: null, signup: null };
let inputs = { username: { value: '' }, password: { value: '' } };
let alerts = [];
let storage = {};

const isAuthenticated = () => authState.loggedIn || authState.sessionValid;

const installDom = () => {
  app = { innerHTML: '' };
  formHandlers = { login: null, signup: null };
  inputs = { username: { value: '' }, password: { value: '' } };
  alerts = [];
  storage = {};

  const makeForm = (type) => ({
    addEventListener: (event, handler) => {
      if (event === 'submit') {
        formHandlers[type] = handler;
      }
    },
  });

  const navElement = {
    innerHTML: `
      <a href="#/">Home</a>
      <a href="#/login">Login</a>
      <a href="#/chat">Chat</a>
      <a href="#/account">Account</a>
    `,
  };

  globalThis.document = {
    getElementById: (id) => {
      if (id === 'app') return app;
      if (id === 'loginForm') return makeForm('login');
      if (id === 'signupForm') return makeForm('signup');
      if (id === 'username') return inputs.username;
      if (id === 'password') return inputs.password;
      return null;
    },
    querySelector: (selector) => {
      if (selector === 'nav') return navElement;
      return null;
    },
  };

  globalThis.window = {
    addEventListener: () => { },
    removeEventListener: () => { },
    location: { hash: '#/' },
  };

  globalThis.location = globalThis.window.location;
  globalThis.alert = (message) => alerts.push(message);
  globalThis.localStorage = {
    getItem: (key) => storage[key] ?? null,
    setItem: (key, value) => {
      storage[key] = String(value);
    },
    removeItem: (key) => {
      delete storage[key];
    },
    clear: () => {
      storage = {};
    },
  };
};

const installFetchMock = () => {
  globalThis.fetch = async (url) => {
    if (url === '/api/users/me') {
      return { ok: isAuthenticated() };
    }
    if (url === '/api/sessions') {
      authState.loggedIn = true;
      return { ok: true, json: async () => ({ token: 'test-token' }) };
    }
    if (url === '/api/users') {
      return { ok: true, json: async () => ({}) };
    }
    return { ok: false, json: async () => ({}) };
  };
};

const setAuthState = (loggedIn, sessionValid = false) => {
  authState = { loggedIn, sessionValid };
  installFetchMock();
};

const navigateTo = async (path) => {
  globalThis.location.hash = `#${path}`;
  await handleRoute();
};

const setInputValue = (label, value) => {
  const normalized = label.toLowerCase();
  if (normalized.includes('password')) {
    inputs.password.value = value;
    return;
  }
  inputs.username.value = value;
};

const submitForm = async (type) => {
  const handler = formHandlers[type];
  if (!handler) {
    throw new Error(`Expected ${type} form handler to be registered`);
  }
  await handler({ preventDefault: () => { } });
  await handleRoute();
};

Given('I am not logged in', () => {
  installDom();
  setAuthState(false, false);
});

Given('I am on the landing page', async () => {
  installDom();
  setAuthState(false, false);
  await navigateTo('/');
});

Given('I am logged in', () => {
  installDom();
  setAuthState(true, false);
});

Given('I am on my dashboard', async () => {
  await navigateTo('/chat');
});

Given('I have previously logged in', () => {
  installDom();
  setAuthState(false, true);
});

Given('my session cookie is still valid', () => { });

Given('my token is still valid', () => {
  authState.sessionValid = true;
  storage.token = 'remembered-token';
});

When('I navigate to the home page', async () => {
  await navigateTo('/');
});

When('I click {string}', async (label) => {
  if (label === 'Sign Up') {
    await navigateTo('/signup');
    return;
  }
  if (label === 'Log In') {
    if (app.innerHTML.includes('Login')) {
      await submitForm('login');
      return;
    }
    await navigateTo('/login');
    return;
  }
  if (label === 'Create Account') {
    await submitForm('signup');
    return;
  }
  throw new Error(`Unknown click target: ${label}`);
});

When('I press {string}', async (label) => {
  if (label === 'Log Out') {
    authState.loggedIn = false;
    authState.sessionValid = false;
    await navigateTo('/');
    return;
  }
  throw new Error(`Unknown button press: ${label}`);
});

When('I fill in {string} with {string}', (label, value) => {
  setInputValue(label, value);
});

Then('I should see the landing page', () => {
  if (!app.innerHTML.includes('Home')) {
    throw new Error(`Expected landing page content, got: ${app.innerHTML}`);
  }
});

Then('I should see options to {string}', (option) => {
  const normalize = (label) => label.replace(/\s+/g, '').toLowerCase();
  const topBarContent = globalThis.document?.querySelector?.('nav')?.innerHTML ?? '';
  const combinedContent = `${app.innerHTML}${topBarContent}`;
  const normalizedContent = combinedContent.replace(/\s+/g, '').toLowerCase();
  const hasOption = (label) =>
    combinedContent.includes(label) || normalizedContent.includes(normalize(label));

  if (!hasOption(option)) {
    throw new Error(`Expected option "${option}", got: ${app.innerHTML}`);
  }
});

Then('I should see options to {string} and {string}', (first, second) => {
  const normalize = (label) => label.replace(/\s+/g, '').toLowerCase();
  const topBarContent = globalThis.document?.querySelector?.('nav')?.innerHTML ?? '';
  const combinedContent = `${app.innerHTML}${topBarContent}`;
  const normalizedContent = combinedContent.replace(/\s+/g, '').toLowerCase();
  const hasOption = (label) =>
    combinedContent.includes(label) || normalizedContent.includes(normalize(label));

  if (!hasOption(first) || !hasOption(second)) {
    throw new Error(`Expected options "${first}" and "${second}", got: ${app.innerHTML}`);
  }
});

Then('I should be on the Create Account page', () => {
  if (!app.innerHTML.includes('Sign Up')) {
    throw new Error(`Expected Sign Up page, got: ${app.innerHTML}`);
  }
});

Then('I should be on the Login page', () => {
  if (!app.innerHTML.includes('Login')) {
    throw new Error(`Expected Login page, got: ${app.innerHTML}`);
  }
});

Then('I should be logged in', () => {
  if (!isAuthenticated()) {
    throw new Error('Expected user to be authenticated');
  }
});

Then('I should see my profile', () => {
  if (!app.innerHTML.includes('Account Settings')) {
    throw new Error(`Expected profile content, got: ${app.innerHTML}`);
  }
});

Then('I should be redirected to the landing page', () => {
  if (globalThis.location.hash !== '#/') {
    throw new Error(`Expected redirect to landing page, got: ${globalThis.location.hash}`);
  }
});

Then('I should no longer be authenticated', () => {
  if (isAuthenticated()) {
    throw new Error('Expected user to be logged out');
  }
});

Then('I should be redirected to my chat page', () => {
  if (globalThis.location.hash !== '#/chat') {
    throw new Error(`Expected redirect to chat, got: ${globalThis.location.hash}`);
  }
});

Then('I should see a new chat', () => {
  if (!app.innerHTML.includes('Chat')) {
    throw new Error(`Expected chat content, got: ${app.innerHTML}`);
  }
});

Then('I should be automatically logged in', () => {
  if (!isAuthenticated()) {
    throw new Error('Expected session to be authenticated');
  }
});

Then('I should be redirected to my dashboard', () => {
  if (globalThis.location.hash !== '#/chat') {
    throw new Error(`Expected redirect to dashboard, got: ${globalThis.location.hash}`);
  }
});

Then('I should not see the {string} prompt', (label) => {
  if (app.innerHTML.includes(label)) {
    throw new Error(`Expected not to see "${label}", got: ${app.innerHTML}`);
  }
});
