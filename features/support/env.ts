// features/support/env.ts
import { BeforeAll } from '@cucumber/cucumber';

// Define the global window object with essential browser methods
global.window = global as any;

// Mock addEventListener to prevent TypeErrors during import
global.window.addEventListener = (type, listener) => {};
global.window.removeEventListener = (type, listener) => {};

global.location = {
  hash: '',
  href: 'http://localhost/',
  assign: () => {},
  replace: () => {}
} as any;

const mockStorage = () => {
  let storage: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in storage ? storage[key] : null),
    setItem: (key: string, value: string) => { storage[key] = value || ''; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { storage = {}; },
    length: Object.keys(storage).length,
    key: (i: number) => Object.keys(storage)[i] || null
  };
};

global.localStorage = mockStorage() as any;
global.sessionStorage = mockStorage() as any;
global.window.localStorage = global.localStorage;
global.window.sessionStorage = global.sessionStorage;

// SINGLE DEFINITION OF DOCUMENT
global.document = {
  getElementById: (id: string) => {
    // This object satisfies BOTH the router.ts style requirements 
    // AND the matrixRain.ts canvas requirements.
    return {
      innerHTML: '',
      textContent: '',
      width: 1280,
      height: 720,
      style: {
        opacity: '1',
        display: '',
      },
      appendChild: () => {},
      addEventListener: () => {},
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false,
      },
      getContext: (type: string) => ({
        fillStyle: '',
        font: '',
        fillRect: () => {},
        fillText: () => {},
        clearRect: () => {},
        measureText: () => ({ width: 10 }),
      }),
    };
  },
  querySelector: (query: string) => null,
  createElement: (tagName: string) => {
    const el = {
      style: {},
      appendChild: () => {},
      addEventListener: () => {},
      getContext: () => ({
        fillStyle: '', font: '', fillRect: () => {}, fillText: () => {},
        measureText: () => ({ width: 10 }),
      }),
    };
    return el;
  },
  body: {
    appendChild: () => {},
  },
  addEventListener: () => {},
} as any;

global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
