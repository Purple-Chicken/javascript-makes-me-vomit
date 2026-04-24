// src/router.ts
import homeModule from './routes/home.ts';
import signupModule from './routes/signup.ts';
import loginModule from './routes/login.ts';
import chatModule from './routes/chat.ts';
import settingsModule from './routes/settings.ts'; // Sidebar
import historyModule from './routes/history.ts';   // Sidebar
import accountModule from './routes/account.ts';
import { startMatrixRain, setMatrixColor } from './lib/matrixRain.ts';

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

const renderPage = (app: AppLike, html: string): Promise<void> => {
  const appElement = app as Partial<HTMLElement>;
  const style = (appElement as any)?.style as { opacity?: string } | undefined;

  // Test stubs may not be HTMLElements; render immediately without transition.
  if (!style) {
    app.innerHTML = html;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    // Fade out
    style.opacity = '0';

    // Wait for fade out to complete, then swap content and fade in
    setTimeout(() => {
      app.innerHTML = html;
      // Force reflow to ensure opacity 0 is applied before setting to 1
      void (appElement as HTMLElement).offsetHeight;
      style.opacity = '1';
      // Resolve after fade in is triggered
      resolve();
    }, 200);
  });
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

  if (path === '/') {
    const isLoggedIn = await checkAuth();
    if (isLoggedIn) {
      window.location.hash = '#/chat';
      return;
    }
  }

  if (targetModule.protected) {
    const isLoggedIn = await checkAuth();
    if (!isLoggedIn) {
      window.location.hash = '#/login';
      return;
    }
  }

  currentModule = targetModule;

  await renderPage(app, currentModule.html);

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
    if (!localStorage.getItem('userPreferences') || !localStorage.getItem('cachedUsername')) {
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
          // Cache username
          if (user.username) {
            localStorage.setItem('cachedUsername', user.username);
          }
        }
      } catch {}
    }
  } else {
    if (topbarAuth) topbarAuth.style.display = (path === '/login' || path === '/signup') ? 'none' : '';
    if (topbarProfile) topbarProfile.style.display = 'none';
  }

  // Track current route on body for CSS targeting (e.g. light-mode backdrop)
  if (document.body?.dataset) {
    document.body.dataset.route = path;
  }

  // Update nav active state
  if (typeof document.querySelectorAll === 'function') {
    const navLinks = document.querySelectorAll('nav a');
    navLinks.forEach(link => link.classList.remove('active'));
  }
  if (typeof document.querySelector === 'function') {
    const activeLink = document.querySelector(`nav a[data-route="${path}"]`);
    if (activeLink) {
      activeLink.classList.add('active');
    }
  }

  // Swap Chat / New Chat button depending on current page
  const navChat = document.getElementById('nav-chat');
  const navNewChat = document.getElementById('nav-new-chat');
  if (path === '/chat') {
    if (navChat) navChat.style.display = 'none';
    if (navNewChat) {
      navNewChat.style.display = '';
      // Only glow for brand-new chats (no id in URL)
      const existingId = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
      if (!existingId) navNewChat.classList.add('active');
    }
  } else {
    if (navChat) navChat.style.display = '';
    if (navNewChat) navNewChat.style.display = 'none';
  }

  // Populate sidebar with up to 6 recent chats
  await loadSidebarChats();
}

async function loadSidebarChats(activeId?: string) {
  const container = document.getElementById('sidebar-chats');
  if (!container) return;

  const token = localStorage.getItem('token');
  if (!token || token === 'undefined') {
    container.innerHTML = '';
    return;
  }

  const currentId = activeId || new URLSearchParams(location.hash.split('?')[1] || '').get('id');

  try {
    const res = await fetch('/api/conversations', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) { container.innerHTML = ''; return; }
    const conversations: { id: string; title: string; updatedAt: string }[] = await res.json();
    conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const recent = conversations.slice(0, 6);
    container.innerHTML = recent.length
      ? `<div class="sidebar-section-label">Recent</div>` + recent.map(c =>
          `<a href="#/chat?id=${encodeURIComponent(c.id)}" class="sidebar-chat-link${c.id === currentId ? ' current' : ''}" title="${c.title}"><span class="sidebar-chat-text">${c.title}</span></a>`
        ).join('')
      : '';

  } catch {
    container.innerHTML = '';
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('sidebar:refresh', (e: Event) => {
    const activeId = (e as CustomEvent).detail?.activeId;
    loadSidebarChats(activeId);
  });

  // Global theme applicator — called from account page and on load
  (window as any).__applyTheme = (prefs: { matrixRain?: boolean; lightMode?: boolean; font?: string; themeColor?: string }) => {
    const body = document.body;
    const canvas = document.getElementById('matrix-canvas') as HTMLCanvasElement | null;

    // Matrix rain
    if (canvas) canvas.style.display = prefs.matrixRain === false ? 'none' : '';

    // Dark background when matrix rain is off
    body.classList.toggle('no-rain', prefs.matrixRain === false);

    // Light mode
    body.classList.toggle('light-mode', prefs.lightMode === true);

    // Font
    body.classList.remove('font-sans', 'font-serif', 'font-mono');
    if (prefs.font === 'sans') body.classList.add('font-sans');
    else if (prefs.font === 'serif') body.classList.add('font-serif');
    else if (prefs.font === 'mono') body.classList.add('font-mono');

    // Theme color
    body.classList.remove('theme-blue', 'theme-purple', 'theme-amber');
    if (prefs.themeColor && prefs.themeColor !== 'green') {
      body.classList.add(`theme-${prefs.themeColor}`);
    }
    setMatrixColor(prefs.themeColor || 'green');
  };

  // Apply saved preferences immediately
  const savedPrefs = localStorage.getItem('userPreferences');
  if (savedPrefs) {
    try { (window as any).__applyTheme(JSON.parse(savedPrefs)); } catch {}
  }

  // Module scripts are deferred — DOM is fully parsed here, no need to wait for load
  startMatrixRain();

  // Re-apply after init in case canvas state needs syncing
  const sp = localStorage.getItem('userPreferences');
  if (sp) { try { (window as any).__applyTheme(JSON.parse(sp)); } catch {} }

  handleRoute();

  // Profile dropdown
  (() => {
    const btn = document.getElementById('topbar-profile');
    const dropdown = document.getElementById('profile-dropdown') as HTMLElement | null;
    const usernameEl = document.getElementById('profile-dropdown-username');
    const logoutBtn = document.getElementById('profile-dropdown-logout');
    const settingsLink = document.getElementById('profile-dropdown-settings');

    if (!btn || !dropdown) return;

    const updateUsername = () => {
      const u = localStorage.getItem('cachedUsername');
      if (usernameEl) usernameEl.textContent = u || '—';
    };
    updateUsername();

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      updateUsername();
      dropdown.style.display = dropdown.style.display === 'none' ? '' : 'none';
    });

    document.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('#profile-dropdown-wrap')) {
        dropdown.style.display = 'none';
      }
    });

    logoutBtn?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      localStorage.removeItem('token');
      localStorage.removeItem('userPreferences');
      localStorage.removeItem('userProfilePic');
      localStorage.removeItem('cachedUsername');
      window.location.hash = '#/login';
      handleRoute();
    });

    settingsLink?.addEventListener('click', () => {
      dropdown.style.display = 'none';
    });
  })();

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

  window.addEventListener('hashchange', handleRoute);
}
