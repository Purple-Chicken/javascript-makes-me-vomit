import homeModule from './routes/home.ts';
import keyboardModule from './routes/keyboard.ts';
import loginModule from './routes/login.ts';
import { startMatrixRain } from './matrixRain.ts';

const modules = {
  '/': homeModule,
  '/keyboard': keyboardModule,
  '/login': loginModule,
  '/signup': signupModule,
  '404': { html: '<h1>404</h1><p>Not Found</p>',},
  '500': { html: '<h1>500</h1><p>Internal Server Error</p>' }, 
};
let currentModule = null;

const renderPage = (app, html) => {
  app.innerHTML = html;
}


export function router(app, path, modules) {
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

  // Update nav active state
  const navLinks = document.querySelectorAll('nav a');
  navLinks.forEach(link => link.classList.remove('active'));
  const activeLink = document.querySelector(`nav a[data-route="${path}"]`);
  if (activeLink) activeLink.classList.add('active');
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('load', () => {
    startMatrixRain();
    handleRoute();
  });
  window.addEventListener('hashchange', handleRoute);
}
