const CHARACTERS = "アカサタナハマヤラワ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const THEME_COLORS: Record<string, [number, number, number]> = {
  green:  [1, 117, 20],
  blue:   [68, 136, 255],
  purple: [187, 102, 255],
  amber:  [255, 170, 0],
};

let currentColor: [number, number, number] = THEME_COLORS.green;
let fadeColor: [number, number, number] = [0, 0, 0];

export function setMatrixColor(theme: string) {
  currentColor = THEME_COLORS[theme] || THEME_COLORS.green;
}

export function setMatrixLightMode(isLight: boolean) {
  fadeColor = isLight ? [237, 232, 208] : [0, 0, 0];
}

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
  let drops: { y: number; chars: string[] }[] = createDrops(columns);

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    columns = Math.floor(width / fontSize);
    drops = createDrops(columns);
    // Fill immediately so there's no transparent/grey flash on load or resize
    ctx.fillStyle = `rgb(${fadeColor[0]}, ${fadeColor[1]}, ${fadeColor[2]})`;
    ctx.fillRect(0, 0, width, height);
  };

  window.addEventListener('resize', resize);
  resize();

  const SPEED = 8; // rows per second — change this to adjust speed
  const REMAIN_AFTER_1S = 0.2; // brightness remaining after 1 second (lower = faster fade)
  let lastTime = 0;

  const draw = (timestamp: number) => {
    const delta = lastTime === 0 ? 16 : timestamp - lastTime;
    lastTime = timestamp;

    const advance = (delta / 1000) * SPEED;

    // exponential decay normalised to elapsed time — consistent across all frame rates
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

      // only push a new character when the drop crosses into a new row
      if (currentRow > prevRow) {
        const char = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
        drop.chars.push(char);
        if (drop.chars.length > trailSteps + 1) {
          drop.chars.shift();
        }
      }

      if (drop.chars.length === 0) continue;

      const y = currentRow * fontSize;

      // draw trail
      for (let t = 1; t <= trailSteps && drop.chars.length - t >= 0; t++) {
        const trailY = y - t * fontSize;
        if (trailY < 0) break;
        const alpha = Math.max(0, 0.6 * (1 - t / (trailSteps + 1)));
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha.toFixed(3)})`;
        ctx.fillText(drop.chars[drop.chars.length - t], x, trailY);
      }

      // clear the head cell before drawing so it overwrites any previous trail
      ctx.fillStyle = `rgb(${fadeColor[0]}, ${fadeColor[1]}, ${fadeColor[2]})`;
      ctx.fillRect(x, y, fontSize, fontSize);

      // draw the bright head
      ctx.fillStyle = `rgba(${currentColor[0]}, ${currentColor[1]}, ${currentColor[2]}, 0.9)`;
      ctx.fillText(drop.chars[drop.chars.length - 1], x, y);

      if (drop.y * fontSize > height && Math.random() > 0.975) {
        drop.y = -1;
        drop.chars = [];
      }
    }

    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);
}
