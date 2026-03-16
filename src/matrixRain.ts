const CHARACTERS = "アカサタナハマヤラワ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function startMatrixRain(canvasId = 'matrix-canvas') {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const fontSize = 18;
  let width = window.innerWidth;
  let height = window.innerHeight;

  let columns = Math.floor(width / fontSize);
  const drops: { y: number; chars: string[] }[] = Array.from({ length: columns }, () => ({ y: 0, chars: [] }));

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    columns = Math.floor(width / fontSize);
    drops.length = columns;
    drops.forEach(drop => {
      drop.y = 0;
      drop.chars = [];
    });
  };

  window.addEventListener('resize', resize);
  resize();

  const draw = () => {
    // fade previously drawn characters to create trailing effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(0, 0, width, height);

    ctx.font = `${fontSize}px "Matrix Code NFI", monospace`;
    ctx.textBaseline = 'top';

    for (let i = 0; i < columns; i++) {
      const x = i * fontSize;
      const drop = drops[i];
      const y = drop.y * fontSize;

      // generate new character for the head
      const char = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];

      // draw the trail below the head using previous characters
      const trailSteps = 5;
      for (let t = 1; t <= trailSteps && drop.chars.length - t >= 0; t++) {
        const trailY = y + t * fontSize;
        if (trailY > height) break;
        const alpha = Math.max(0, 0.6 * (1 - t / (trailSteps + 1)));
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha.toFixed(3)})`;
        ctx.fillText(drop.chars[drop.chars.length - t], x, trailY);
      }

      // draw the bright head
      ctx.fillStyle = 'rgba(1, 117, 20, 0.9)';
      ctx.fillText(char, x, y);

      // update the drop's characters
      drop.chars.push(char);
      if (drop.chars.length > trailSteps + 1) {
        drop.chars.shift();
      }
      drop.y += 1;

      if (drop.y * fontSize > height && Math.random() > 0.975) {
        drop.y = 0;
        drop.chars = [];
      }
    }

    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);
}
