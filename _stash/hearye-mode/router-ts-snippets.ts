// ── HEARYE MODE STASH ──
// Extracted from src/router.ts
// Re-integrate by adding these pieces back.

// ── Import: add setMatrixLightMode to the matrixRain import ──
import { startMatrixRain, setMatrixColor, setMatrixLightMode } from './lib/matrixRain.ts';

// ── __applyTheme: add hearye to the prefs type and body class toggle ──
(window as any).__applyTheme = (prefs: { matrixRain?: boolean; lightMode?: boolean; hearye?: boolean; font?: string; themeColor?: string }) => {
  // ...existing code...

  // Light mode
  body.classList.toggle('light-mode', prefs.lightMode === true);
  body.classList.toggle('hearye-mode', prefs.hearye === true);   // <-- add this line

  // ...existing code...

  setMatrixLightMode(prefs.hearye === true);   // <-- add this line (replaces setMatrixLightMode(false))
};
