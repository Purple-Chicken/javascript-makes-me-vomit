const CHARACTERS = "アカサタナハマヤラワ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const WORDS = [
  "amber","antiquity","archive","autumn","axiom","azure",
  "baroque","beacon","billow","bower","bramble","brine",
  "canopy","cipher","cinder","cobalt","compass","copper",
  "dagger","dapple","dusk","echo","ember","epoch",
  "fallow","fennel","fern","filament","flint","fog",
  "garnet","gilded","gloom","glyph","gossamer","granite",
  "harbour","haze","herald","hollow","hourglass","husk",
  "ibis","idol","ink","inlet","iron","ivory",
  "jasper","journal","juniper","keen","kelp","kindle",
  "lacquer","lantern","larch","lattice","ledger","linen",
  "manor","marble","marsh","mast","meridian","mire",
  "nave","nebula","nimbus","nocturne","nomad","notion",
  "oak","obsidian","ochre","omen","onyx","opus",
  "parchment","patina","peat","pewter","pilgrim","pivot",
  "quartz","quill","raven","realm","reed","relic",
  "rune","rust","sage","salt","sandstone","shard",
  "signal","silhouette","slate","smoke","sol","soot",
  "sorrow","spire","stone","storm","sundial","sway",
  "tallow","thorn","tide","timber","tome","tower",
  "umber","vale","vault","veil","vessel","vigil",
  "wax","weld","wick","willow","wither","wraith",
  "yarn","yew","zeal","zenith","zephyr",
];

const THEME_COLORS: Record<string, [number, number, number]> = {
  green:  [1, 117, 20],
  blue:   [68, 136, 255],
  purple: [187, 102, 255],
  amber:  [255, 170, 0],
};

let currentColor: [number, number, number] = THEME_COLORS.green;
let fadeColor: [number, number, number] = [0, 0, 0];
let isLightMode = false;

export function setMatrixColor(theme: string) {
  currentColor = THEME_COLORS[theme] || THEME_COLORS.green;
}

export function setMatrixLightMode(light: boolean) {
  isLightMode = light;
  fadeColor = light ? [232, 224, 200] : [0, 0, 0];
  if (light) initLitScrolls();
}

// ─── Literary mode ────────────────────────────────────────────────────────────

const LIT_FONT_SIZE = 18;
const LIT_FONT = `${LIT_FONT_SIZE}px Georgia, serif`;
const MAX_SCROLLS = 50;

interface LitScroll {
  text: string;
  x: number;
  y: number;
  charsVisible: number;
  opacity: number;
  charTimer: number;
  charInterval: number; // ms per character
  delay: number;        // ms before typing starts
  delayTimer: number;
  state: 'typing' | 'hold' | 'fading';
  holdDuration: number;
  holdTimer: number;
}

let litScrolls: LitScroll[] = [];

function createScroll(width: number, height: number, ctx: CanvasRenderingContext2D, delay?: number): LitScroll {
  const text = WORDS[Math.floor(Math.random() * WORDS.length)];
  ctx.font = LIT_FONT;
  const tw = ctx.measureText(text).width;
  const xPad = 16;
  const x = xPad + Math.random() * Math.max(0, width - tw - xPad * 2);
  const y = LIT_FONT_SIZE * 2 + Math.random() * Math.max(10, height - LIT_FONT_SIZE * 4);

  return {
    text, x, y,
    charsVisible: 0,
    opacity: 0.12 + Math.random() * 0.52,
    charTimer: 0,
    charInterval: 120 + Math.random() * 180,
    delay: delay ?? (Math.random() * 2000),
    delayTimer: 0,
    state: 'typing',
    holdDuration: 2500 + Math.random() * 5000,
    holdTimer: 0,
  };
}

function initLitScrolls() {
  litScrolls = [];
}

function drawLiterary(ctx: CanvasRenderingContext2D, delta: number, width: number, height: number) {
  // Fade canvas to parchment
  const fadeAlpha = 1 - Math.pow(0.06, delta / 1000);
  ctx.fillStyle = `rgba(${fadeColor[0]}, ${fadeColor[1]}, ${fadeColor[2]}, ${fadeAlpha.toFixed(4)})`;
  ctx.fillRect(0, 0, width, height);

  ctx.font = LIT_FONT;
  ctx.textBaseline = 'middle';

  // Ensure pool is full
  while (litScrolls.length < MAX_SCROLLS) {
    const immediate = litScrolls.length < 15;
    litScrolls.push(createScroll(width, height, ctx, immediate ? Math.random() * 800 : undefined));
  }

  for (let i = litScrolls.length - 1; i >= 0; i--) {
    const s = litScrolls[i];

    if (s.state === 'typing') {
      if (s.delayTimer < s.delay) {
        s.delayTimer += delta;
      } else {
        s.charTimer += delta;
        const add = Math.floor(s.charTimer / s.charInterval);
        if (add > 0) {
          s.charTimer -= add * s.charInterval;
          s.charsVisible = Math.min(s.charsVisible + add, s.text.length);
          if (s.charsVisible >= s.text.length) {
            s.state = 'hold';
            s.holdTimer = 0;
          }
        }
      }
    } else if (s.state === 'hold') {
      s.holdTimer += delta;
      if (s.holdTimer >= s.holdDuration) {
        s.state = 'fading';
      }
    } else if (s.state === 'fading') {
      s.opacity -= delta / 3500;
      if (s.opacity <= 0) {
        litScrolls[i] = createScroll(width, height, ctx);
        continue;
      }
    }

    const visible = s.text.slice(0, s.charsVisible);
    if (!visible) continue;

    // Clear the area behind the text before drawing so scrolls don't overlap
    const textW = ctx.measureText(visible).width;
    const pad = 3;
    ctx.fillStyle = `rgba(${fadeColor[0]}, ${fadeColor[1]}, ${fadeColor[2]}, 1)`;
    ctx.fillRect(s.x - pad, s.y - LIT_FONT_SIZE / 2 - pad, textW + pad * 2, LIT_FONT_SIZE + pad * 2);

    ctx.fillStyle = `rgba(28, 16, 6, ${Math.max(0, s.opacity).toFixed(3)})`;
    ctx.fillText(visible, s.x, s.y);
  }
}

// ─── Matrix rain mode ─────────────────────────────────────────────────────────

function drawMatrix(
  ctx: CanvasRenderingContext2D,
  delta: number,
  width: number,
  height: number,
  drops: { y: number; chars: string[] }[],
  columns: number,
  fontSize: number
) {
  const SPEED = 8;
  const REMAIN_AFTER_1S = 0.2;
  const advance = (delta / 1000) * SPEED;
  const fadeAlpha = 1 - Math.pow(REMAIN_AFTER_1S, delta / 1000);

  ctx.fillStyle = `rgba(${fadeColor[0]}, ${fadeColor[1]}, ${fadeColor[2]}, ${fadeAlpha.toFixed(4)})`;
  ctx.fillRect(0, 0, width, height);

  ctx.font = `${fontSize}px "Matrix Code NFI", monospace`;
  ctx.textBaseline = 'top';

  const trailSteps = 40;

  for (let i = 0; i < columns; i++) {
    const x = i * fontSize;
    const drop = drops[i];
    const prevRow = Math.floor(drop.y);
    drop.y += advance;
    const currentRow = Math.floor(drop.y);

    if (currentRow > prevRow) {
      const char = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
      drop.chars.push(char);
      if (drop.chars.length > trailSteps + 1) drop.chars.shift();
    }

    if (drop.chars.length === 0) continue;

    const y = currentRow * fontSize;

    for (let t = 1; t <= trailSteps && drop.chars.length - t >= 0; t++) {
      const trailY = y - t * fontSize;
      if (trailY < 0) break;
      const alpha = Math.max(0, 0.6 * (1 - t / (trailSteps + 1)));
      ctx.fillStyle = `rgba(0, 0, 0, ${alpha.toFixed(3)})`;
      ctx.fillText(drop.chars[drop.chars.length - t], x, trailY);
    }

    ctx.fillStyle = `rgb(${fadeColor[0]}, ${fadeColor[1]}, ${fadeColor[2]})`;
    ctx.fillRect(x, y, fontSize, fontSize);

    ctx.fillStyle = `rgba(${currentColor[0]}, ${currentColor[1]}, ${currentColor[2]}, 0.9)`;
    ctx.fillText(drop.chars[drop.chars.length - 1], x, y);

    if (drop.y * fontSize > height && Math.random() > 0.975) {
      drop.y = -1;
      drop.chars = [];
    }
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function startMatrixRain(canvasId = 'matrix-canvas') {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const fontSize = 14;
  let width = window.innerWidth;
  let height = window.innerHeight;

  const createDrops = (count: number) =>
    Array.from({ length: count }, () => ({
      y: Math.random() * (window.innerHeight / fontSize + 1) - 1,
      chars: [] as string[]
    }));

  let columns = Math.floor(width / fontSize);
  let drops = createDrops(columns);

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    columns = Math.floor(width / fontSize);
    drops = createDrops(columns);
    ctx.fillStyle = `rgb(${fadeColor[0]}, ${fadeColor[1]}, ${fadeColor[2]})`;
    ctx.fillRect(0, 0, width, height);
    // Reset lit scrolls on resize so positions recalculate
    if (isLightMode) litScrolls = [];
  };

  window.addEventListener('resize', resize);
  resize();

  let lastTime = 0;

  const draw = (timestamp: number) => {
    const delta = lastTime === 0 ? 16 : timestamp - lastTime;
    lastTime = timestamp;

    if (isLightMode) {
      drawLiterary(ctx, delta, width, height);
    } else {
      drawMatrix(ctx, delta, width, height, drops, columns, fontSize);
    }

    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);
}
