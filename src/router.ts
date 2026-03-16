// src/router.ts
import homeModule from './routes/home.ts';
import signupModule from './routes/signup.ts';
import loginModule from './routes/login.ts';
import chatModule from './routes/chat.ts';
import settingsModule from './routes/settings.ts'; // Sidebar
import historyModule from './routes/history.ts';   // Sidebar
import accountModule from './routes/account.ts';
import { startMatrixRain } from './matrixRain.ts';

type Module = {
    html: string;
    onLoad?: () => void;
    cleanup?: () => void;
    protected?: boolean;
};

type AppLike = {
    innerHTML: string;
};

const modules: Record<string, Module> = {
  '/': { ...homeModule, protected: false },
  '/login': { ...loginModule, protected: false },
  '/signup': { ...signupModule, protected: false },
  '/chat': { ...chatModule, protected: true },
  '/account': { ...accountModule, protected: true },
  '404': { html: '<h1>404</h1><p>Not Found</p>', protected: false },

};
let currentModule: Module | null = null;

const renderPage = (app: AppLike, html: string) => {
  app.innerHTML = html;
}

async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    return res.ok; // Returns true if 200 OK, false if 401
  } catch {
    return false;
  }
}

export async function router(app: AppLike, path: string, modules: Record<string, Module>) {
  if (typeof currentModule?.cleanup === 'function') {
    try {
      currentModule.cleanup();
    } catch (error) {
      console.error('Error occurred during cleanup:', error);
    }
  }

  const targetModule = modules[path] || modules['404'];

  if (targetModule.protected) {
    const isLoggedIn = await checkAuth();
    if (!isLoggedIn) {
      window.location.hash = '#/login';
      return;
    }
  }

  currentModule = targetModule;
  
  renderPage(app, currentModule.html);
  
  if (typeof currentModule.onLoad === 'function') {
    currentModule.onLoad();
  }
}

export async function handleRoute() {
  const app = document.getElementById('app');
  const path = location.hash.slice(1) || '/';

  if (!app) {
    console.error('Route target not found: #app');
    return;
  }

  await router(app, path, modules);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('load', () => {
    startMatrixRain();
    handleRoute();
  });
  window.addEventListener('hashchange', handleRoute);
}
