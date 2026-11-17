import { H, W } from '../../config';
import { makeCanvas } from '../../bosses/paint';
import { mulberry32 } from '../obstacles';
import type { CustomBackgroundLayer, ScrollTheme } from '../types';
import { TAU, TH, airLayer, blob, jaggedPoly, shadowLayer, tileLayer, wrapped, type Light } from './surface';

/**
 * Backgrounds for "Fallen Peace" chapters 4 and 5 (owner playtest pass), all top-down, all painted tiles like `surface`:
 *   - `tundraNight` (chapter 4 part 1): the approach over snow paths and tundra at night: dark snow, a packed-snow path, tundra tufts,
 *     rocks and a few snowy pines, dim and quiet so searchlights and cover read.
 *   - `baseInterior` (chapter 4 part 2): inside the military compound at night: concrete apron with expansion joints, yellow lane lines,
 *     hazard bands, painted arrows and bay numbers, oil stains, drains and pools of light from lamp posts.
 *   - `surfaceBase` (chapter 5 section 1): the same compound in daylight (it is the same place, the ship has just left the hangar).
 *   - `surfaceWild` (chapter 5 section 3): wilderness past the fences: snow and tundra, rocks, many pines, a frozen stream.
 * Section 2 of chapter 5 keeps the original `surface` theme (roads, installations, ridges).
 */

interface Pal {
  base: string;
  tones: string[];
  /** Soft dark shade used for drop shadows (rgba). */
  shade: string;
  night: boolean;
}

const NIGHT_SNOW: Pal = { base: '#2b3d58', tones: ['#25364f', '#31455f', '#38506c', '#22314a'], shade: 'rgba(0,4,12,0.4)', night: true };
const DAY_SNOW: Pal = { base: '#e4edf3', tones: ['#d3e3ef', '#eef4f8', '#c8dcec', '#f6f9fb', '#dbe6ee'], shade: 'rgba(70,90,115,0.3)', night: false };
const NIGHT_CONCRETE: Pal = { base: '#343f50', tones: ['#2d3747', '#3b4658', '#414d60', '#2a3342'], shade: 'rgba(0,3,10,0.45)', night: true };
const DAY_CONCRETE: Pal = { base: '#a3adb9', tones: ['#9aa5b2', '#adb7c2', '#b4bdc8', '#97a1ae'], shade: 'rgba(55,70,90,0.35)', night: false };

type Ctx = CanvasRenderingContext2D;

/** A pine seen from above: a dark star of boughs with a snow dusting and a shadow thrown down-right. */
function pine(ctx: Ctx, x: number, y: number, r: number, pal: Pal, rnd: () => number): void {
  ctx.fillStyle = pal.shade;
  ctx.beginPath();
  ctx.ellipse(x + r * 0.5, y + r * 0.6, r * 0.9, r * 0.7, 0.4, 0, TAU);
  ctx.fill();
  const g1 = pal.night ? '#0d1d1c' : '#2c5a3f';
  const g2 = pal.night ? '#14302b' : '#3d7550';
  for (const [k, c] of [[1, g1], [0.72, g2]] as const) {
    ctx.fillStyle = c;
    ctx.beginPath();
    const spikes = 9;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * TAU + rnd() * 0.08;
      const rr = (i % 2 === 0 ? r : r * 0.55) * k;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = pal.night ? 'rgba(150,175,205,0.55)' : 'rgba(250,253,255,0.85)';
  ctx.beginPath();
  ctx.arc(x - r * 0.15, y - r * 0.15, r * 0.3, 0, TAU);
  ctx.fill();
}

function rock(ctx: Ctx, x: number, y: number, r: number, pal: Pal, seed: number): void {
  ctx.fillStyle = pal.shade;
  jaggedPoly(ctx, x + 3, y + 4, r, mulberry32(seed), 8, 0.8);
  ctx.fill();
  ctx.fillStyle = pal.night ? '#3c4658' : '#8c867f';
  jaggedPoly(ctx, x, y, r, mulberry32(seed), 8, 0.8);
  ctx.fill();
  ctx.fillStyle = pal.night ? '#8195b3' : '#f1f5f8';
  jaggedPoly(ctx, x - 2, y - 3, r * 0.5, mulberry32(seed + 1), 6, 0.7);
  ctx.fill();
}

/** Snow with drifts, ripples, tundra patches, rocks and pines. `trees` = pine count, `path` draws a packed-snow track, `stream` a frozen stream. */
function paintTundra(pal: Pal, opts: { trees: number; path: boolean; stream: boolean; seed: number }): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(W, TH);
  const rnd = mulberry32(opts.seed);
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, W, TH);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W;
    const y = rnd() * TH;
    const rx = 30 + rnd() * 90;
    const ry = 18 + rnd() * 60;
    const c = pal.tones[Math.floor(rnd() * pal.tones.length)];
    const rot = (rnd() - 0.5) * 0.7;
    wrapped(ctx, y, ry, (dy) => blob(ctx, x, y + dy, rx, ry, c, 0.4, rot));
  }
  ctx.globalAlpha = 1;
  // Tundra: dull brown-green patches showing through the snow, with tufts of dry grass.
  const tun = pal.night ? ['#3a4f3e', '#47593b', '#3b4038'] : ['#8a8a62', '#9a9368', '#7b8560'];
  for (let i = 0; i < 38; i++) {
    const x = rnd() * W;
    const y = rnd() * TH;
    const rx = 24 + rnd() * 60;
    const ry = 14 + rnd() * 34;
    const c = tun[i % 3];
    wrapped(ctx, y, ry, (dy) => {
      blob(ctx, x, y + dy, rx, ry, c, 0.8, (rnd() - 0.5) * 0.8);
      ctx.strokeStyle = pal.night ? 'rgba(90,110,80,0.6)' : 'rgba(120,115,70,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < 14; k++) {
        const tx = x + (rnd() - 0.5) * rx * 1.6;
        const ty = y + dy + (rnd() - 0.5) * ry * 1.5;
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + (rnd() - 0.5) * 4, ty - 4 - rnd() * 4);
      }
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
  // Ripples (sastrugi).
  for (let i = 0; i < 160; i++) {
    const x = rnd() * W;
    const y = rnd() * TH;
    const len = 14 + rnd() * 36;
    ctx.strokeStyle = pal.night ? (rnd() > 0.5 ? 'rgba(130,155,190,0.28)' : 'rgba(0,5,14,0.3)') : rnd() > 0.5 ? 'rgba(255,255,255,0.7)' : 'rgba(150,175,200,0.35)';
    ctx.lineWidth = 1;
    wrapped(ctx, y, 20, (dy) => {
      ctx.beginPath();
      ctx.moveTo(x, y + dy);
      ctx.quadraticCurveTo(x + len / 2, y + dy - 3, x + len, y + dy + 2);
      ctx.stroke();
    });
  }
  const roadX = (y: number, x0: number, amp: number, ph: number): number => x0 + amp * Math.sin((y / TH) * TAU + ph) + amp * 0.3 * Math.sin((y / TH) * TAU * 3 + ph * 2);
  if (opts.stream) {
    // A frozen stream: pale blue ice ribbon with a bright crack line and snowy banks.
    for (const [lw, col] of [[34, pal.night ? '#2b3c55' : '#eef5fa'], [24, pal.night ? '#41607f' : '#a9c8de'], [10, pal.night ? '#5d84a6' : '#cfe4f2']] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let y = -10; y <= TH + 10; y += 8) (y === -10 ? ctx.moveTo : ctx.lineTo).call(ctx, roadX(y, 400, 46, 1.2), y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = -10; y <= TH + 10; y += 8) (y === -10 ? ctx.moveTo : ctx.lineTo).call(ctx, roadX(y, 404, 46, 1.2) - 3, y);
    ctx.stroke();
  }
  if (opts.path) {
    // The snow path: a packed, slightly darker and smoother band with two rutted tracks and the odd bootprint.
    ctx.lineCap = 'round';
    ctx.strokeStyle = pal.night ? 'rgba(8,14,24,0.45)' : 'rgba(110,135,160,0.4)';
    ctx.lineWidth = 62;
    ctx.beginPath();
    for (let y = -10; y <= TH + 10; y += 8) (y === -10 ? ctx.moveTo : ctx.lineTo).call(ctx, roadX(y, 190, 70, 0.4), y);
    ctx.stroke();
    ctx.strokeStyle = pal.night ? '#4d6283' : '#cfdce8';
    ctx.lineWidth = 50;
    ctx.beginPath();
    for (let y = -10; y <= TH + 10; y += 8) (y === -10 ? ctx.moveTo : ctx.lineTo).call(ctx, roadX(y, 190, 70, 0.4), y);
    ctx.stroke();
    for (const off of [-11, 11]) {
      ctx.strokeStyle = pal.night ? 'rgba(10,18,30,0.65)' : 'rgba(100,125,150,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let y = -10; y <= TH + 10; y += 8) (y === -10 ? ctx.moveTo : ctx.lineTo).call(ctx, roadX(y, 190, 70, 0.4) + off, y);
      ctx.stroke();
    }
    for (let y = 8; y < TH; y += 26) {
      ctx.fillStyle = pal.night ? 'rgba(10,18,30,0.5)' : 'rgba(110,130,155,0.5)';
      const px = roadX(y, 190, 70, 0.4) + (y % 52 === 8 ? -4 : 4);
      ctx.beginPath();
      ctx.ellipse(px, y, 2.4, 4, 0, 0, TAU);
      ctx.fill();
    }
    ctx.lineCap = 'butt';
  }
  for (let i = 0; i < 28; i++) {
    const x = rnd() * W;
    const y = rnd() * TH;
    const r = 6 + rnd() * 15;
    wrapped(ctx, y, r + 6, (dy) => rock(ctx, x, y + dy, r, pal, i * 17 + 3));
  }
  for (let i = 0; i < opts.trees; i++) {
    const x = rnd() * W;
    const y = rnd() * TH;
    const r = 13 + rnd() * 14;
    wrapped(ctx, y, r + 6, (dy) => pine(ctx, x, y + dy, r, pal, rnd));
  }
  ctx.globalAlpha = 1;
  return canvas;
}

/** A painted floor arrow. */
function arrow(ctx: Ctx, x: number, y: number, s: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - 18 * s);
  ctx.lineTo(x + 14 * s, y);
  ctx.lineTo(x + 5 * s, y);
  ctx.lineTo(x + 5 * s, y + 22 * s);
  ctx.lineTo(x - 5 * s, y + 22 * s);
  ctx.lineTo(x - 5 * s, y);
  ctx.lineTo(x - 14 * s, y);
  ctx.closePath();
  ctx.fill();
}

/** The compound floor: concrete slabs with joints, lane lines, hazard bands, arrows, bay numbers, stains, drains and (at night) light pools. */
function paintConcrete(pal: Pal, lights: Light[], seed: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(W, TH);
  const rnd = mulberry32(seed);
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, W, TH);
  for (let i = 0; i < 160; i++) {
    const x = rnd() * W;
    const y = rnd() * TH;
    const c = pal.tones[Math.floor(rnd() * pal.tones.length)];
    const rx = 40 + rnd() * 90;
    const ry = 30 + rnd() * 70;
    wrapped(ctx, y, ry, (dy) => blob(ctx, x, y + dy, rx, ry, c, 0.45, rnd()));
  }
  ctx.globalAlpha = 1;
  // Expansion joints: a 180 x 160 slab grid (160 divides the tile height).
  ctx.strokeStyle = pal.night ? 'rgba(0,4,12,0.55)' : 'rgba(60,72,90,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 180) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, TH);
  }
  for (let y = 0; y <= TH; y += 160) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
  ctx.strokeStyle = pal.night ? 'rgba(120,140,170,0.1)' : 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 2; x <= W; x += 180) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, TH);
  }
  for (let y = 2; y <= TH; y += 160) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
  // Hairline cracks and tyre scuffs.
  for (let i = 0; i < 40; i++) {
    const x = rnd() * W;
    const y = rnd() * TH;
    ctx.strokeStyle = pal.night ? 'rgba(0,4,12,0.4)' : 'rgba(50,60,75,0.35)';
    wrapped(ctx, y, 40, (dy) => {
      ctx.beginPath();
      ctx.moveTo(x, y + dy);
      ctx.lineTo(x + 10 + rnd() * 20, y + dy + 8 + rnd() * 12);
      ctx.lineTo(x + 24 + rnd() * 20, y + dy + 14 + rnd() * 22);
      ctx.stroke();
    });
  }
  const yellow = pal.night ? '#a98a2e' : '#e6c040';
  const white = pal.night ? '#8f9bb0' : '#f2f5f8';
  // Lane lines: a yellow dashed centre line down the apron, white edge lines.
  ctx.strokeStyle = yellow;
  ctx.lineWidth = 5;
  ctx.setLineDash([46, 34]);
  ctx.beginPath();
  ctx.moveTo(270, 0);
  ctx.lineTo(270, TH);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = white;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const x of [58, 482]) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, TH);
  }
  ctx.stroke();
  // Hazard bands (yellow and black diagonals) across the apron every 640 px, and bay numbers in the lanes between.
  for (const by of [150, 790]) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, by, W, 22);
    ctx.clip();
    ctx.fillStyle = pal.night ? '#161b24' : '#2d3440';
    ctx.fillRect(0, by, W, 22);
    ctx.strokeStyle = yellow;
    ctx.lineWidth = 11;
    ctx.beginPath();
    for (let k = -30; k < W + 30; k += 28) {
      ctx.moveTo(k, by + 22);
      ctx.lineTo(k + 22, by);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = white;
  ctx.font = 'bold 54px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = pal.night ? 0.55 : 0.85;
  for (const [n, nx, ny] of [['07', 150, 330], ['12', 400, 600], ['03', 130, 980], ['09', 410, 1160]] as const) ctx.fillText(n, nx, ny);
  ctx.globalAlpha = 1;
  for (const [ax, ay] of [[150, 440], [400, 700], [140, 1080], [400, 40]]) arrow(ctx, ax, ay, 1.4, pal.night ? 'rgba(150,160,180,0.5)' : 'rgba(245,247,250,0.9)');
  // Oil stains, drains and bollards.
  for (let i = 0; i < 20; i++) {
    const x = rnd() * W;
    const y = rnd() * TH;
    wrapped(ctx, y, 30, (dy) => blob(ctx, x, y + dy, 8 + rnd() * 20, 5 + rnd() * 12, pal.night ? '#0a0f18' : '#4a5260', 0.35, rnd() * 3));
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 9; i++) {
    const x = 40 + rnd() * (W - 80);
    const y = rnd() * TH;
    wrapped(ctx, y, 10, (dy) => {
      ctx.fillStyle = pal.night ? '#0d121b' : '#586272';
      ctx.fillRect(x - 12, y + dy - 6, 24, 12);
      ctx.strokeStyle = pal.night ? '#3a4558' : '#8793a5';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = -9; k <= 9; k += 6) {
        ctx.moveTo(x + k, y + dy - 5);
        ctx.lineTo(x + k, y + dy + 5);
      }
      ctx.stroke();
    });
  }
  // Lamp posts: a post, a pool of light on the floor at night, a blink-free glow dot.
  for (let i = 0; i < 12; i++) {
    const x = i % 2 === 0 ? 24 + rnd() * 26 : W - 24 - rnd() * 26;
    const y = (i / 12) * TH + rnd() * 60;
    wrapped(ctx, y, 90, (dy) => {
      if (pal.night) {
        const grad = ctx.createRadialGradient(x, y + dy, 0, x, y + dy, 90);
        grad.addColorStop(0, 'rgba(255,214,140,0.2)');
        grad.addColorStop(1, 'rgba(255,214,140,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - 90, y + dy - 90, 180, 180);
      }
      ctx.fillStyle = pal.night ? '#5b6678' : '#4e5766';
      ctx.beginPath();
      ctx.arc(x, y + dy, 4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffd89a';
      ctx.beginPath();
      ctx.arc(x, y + dy, 2, 0, TAU);
      ctx.fill();
    });
    lights.push({ x, y, phase: rnd() * TAU, rate: 0.6 + rnd() * 0.8, color: '#ffd89a' });
  }
  ctx.globalAlpha = 1;
  return canvas;
}

/** Tall base features for the daylight compound: floodlight masts and antenna towers with long shadows (no ridges: it is a compound). */
function paintBaseTall(lights: Light[]): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(W, TH);
  const rnd = mulberry32(2024);
  for (let i = 0; i < 9; i++) {
    const x = i % 2 === 0 ? 14 + rnd() * 40 : W - 14 - rnd() * 40;
    const y = (i / 9) * TH + rnd() * 80;
    wrapped(ctx, y, 60, (dy) => {
      ctx.strokeStyle = 'rgba(55,75,100,0.32)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + dy + 2);
      ctx.lineTo(x + 36, y + dy + 58);
      ctx.stroke();
      ctx.fillStyle = '#7d8898';
      ctx.fillRect(x - 6, y + dy - 6, 12, 12);
      ctx.fillStyle = '#b5c0cd';
      ctx.fillRect(x - 6, y + dy - 6, 12, 2);
      ctx.fillStyle = '#4e5766';
      ctx.fillRect(x - 2, y + dy - 2, 4, 4);
    });
    lights.push({ x, y, phase: rnd() * TAU, rate: 1.2 + rnd(), color: '#ff7a3d' });
  }
  ctx.globalAlpha = 1;
  return canvas;
}

/** A dim blue-black vignette-free dark wash used by the night themes so the ground sits behind the lights. */
function dimLayer(alpha: number): () => CustomBackgroundLayer {
  return () => ({
    draw(ctx, _d, _s, _t, a) {
      ctx.globalAlpha = a * alpha;
      ctx.fillStyle = '#02050c';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    },
  });
}

/** Chapter 4 part 1: snow paths and tundra at night. */
export const TUNDRA_NIGHT: ScrollTheme = {
  id: 'tundraNight',
  sky: ['#06090f', '#0a101a', '#0e1624'],
  layers: [
    { type: 'custom', make: tileLayer(() => paintTundra(NIGHT_SNOW, { trees: 14, path: true, stream: false, seed: 4041 }), 1) },
    { type: 'custom', make: dimLayer(0.1) },
    { type: 'snow', speed: 0.5, count: 40, drift: 10, color: '#6f86a8' },
    { type: 'snow', speed: 1.1, count: 26, drift: 18, color: '#8aa0c0' },
  ],
};

/** Chapter 4 part 2: inside the military compound at night. */
export const BASE_INTERIOR: ScrollTheme = {
  id: 'baseInterior',
  sky: ['#06090f', '#0a101a', '#0e1624'],
  layers: [
    { type: 'custom', make: tileLayer((l) => paintConcrete(NIGHT_CONCRETE, l, 4242), 1) },
    { type: 'custom', make: dimLayer(0.06) },
    { type: 'snow', speed: 1.1, count: 14, drift: 18, color: '#8aa0c0' },
  ],
};

/** Chapter 5 section 1: the same compound in daylight (stock shadows, haze and snow on top). */
export const SURFACE_BASE: ScrollTheme = {
  id: 'surfaceBase',
  sky: ['#dfe9f1', '#e6eef4', '#edf3f7'],
  layers: [
    { type: 'custom', make: tileLayer((l) => paintConcrete(DAY_CONCRETE, l, 4343), 1) },
    { type: 'custom', make: shadowLayer },
    { type: 'custom', make: tileLayer(paintBaseTall, 1.14) },
    { type: 'custom', make: airLayer },
    { type: 'snow', speed: 1.4, count: 30, drift: 18, color: '#ffffff', weather: [0.4, 1] },
  ],
};

/** Chapter 5 section 3: wilderness: snow and tundra, rocks, pines and a frozen stream. */
export const SURFACE_WILD: ScrollTheme = {
  id: 'surfaceWild',
  sky: ['#dfe9f1', '#e6eef4', '#edf3f7'],
  layers: [
    { type: 'custom', make: tileLayer(() => paintTundra(DAY_SNOW, { trees: 70, path: false, stream: true, seed: 4444 }), 1) },
    { type: 'custom', make: shadowLayer },
    { type: 'custom', make: airLayer },
    { type: 'snow', speed: 1.4, count: 40, drift: 18, color: '#ffffff', weather: [0.4, 1] },
  ],
};
