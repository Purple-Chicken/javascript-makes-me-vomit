// src/router.ts
import homeModule from './routes/home.ts';
import signupModule from './routes/signup.ts';
import loginModule from './routes/login.ts';
import chatModule from './routes/chat.ts';
import settingsModule from './routes/settings.ts'; // Sidebar
import historyModule from './routes/history.ts';   // Sidebar
import accountModule from './routes/account.ts';
import { startMatrixRain } from './lib/matrixRain.ts';

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
  '/settings': { ...settingsModule, protected: true },
  '/history': { ...historyModule, protected: true },
  '404': { html: '<h1>404</h1><p>Not Found</p>', protected: false },

};
let currentModule: Module | null = null;

const TOPBAR_ICONS = [
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><rect x="5" y="7" width="14" height="12" rx="2"/><circle cx="9" cy="13" r="1.5"/><circle cx="15" cy="13" r="1.5"/><path d="M9 17h6"/><line x1="12" y1="3" x2="12" y2="7"/><circle cx="12" cy="2" r="1"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M4 10l2-6 4 3h4l4-3 2 6"/><ellipse cx="12" cy="15" rx="7" ry="5"/><circle cx="10" cy="14" r="1"/><circle cx="14" cy="14" r="1"/><path d="M11 16.5l1 0.5 1-0.5"/></svg>`,
];

const renderPage = (app: AppLike, html: string) => {
  app.innerHTML = html;
}

async function checkAuth() {
  try {
    const token = localStorage.getItem('token');
    if (!token || token === 'undefined') {
      return false;
    }
    const res = await fetch('/api/users/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
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
  const rawPath = location.hash.slice(1) || '/';
  const path = rawPath.split('?')[0];

  if (!app) {
    console.error('Route target not found: #app');
    return;
  }

  await router(app, path, modules);

  // Determine auth state for UI updates
  const isLoggedIn = await checkAuth();

  // Show/hide topbar elements based on auth
  const topbarAuth = document.getElementById('topbar-auth');
  const topbarProfile = document.getElementById('topbar-profile');
  if (isLoggedIn) {
    if (topbarAuth) topbarAuth.style.display = 'none';
    if (topbarProfile) topbarProfile.style.display = '';

    // Restore profile icon from cache
    const cachedPic = localStorage.getItem('userProfilePic');
    if (topbarProfile && cachedPic && TOPBAR_ICONS[Number(cachedPic)]) {
      topbarProfile.innerHTML = TOPBAR_ICONS[Number(cachedPic)];
    }

    // Load and apply user preferences if not cached yet
    if (!localStorage.getItem('userPreferences')) {
      try {
        const prefRes = await fetch('/api/users/me', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (prefRes.ok) {
          const user = await prefRes.json();
          if (user.preferences) {
            localStorage.setItem('userPreferences', JSON.stringify(user.preferences));
            (window as any).__applyTheme?.(user.preferences);
          }
          // Set profile icon
          if (typeof user.profilePic === 'number') {
            localStorage.setItem('userProfilePic', String(user.profilePic));
            if (topbarProfile && TOPBAR_ICONS[user.profilePic]) {
              topbarProfile.innerHTML = TOPBAR_ICONS[user.profilePic];
            }
          }
        }
      } catch {}
    }
  } else {
    if (topbarAuth) topbarAuth.style.display = '';
    if (topbarProfile) topbarProfile.style.display = 'none';
  }

  // Update nav active state
  const navLinks = document.querySelectorAll('nav a');
  navLinks.forEach(link => link.classList.remove('active'));
  const activeLink = document.querySelector(`nav a[data-route="${path}"]`);
  if (activeLink) {
    activeLink.classList.add('active');
  }

  // Swap Chat / + New Chat button depending on current page
  const navChat = document.getElementById('nav-chat');
  const navNewChat = document.getElementById('nav-new-chat');
  if (path === '/chat') {
    if (navChat) navChat.style.display = 'none';
    if (navNewChat) navNewChat.style.display = '';
  } else {
    if (navChat) navChat.style.display = '';
    if (navNewChat) navNewChat.style.display = 'none';
  }

  // Populate sidebar with up to 6 recent chats
  await loadSidebarChats();
}

async function loadSidebarChats() {
  const container = document.getElementById('sidebar-chats');
  if (!container) return;

  const token = localStorage.getItem('token');
  if (!token || token === 'undefined') {
    container.innerHTML = '';
    return;
  }

  try {
    const res = await fetch('/api/conversations', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) { container.innerHTML = ''; return; }
    const conversations: { id: string; title: string; updatedAt: string }[] = await res.json();
    conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const recent = conversations.slice(0, 6);
    container.innerHTML = recent.map(c =>
      `<a href="#/chat?id=${encodeURIComponent(c.id)}" class="sidebar-chat-link" title="${c.title}">${c.title}</a>`
    ).join('');
  } catch {
    container.innerHTML = '';
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Global theme applicator — called from account page and on load
  (window as any).__applyTheme = (prefs: { matrixRain?: boolean; lightMode?: boolean; font?: string; themeColor?: string }) => {
    const body = document.body;
    const canvas = document.getElementById('matrix-canvas') as HTMLCanvasElement | null;

    // Matrix rain
    if (canvas) canvas.style.display = prefs.matrixRain === false ? 'none' : '';

    // Dark background when matrix rain is off (and not in light mode)
    body.classList.toggle('no-rain', prefs.matrixRain === false && prefs.lightMode !== true);

    // Light mode
    body.classList.toggle('light-mode', prefs.lightMode === true);

    // Font
    body.classList.remove('font-sans', 'font-serif');
    if (prefs.font === 'sans') body.classList.add('font-sans');
    else if (prefs.font === 'serif') body.classList.add('font-serif');

    // Theme color
    body.classList.remove('theme-blue', 'theme-purple', 'theme-amber');
    if (prefs.themeColor && prefs.themeColor !== 'green') {
      body.classList.add(`theme-${prefs.themeColor}`);
    }
  };

  // Apply saved preferences immediately
  const savedPrefs = localStorage.getItem('userPreferences');
  if (savedPrefs) {
    try { (window as any).__applyTheme(JSON.parse(savedPrefs)); } catch {}
  }

  window.addEventListener('load', () => {
    startMatrixRain();

    // Re-apply after load in case canvas was reset
    const sp = localStorage.getItem('userPreferences');
    if (sp) { try { (window as any).__applyTheme(JSON.parse(sp)); } catch {} }

    handleRoute();

    // New Chat nav button: force a fresh chat even if already on /chat
    const navNewChat = document.getElementById('nav-new-chat');
    navNewChat?.addEventListener('click', (e) => {
      e.preventDefault();
      // If already on /chat, force re-route to a blank chat
      if (location.hash.startsWith('#/chat')) {
        location.hash = '#/chat';
        // hashchange won't fire if hash is identical, so manually trigger
        handleRoute();
      } else {
        location.hash = '#/chat';
      }
    });
  });
  window.addEventListener('hashchange', handleRoute);
}
