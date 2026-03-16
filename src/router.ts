import homeModule from './routes/home.js';
import keyboardModule from './routes/keyboard.js';
import { startMatrixRain } from './matrixRain.ts';

type Module = {
  html: string;
  onLoad?: () => void;
  cleanup?: () => void;
};

type AppLike = {
  innerHTML: string;
};

const modules: Record<string, Module> = {
  '/': homeModule,
  '/keyboard': keyboardModule,
  '404': { html: '<h1>404</h1><p>Not Found</p>',},
  '500': { html: '<h1>500</h1><p>Internal Server Error</p>' }, 
};
let currentModule: Module | null = null;

const renderPage = (app: AppLike, html: string) => {
  app.innerHTML = html;
}


export function router(app: AppLike, path: string, modules: Record<string, Module>) {
  if (typeof currentModule?.cleanup === 'function') {
    try {
      currentModule.cleanup();
    } catch (error) {
      console.error('Error occurred during cleanup:', error);
    }
  }

  currentModule = modules[path] || modules['404'];
  
  renderPage(app, currentModule.html);
  
  if (typeof currentModule.onLoad === 'function') {
    currentModule.onLoad();
  }
}

export function handleRoute() {
  const app = document.getElementById('app');
  const path = location.hash.slice(1) || '/';

  if (!app) {
    console.error('Route target not found: #app');
    return;
  }

  router(app, path, modules);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('load', () => {
    startMatrixRain();
    handleRoute();
  });
  window.addEventListener('hashchange', handleRoute);
}
