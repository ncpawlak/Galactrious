import { crisp, hash, makeCanvas, shade } from '../bosses/paint';
import { insignia } from '../enemies/empirePaint';
import { EMPIRE } from '../factions';

/**
 * Imperial fortification paint (top-down). Rules: slate plating with a lighter lit edge on the top and a dark shadow band on the
 * bottom (light from the upper left, like every layer in the game), a bronze trim band with rivets, crenellated top edge, the red
 * nested-chevron insignia, orange lights, and angular chamfered ends. Two layers per structure: the PLATING (outer) and the
 * RUBBLE under it (dark deck with a few embers), so a carved hole shows the rubble and then the ground.
 */

const K = EMPIRE;

export interface PaintedStructure {
  plating: HTMLCanvasElement;
  rubble: HTMLCanvasElement;
}

const cache = new Map<string, PaintedStructure>();

/** Remove the corners of a canvas (angular chamfer) so the ends of a wall read as built, not as a clipped slab. */
function chamfer(ctx: CanvasRenderingContext2D, w: number, h: number, left: boolean, right: boolean, c: number): void {
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  const tri = (pts: [number, number][]): void => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fill();
  };
  if (left) {
    tri([[0, 0], [c, 0], [0, c]]);
    tri([[0, h], [c, h], [0, h - c]]);
  }
  if (right) {
    tri([[w, 0], [w - c, 0], [w, c]]);
    tri([[w, h], [w - c, h], [w, h - c]]);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** The rubble layer: the same footprint as the plating, a dark deck with scattered embers and cracks. */
function rubbleFor(plating: HTMLCanvasElement, seed: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(plating.width, plating.height);
  ctx.fillStyle = '#34303a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const r = hash(x + seed * 13, y + seed * 7);
      if (r > 0.965) {
        ctx.fillStyle = '#7a3a1c'; // ember
        ctx.fillRect(x, y, 1, 1);
      } else if (r < 0.1) {
        ctx.fillStyle = '#25222c';
        ctx.fillRect(x, y, 2, 1);
      } else if (r > 0.9) {
        ctx.fillStyle = '#4d4654';
        ctx.fillRect(x, y, 1, 2);
      }
    }
  }
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(plating, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  shade(ctx, { noise: 0.1, edge: 0.8 });
  return canvas;
}

/** A wall segment `w` x `h` px; `turretXs` are the x positions of the turret mounts (the insignia keeps clear of them). */
export function paintWall(w: number, h: number, capL: boolean, capR: boolean, turretXs: number[], variant: number): PaintedStructure {
  const key = `wall|${w}|${h}|${capL}|${capR}|${turretXs.join(',')}|${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = K.armour;
  ctx.fillRect(0, 0, w, h);
  // Lit top edge and dark bottom band.
  ctx.fillStyle = K.armourLight;
  ctx.fillRect(0, 0, w, 3);
  ctx.fillStyle = K.armourDark;
  ctx.fillRect(0, h - 6, w, 6);
  // Crenellations along the top: alternating raised (light) and sunken (dark) blocks.
  const step = 14;
  for (let x = 2 + (variant % 3) * 2; x < w - 4; x += step) {
    ctx.fillStyle = K.armourLight;
    ctx.fillRect(x, 3, 9, 5);
    ctx.fillStyle = K.armourDark;
    ctx.fillRect(x + 9, 3, step - 9, 5);
  }
  // Bronze trim band with rivets.
  const my = Math.round(h / 2) - 3;
  ctx.fillStyle = K.hull;
  ctx.fillRect(0, my, w, 6);
  ctx.fillStyle = '#a07a5e';
  ctx.fillRect(0, my, w, 1);
  ctx.fillStyle = '#4e382c';
  ctx.fillRect(0, my + 5, w, 1);
  for (let x = 5; x < w - 3; x += 10) {
    ctx.fillStyle = '#c29a78';
    ctx.fillRect(x, my + 2, 2, 2);
  }
  // Panel seams.
  for (let x = 32 + variant * 5; x < w - 6; x += 38) {
    ctx.fillStyle = K.armourDark;
    ctx.fillRect(x, 8, 1, my - 8);
    ctx.fillRect(x, my + 6, 1, h - my - 12);
  }
  // Insignia on the panels (kept clear of turret mounts), orange lights on the bottom band.
  for (let cx = 44 + variant * 9; cx < w - 24; cx += 92) {
    if (turretXs.some((t) => Math.abs(t - cx) < 22)) continue;
    insignia(ctx, K, cx, h - 17, 10, 1);
  }
  for (let x = 24 + variant * 3; x < w - 8; x += 38) {
    ctx.fillStyle = K.glow;
    ctx.fillRect(x, h - 4, 3, 2);
  }
  // End caps: bronze pillars with a red lamp.
  for (const [on, x0] of [[capL, 0], [capR, w - 12]] as const) {
    if (!on) continue;
    ctx.fillStyle = K.hull;
    ctx.fillRect(x0, 0, 12, h);
    ctx.fillStyle = '#4e382c';
    ctx.fillRect(x0 + (x0 === 0 ? 11 : 0), 0, 1, h);
    ctx.fillStyle = K.accent;
    ctx.fillRect(x0 + 4, 6, 4, 4);
    ctx.fillStyle = K.glow;
    ctx.fillRect(x0 + 5, 7, 2, 2);
  }
  chamfer(ctx, w, h, capL, capR, 7);
  crisp(ctx);
  shade(ctx, { noise: 0.13, edge: 0.7 });
  const out = { plating: canvas, rubble: rubbleFor(canvas, variant) };
  cache.set(key, out);
  return out;
}

/** A free-standing bunker pad (`square` = the heavier mortar pit), `size` px across. The turret sits in the middle. */
export function paintPad(size: number, square: boolean, variant: number): PaintedStructure {
  const key = `pad|${size}|${square}|${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const oct = (r: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    const k = r * 0.42;
    ctx.moveTo(c - r + k, c - r);
    ctx.lineTo(c + r - k, c - r);
    ctx.lineTo(c + r, c - r + k);
    ctx.lineTo(c + r, c + r - k);
    ctx.lineTo(c + r - k, c + r);
    ctx.lineTo(c - r + k, c + r);
    ctx.lineTo(c - r, c + r - k);
    ctx.lineTo(c - r, c - r + k);
    ctx.closePath();
    ctx.fill();
  };
  if (square) {
    ctx.fillStyle = K.armourDark;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = K.armour;
    ctx.fillRect(3, 3, size - 6, size - 6);
    ctx.fillStyle = K.armourLight;
    ctx.fillRect(3, 3, size - 6, 2);
    ctx.fillRect(3, 3, 2, size - 6);
    // Corner pillars.
    for (const [x, y] of [[0, 0], [size - 14, 0], [0, size - 14], [size - 14, size - 14]]) {
      ctx.fillStyle = K.hull;
      ctx.fillRect(x, y, 14, 14);
      ctx.fillStyle = K.accent;
      ctx.fillRect(x + 5, y + 5, 4, 4);
      ctx.fillStyle = K.glow;
      ctx.fillRect(x + 6, y + 6, 2, 2);
    }
    // The pit: a dark ring around the mortar.
    ctx.fillStyle = K.armourDark;
    ctx.beginPath();
    ctx.arc(c, c, size * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3d4256';
    ctx.beginPath();
    ctx.arc(c, c, size * 0.24, 0, Math.PI * 2);
    ctx.fill();
  } else {
    oct(c, K.armourDark);
    oct(c - 3, K.armour);
    ctx.fillStyle = K.armourLight;
    ctx.fillRect(Math.round(c * 0.5), 3, Math.round(c), 2);
    // Bronze ring and mount.
    ctx.strokeStyle = K.hull;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(c, c, size * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#3d4256';
    ctx.beginPath();
    ctx.arc(c, c, size * 0.24, 0, Math.PI * 2);
    ctx.fill();
    for (const [x, y] of [[c - 3, 4], [c - 3, size - 8], [4, c - 3], [size - 8, c - 3]]) {
      ctx.fillStyle = K.glow;
      ctx.fillRect(x, y, 5, 3);
    }
    insignia(ctx, K, c, size - 15, 9, 1);
  }
  crisp(ctx);
  shade(ctx, { noise: 0.13, edge: 0.7 });
  const out = { plating: canvas, rubble: rubbleFor(canvas, variant + 40) };
  cache.set(key, out);
  return out;
}
