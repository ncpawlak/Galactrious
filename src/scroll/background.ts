import { H, W } from '../config';
import { makeCanvas } from '../bosses/paint';
import { mulberry32 } from './obstacles';
import type { BackgroundLayer, CustomBackgroundLayer, ScrollTheme } from './types';

/**
 * Scrolling background as data (`ScrollTheme`): a sky gradient (optionally a second "storm" sky blended in by the weather)
 * and layers drawn back to front. Everything heavy (planet, clouds, mountains, glows, debris sprites) is painted once into
 * offscreen canvases; the per-frame work is a few `drawImage`s plus capped particle arrays drawn as batched line paths.
 *
 * Dynamic state shared by all layers lives in `ScrollBackground` (`Fx`): scroll distance and speed, the `weather` intensity
 * (0 calm to 1 violent, eased by `setWeather`), gusts, the lightning flash envelope and the camera turbulence.
 */

const TILE = 1280;
const TAU = Math.PI * 2;

export const SCROLL_THEMES: Record<string, ScrollTheme> = {
  /** Deep space above the planet Orini, whizzing past: planet limb, parallax stars that streak with speed, distant fleet. */
  space: {
    id: 'space',
    sky: ['#01020a', '#050a1d', '#0a1a3a'],
    layers: [
      { type: 'stars', speed: 0.05, count: 90, color: '#5b6a96', alpha: 0.8 },
      { type: 'fleet', rate: 0.22, maxY: 560 },
      { type: 'stars', speed: 0.14, count: 55, color: '#9fb0e0', streak: 14 },
      { type: 'planet', speed: 0.05 },
      { type: 'stars', speed: 0.38, count: 28, color: '#e6eeff', streak: 48 },
      { type: 'stars', speed: 0.95, count: 26, color: '#a8c8ff', streak: 120, alpha: 0.55 },
    ],
  },
  /** Falling through the atmosphere: roiling storm clouds, lightning, slanting ice, re-entry glow, shards, turbulence. */
  atmosphere: {
    id: 'atmosphere',
    sky: ['#1b2f66', '#3d68a8', '#8fb4dc', '#e8b88a'],
    stormSky: ['#05060e', '#10131f', '#251b22', '#42231c'],
    layers: [
      { type: 'stormClouds', speed: 0.3, count: 9, color: '#33405a', light: '#7088b0', alpha: 0.55, size: [220, 380], wobble: 14, weather: [0.35, 1] },
      { type: 'shards', count: 9, alpha: 0.5, weather: [0, 1] },
      { type: 'stormClouds', speed: 0.75, count: 8, color: '#1a2030', light: '#4a587a', alpha: 0.7, size: [200, 360], wobble: 22, weather: [0.45, 1] },
      { type: 'rain', speed: 0.5, count: 60, color: '#cfe0ff', alpha: 0.35, slant: 0.5, len: [30, 70], fall: 900, weather: [0.1, 1] },
      { type: 'stormClouds', speed: 1.5, count: 6, color: '#0b0e18', light: '#2c3552', alpha: 0.78, size: [240, 420], wobble: 30, weather: [0.2, 1] },
      { type: 'rain', speed: 1.2, count: 50, color: '#ffffff', alpha: 0.5, slant: 0.9, len: [50, 110], fall: 1400, width: 2, weather: [0.0, 1] },
      { type: 'whiteout', color: '#05060c', strength: 0.42, rate: 0.23, seed: 3, weather: [0, 1] },
      { type: 'whiteout', color: '#e8efff', strength: 0.4, rate: 0.19, seed: 9, weather: [0, 1] },
      { type: 'edgeGlow', color: '#ff5a14', base: 0.9, rate: 2.4 },
      { type: 'lightning', color: '#dce6ff' },
      { type: 'turbulence', amp: 6 },
    ],
  },
  /** Blizzard over the arctic: looming jagged peaks in the fog, gusting snow streaks, whiteouts, a cold glow. */
  arctic: {
    id: 'arctic',
    sky: ['#8aa4bd', '#b9cbda', '#e2eaf0'],
    stormSky: ['#2c3846', '#566677', '#8c9dac'],
    layers: [
      { type: 'mountains', speed: 0.1, color: '#6d8399', snow: '#e8f0f6', alpha: 0.6, count: 4, height: [300, 520], weather: [1, 0.55] },
      { type: 'stormClouds', speed: 0.2, count: 7, color: '#c9d6e2', light: '#eef3f8', alpha: 0.5, size: [220, 360], wobble: 8, weather: [0.3, 0.9] },
      { type: 'mountains', speed: 0.25, color: '#465a70', snow: '#ffffff', alpha: 0.85, count: 4, height: [240, 420], weather: [1, 0.6] },
      { type: 'stormClouds', speed: 0.5, count: 6, color: '#dde6ee', light: '#ffffff', alpha: 0.55, size: [200, 340], wobble: 14, weather: [0.2, 1] },
      { type: 'rain', speed: 0.6, count: 55, color: '#ffffff', alpha: 0.65, slant: 1.1, len: [18, 38], fall: 380, width: 2, weather: [0.35, 1] },
      { type: 'rain', speed: 1.1, count: 45, color: '#ffffff', alpha: 0.85, slant: 1.7, len: [40, 90], fall: 520, width: 2, weather: [0.2, 1] },
      { type: 'whiteout', color: '#f2f7fb', strength: 0.5, rate: 0.27, seed: 5, weather: [0.15, 1] },
      { type: 'edgeGlow', color: '#9fd0ff', base: 0.55, rate: 0.7 },
      { type: 'turbulence', amp: 2.5 },
    ],
  },
};

export function themeById(id: string): ScrollTheme {
  const t = SCROLL_THEMES[id];
  if (!t) throw new Error(`unknown scroll theme "${id}" (known: ${Object.keys(SCROLL_THEMES).join(', ')})`);
  return t;
}

// --- shared state ----------------------------------------------------------------------------------------------

/** Per-frame dynamic state every layer reads. */
interface Fx {
  dist: number;
  time: number;
  /** Scroll speed, px/s. */
  speed: number;
  /** 0 at a standstill, about 1 at 500 px/s: drives the speed streaks. */
  sp: number;
  weather: number;
  /** 0..1 wind gustiness. */
  gust: number;
  /** Lightning flash 0..1 (soft envelope), afterglow 0..1, which bolt and where. */
  flash: number;
  glow: number;
  boltIdx: number;
  boltX: number;
  /** Turbulence + thunder camera offset, px. */
  shakeX: number;
  shakeY: number;
  /** Strength of reduced-motion damping, 1 = normal. */
  calm: number;
}

const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
const mod = (v: number, m: number): number => ((v % m) + m) % m;
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const wf = (l: BackgroundLayer, w: number): number => (l.weather ? l.weather[0] + (l.weather[1] - l.weather[0]) * w : 1);

function reducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// --- painters --------------------------------------------------------------------------------------------------

interface Particle {
  x: number;
  y: number;
  s: number;
  p: number;
}

function particles(count: number, seed: number, w: number, h: number): Particle[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => ({ x: rnd() * w, y: rnd() * h, s: 0.6 + rnd() * 0.8, p: rnd() * TAU }));
}

function buildClouds(l: { count: number; color: string; alpha: number; size: [number, number] }, seed: number, light?: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(W, TILE);
  const rnd = mulberry32(seed);
  for (let i = 0; i < l.count; i++) {
    const cx = rnd() * W;
    const cy = rnd() * TILE;
    const size = l.size[0] + rnd() * (l.size[1] - l.size[0]);
    const puffs = 6 + Math.floor(rnd() * 5);
    for (let k = 0; k < puffs; k++) {
      const px = cx + (rnd() - 0.5) * size;
      const py = cy + (rnd() - 0.5) * size * 0.4;
      const r = size * (0.14 + rnd() * 0.17);
      for (const wrapY of [-TILE, 0, TILE]) {
        for (const wrapX of [-W, 0, W]) {
          const x = px + wrapX;
          const y = py + wrapY;
          if (x < -r * 2 || x > W + r * 2 || y < -r * 2 || y > TILE + r * 2) continue;
          if (light) {
            // Roiling look: dark body with a lit upper rim.
            const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r * 1.6);
            g.addColorStop(0, light);
            g.addColorStop(0.55, l.color);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalAlpha = l.alpha;
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(x, y, r * 1.7, r * 1.1, 0, 0, TAU);
            ctx.fill();
          } else {
            ctx.globalAlpha = l.alpha;
            ctx.fillStyle = l.color;
            ctx.beginPath();
            ctx.ellipse(x, y, r * 1.6, r, 0, 0, TAU);
            ctx.fill();
          }
        }
      }
    }
  }
  ctx.globalAlpha = 1;
  return canvas;
}

function buildMountains(l: Extract<BackgroundLayer, { type: 'mountains' }>, seed: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(W, TILE);
  const rnd = mulberry32(seed);
  const [hmin, hmax] = l.height ?? [200, 360];
  const count = l.count ?? 6;
  for (let i = 0; i < count; i++) {
    const bx = 40 + rnd() * (W - 80);
    const by = (i / count) * TILE + rnd() * (TILE / count) * 0.5;
    const hh = hmin + rnd() * (hmax - hmin);
    const ww = hh * (0.38 + rnd() * 0.22);
    // Jagged flank points (shared by the dark side and snow so they line up).
    const steps = 16;
    const right: [number, number][] = [];
    const left: [number, number][] = [];
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const spur = k % 5 === 0 ? 1.18 : 1;
      right.push([bx + ww * 0.5 * t * (0.7 + rnd() * 0.55) * spur, by + hh * t]);
      left.push([bx - ww * 0.5 * t * (0.7 + rnd() * 0.55) * spur, by + hh * t]);
    }
    for (const wrapY of [-TILE, 0]) {
      const oy = wrapY;
      ctx.globalAlpha = l.alpha ?? 1;
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.moveTo(bx, by + oy);
      for (const [x, y] of right) ctx.lineTo(x, y + oy);
      for (let k = left.length - 1; k >= 0; k--) ctx.lineTo(left[k][0], left[k][1] + oy);
      ctx.closePath();
      ctx.fill();
      // Shadowed right flank.
      ctx.fillStyle = 'rgba(0,6,20,0.28)';
      ctx.beginPath();
      ctx.moveTo(bx, by + oy);
      for (const [x, y] of right) ctx.lineTo(x, y + oy);
      ctx.lineTo(bx, by + hh + oy);
      ctx.closePath();
      ctx.fill();
      if (l.snow) {
        ctx.fillStyle = l.snow;
        ctx.beginPath();
        ctx.moveTo(bx, by + oy);
        const cap = 5;
        for (let k = 0; k < cap; k++) ctx.lineTo(right[k][0] - (k % 2 ? ww * 0.05 : 0), right[k][1] + oy);
        ctx.lineTo(bx + ww * 0.02, right[cap - 1][1] + hh * 0.08 + oy);
        for (let k = cap - 1; k >= 0; k--) ctx.lineTo(left[k][0] + (k % 2 ? ww * 0.05 : 0), left[k][1] + (k % 2 ? hh * 0.06 : 0) + oy);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
  return canvas;
}

/** A soft round glow sprite. */
function glowSprite(size: number, inner: string, mid: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, mid);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

// --- space: planet ---------------------------------------------------------------------------------------------

const PLANET_PAD = 60;
const PLANET_TEX_H = 1024;

interface PlanetParts {
  tex: HTMLCanvasElement;
  over: HTMLCanvasElement;
  r: number;
  cx: number;
  top: number;
}

function buildPlanet(topY: number, r: number): PlanetParts {
  const cx = W / 2 + 40;
  const visible = H - topY;
  const oh = PLANET_PAD + visible + 90;
  // Surface texture, wraps vertically.
  const { canvas: tex, ctx: t } = makeCanvas(W, PLANET_TEX_H);
  const rnd = mulberry32(1701);
  const g = t.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#071d44');
  g.addColorStop(0.5, '#0e3f78');
  g.addColorStop(1, '#092c5a');
  t.fillStyle = g;
  t.fillRect(0, 0, W, PLANET_TEX_H);
  const wrap = (fn: (ox: number, oy: number) => void): void => {
    for (const oy of [-PLANET_TEX_H, 0, PLANET_TEX_H]) for (const ox of [-W, 0, W]) fn(ox, oy);
  };
  // Deep and shallow ocean blotches.
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W;
    const y = rnd() * PLANET_TEX_H;
    const rad = 40 + rnd() * 120;
    t.fillStyle = rnd() > 0.5 ? 'rgba(10,50,110,0.22)' : 'rgba(40,130,190,0.16)';
    wrap((ox, oy) => {
      t.beginPath();
      t.ellipse(x + ox, y + oy, rad * 1.8, rad * 0.7, rnd() * 0.3, 0, TAU);
      t.fill();
    });
  }
  // Ice sheets (Orini is a cold world).
  for (let i = 0; i < 9; i++) {
    const x = rnd() * W;
    const y = rnd() * PLANET_TEX_H;
    const rad = 60 + rnd() * 110;
    const pts = Array.from({ length: 24 }, (_, k) => {
      const a = (k / 24) * TAU;
      const rr = rad * (0.8 + rnd() * 0.3);
      return [Math.cos(a) * rr * 1.5, Math.sin(a) * rr * 0.6] as const;
    });
    wrap((ox, oy) => {
      t.fillStyle = 'rgba(205,228,245,0.5)';
      t.beginPath();
      pts.forEach(([px, py], k) => (k ? t.lineTo(x + ox + px, y + oy + py) : t.moveTo(x + ox + px, y + oy + py)));
      t.closePath();
      t.fill();
      t.fillStyle = 'rgba(150,196,230,0.3)';
      t.beginPath();
      pts.forEach(([px, py], k) => (k ? t.lineTo(x + ox + px * 1.3, y + oy + py * 1.3) : t.moveTo(x + ox + px * 1.3, y + oy + py * 1.3)));
      t.closePath();
      t.fill();
    });
  }
  // Cloud swirls / bands.
  for (let i = 0; i < 55; i++) {
    const x = rnd() * W;
    const y = rnd() * PLANET_TEX_H;
    const len = 90 + rnd() * 240;
    const ang = (rnd() - 0.5) * 0.35;
    t.fillStyle = `rgba(245,250,255,${0.05 + rnd() * 0.13})`;
    wrap((ox, oy) => {
      t.beginPath();
      t.ellipse(x + ox, y + oy, len, 5 + rnd() * 16, ang, 0, TAU);
      t.fill();
    });
  }

  // Overlay: terminator shading, city lights, atmosphere rim (coordinates: circle centre at (cx, PAD + r)).
  const { canvas: over, ctx: o } = makeCanvas(W, oh);
  const ccy = PLANET_PAD + r;
  const clip = (): void => {
    o.beginPath();
    o.arc(cx, ccy, r, 0, TAU);
    o.clip();
  };
  o.save();
  clip();
  // Light comes from the upper left; the far side falls into night.
  const sh = o.createRadialGradient(cx - r * 0.55, ccy - r * 0.95, r * 0.15, cx - r * 0.2, ccy - r * 0.5, r * 1.55);
  sh.addColorStop(0, 'rgba(0,4,16,0)');
  sh.addColorStop(0.45, 'rgba(0,4,16,0.4)');
  sh.addColorStop(0.78, 'rgba(0,3,12,0.85)');
  sh.addColorStop(1, 'rgba(0,2,8,0.96)');
  o.fillStyle = sh;
  o.fillRect(0, 0, W, oh);
  // Specular sheen on the lit ocean.
  const sp = o.createRadialGradient(cx - r * 0.42, ccy - r * 0.93, 4, cx - r * 0.42, ccy - r * 0.93, 190);
  sp.addColorStop(0, 'rgba(190,230,255,0.4)');
  sp.addColorStop(1, 'rgba(190,230,255,0)');
  o.fillStyle = sp;
  o.fillRect(0, 0, W, oh);
  // City lights clustered on the night side (right and bottom).
  const rc = mulberry32(55);
  for (let c = 0; c < 9; c++) {
    const gx = cx + 120 + rc() * 330;
    const gy = ccy - r + 120 + rc() * (visible - 100);
    for (let i = 0; i < 26; i++) {
      const x = gx + (rc() - 0.5) * 70;
      const y = gy + (rc() - 0.5) * 40;
      o.fillStyle = rc() > 0.3 ? 'rgba(255,214,130,0.85)' : 'rgba(255,240,200,0.9)';
      o.fillRect(x, y, 1.5, 1.5);
    }
  }
  o.restore();
  // Atmosphere rim glow, strongest on the lit upper-left limb.
  o.globalCompositeOperation = 'lighter';
  const rim = o.createRadialGradient(cx, ccy, r - 10, cx, ccy, r + 46);
  rim.addColorStop(0, 'rgba(90,170,255,0)');
  rim.addColorStop(0.2, 'rgba(120,190,255,0.5)');
  rim.addColorStop(0.45, 'rgba(70,140,255,0.22)');
  rim.addColorStop(1, 'rgba(40,90,220,0)');
  o.fillStyle = rim;
  o.beginPath();
  o.arc(cx, ccy, r + 46, 0, TAU);
  o.fill();
  o.globalCompositeOperation = 'source-over';
  o.lineWidth = 2;
  const edge = o.createLinearGradient(0, ccy - r, W, ccy - r + 140);
  edge.addColorStop(0, 'rgba(210,235,255,0.9)');
  edge.addColorStop(1, 'rgba(120,180,255,0.15)');
  o.strokeStyle = edge;
  o.beginPath();
  o.arc(cx, ccy, r - 1, 0, TAU);
  o.stroke();
  return { tex, over, r, cx, top: topY };
}

// --- space: distant fleet --------------------------------------------------------------------------------------

interface FarEvent {
  kind: 'boom' | 'lights' | 'ship';
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
  vx: number;
  vy: number;
  seed: number;
  dir: number;
  /** For explosions: a flare colour 0 orange, 1 blue. */
  hue: number;
}

function buildCapitalSprite(variant: number): HTMLCanvasElement {
  const w = 220;
  const h = 70;
  const { canvas, ctx } = makeCanvas(w, h);
  const rnd = mulberry32(900 + variant);
  // Heading right: engines on the left.
  ctx.fillStyle = '#070b16';
  ctx.beginPath();
  if (variant === 0) {
    ctx.moveTo(8, 26);
    ctx.lineTo(60, 20);
    ctx.lineTo(150, 18);
    ctx.lineTo(212, 33);
    ctx.lineTo(150, 50);
    ctx.lineTo(60, 52);
    ctx.lineTo(8, 46);
  } else {
    ctx.moveTo(10, 20);
    ctx.lineTo(90, 14);
    ctx.lineTo(130, 28);
    ctx.lineTo(205, 34);
    ctx.lineTo(130, 44);
    ctx.lineTo(90, 56);
    ctx.lineTo(10, 50);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,160,230,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Bridge fins and lit windows.
  ctx.fillStyle = '#0c1220';
  ctx.fillRect(100, 10, 22, 12);
  for (let i = 0; i < 28; i++) {
    ctx.fillStyle = rnd() > 0.4 ? 'rgba(255,214,140,0.9)' : 'rgba(150,210,255,0.9)';
    ctx.fillRect(30 + rnd() * 140, 26 + rnd() * 18, 1.2, 1.2);
  }
  // Engine glow.
  const eg = glowSprite(40, 'rgba(180,230,255,1)', 'rgba(70,150,255,0.55)');
  ctx.globalCompositeOperation = 'lighter';
  for (const y of [28, 38]) ctx.drawImage(eg, -8, y - 20, 40, 40);
  return canvas;
}

// --- atmosphere: debris shards ---------------------------------------------------------------------------------

function buildShard(seed: number): HTMLCanvasElement {
  const s = 96;
  const { canvas, ctx } = makeCanvas(s, s);
  const rnd = mulberry32(seed);
  const n = 7 + Math.floor(rnd() * 3);
  ctx.fillStyle = '#04060b';
  ctx.beginPath();
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    const rr = s * (0.18 + rnd() * 0.3);
    const x = s / 2 + Math.cos(a) * rr * (1 + rnd() * 0.5);
    const y = s / 2 + Math.sin(a) * rr * (0.55 + rnd() * 0.4);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,120,60,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  return canvas;
}

interface Shard {
  x: number;
  y: number;
  vy: number;
  vx: number;
  rot: number;
  spin: number;
  scale: number;
  sprite: number;
}

// --- edge glow --------------------------------------------------------------------------------------------------

function buildEdgeGlow(color: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, color);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(W / H + 0.25, 1);
  ctx.translate(-W / 2, -H / 2);
  ctx.fillStyle = g;
  ctx.fillRect(-W, 0, W * 3, H);
  ctx.restore();
  // Extra heat from the lower edge (rising from beneath).
  const b = ctx.createLinearGradient(0, H * 0.7, 0, H);
  b.addColorStop(0, 'rgba(0,0,0,0)');
  b.addColorStop(1, color);
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = b;
  ctx.fillRect(0, H * 0.7, W, H * 0.3);
  return canvas;
}

// --- lightning bolts --------------------------------------------------------------------------------------------

function buildBolts(): [number, number][][] {
  const rnd = mulberry32(4242);
  return Array.from({ length: 4 }, () => {
    const pts: [number, number][] = [[0, -10]];
    let x = 0;
    let y = -10;
    while (y < H * (0.55 + rnd() * 0.3)) {
      y += 30 + rnd() * 50;
      x += (rnd() - 0.5) * 70;
      pts.push([x, y]);
    }
    return pts;
  });
}

// --- the view of one theme ---------------------------------------------------------------------------------------

interface Built {
  layer: BackgroundLayer;
  tile?: HTMLCanvasElement;
  parts?: Particle[];
  planet?: PlanetParts;
  glow?: HTMLCanvasElement;
  shards?: Shard[];
  events?: FarEvent[];
  spawnCd?: number;
  custom?: CustomBackgroundLayer;
}

class ThemeView {
  private readonly sky: HTMLCanvasElement;
  private readonly storm: HTMLCanvasElement | null;
  private readonly built: Built[];
  private readonly boom = glowSprite(64, 'rgba(255,250,230,1)', 'rgba(255,150,60,0.6)');
  private readonly boomBlue = glowSprite(64, 'rgba(240,250,255,1)', 'rgba(90,170,255,0.6)');
  private readonly capital = [buildCapitalSprite(0), buildCapitalSprite(1)];
  private readonly shardSprites = [1, 2, 3, 4].map((i) => buildShard(60 + i));
  private readonly bolts = buildBolts();
  private rnd = mulberry32(7);
  /** Whether this theme has a lightning layer (the strike scheduler only runs for such themes). */
  readonly hasLightning: boolean;

  constructor(readonly theme: ScrollTheme) {
    this.sky = paintSky(theme.sky);
    this.storm = theme.stormSky ? paintSky(theme.stormSky) : null;
    this.hasLightning = theme.layers.some((l) => l.type === 'lightning');
    this.built = theme.layers.map((layer, i): Built => {
      switch (layer.type) {
        case 'clouds':
          return { layer, tile: buildClouds(layer, 11 + i * 7) };
        case 'stormClouds':
          return { layer, tile: buildClouds(layer, 13 + i * 7, layer.light) };
        case 'mountains':
          return { layer, tile: buildMountains(layer, 31 + i * 5) };
        case 'stars':
          return { layer, parts: particles(layer.count, 71 + i, W, H + 200) };
        case 'snow':
          return { layer, parts: particles(layer.count, 91 + i, W, H) };
        case 'streaks':
        case 'rain':
          return { layer, parts: particles(layer.count, 51 + i, W, H + 160) };
        case 'planet':
          return { layer, planet: buildPlanet(layer.top ?? H - 330, layer.radius ?? 700) };
        case 'fleet':
          return { layer, events: [], spawnCd: 2 };
        case 'shards': {
          const rnd = mulberry32(200 + i);
          const shards: Shard[] = Array.from({ length: layer.count }, () => ({
            x: rnd() * W,
            y: rnd() * H,
            vy: 350 + rnd() * 700,
            vx: (rnd() - 0.5) * 160,
            rot: rnd() * TAU,
            spin: (rnd() - 0.5) * 5,
            scale: 0.5 + rnd() * 1.3,
            sprite: Math.floor(rnd() * 4),
          }));
          return { layer, shards };
        }
        case 'edgeGlow':
          return { layer, glow: buildEdgeGlow(layer.color) };
        case 'custom':
          return { layer, custom: layer.make() };
        default:
          return { layer };
      }
    });
  }

  update(dt: number, fx: Fx): void {
    for (const b of this.built) {
      const l = b.layer;
      if (b.custom) b.custom.update?.(dt, fx.speed);
      if (l.type === 'fleet' && b.events) {
        const ev = b.events;
        for (let i = ev.length - 1; i >= 0; i--) {
          const e = ev[i];
          e.age += dt;
          e.x += e.vx * dt;
          e.y += (e.vy + fx.speed * 0.1) * dt;
          if (e.age >= e.life || e.y > H) ev.splice(i, 1);
        }
        b.spawnCd = (b.spawnCd ?? 0) - dt;
        if (b.spawnCd <= 0 && ev.length < 7) {
          b.spawnCd = (0.6 + this.rnd() * 1.4) / Math.max(0.05, l.rate);
          this.spawnFar(ev, l.maxY ?? 560);
        }
      } else if (l.type === 'shards' && b.shards) {
        for (const s of b.shards) {
          s.y += (s.vy * 0.5 + fx.speed * 1.3) * dt;
          s.x += s.vx * dt;
          s.rot += s.spin * dt;
          if (s.y > H + 80 || s.x < -120 || s.x > W + 120) {
            s.y = -60 - this.rnd() * 300;
            s.x = this.rnd() * W;
          }
        }
      }
    }
  }

  private spawnFar(ev: FarEvent[], maxY: number): void {
    const r = this.rnd();
    const dir = this.rnd() > 0.5 ? 1 : -1;
    const base = { age: 0, seed: Math.floor(this.rnd() * 1e6), dir, hue: this.rnd() > 0.7 ? 1 : 0 };
    if (r < 0.45) {
      ev.push({ ...base, kind: 'boom', x: 20 + this.rnd() * (W - 40), y: 30 + this.rnd() * maxY, life: 0.9 + this.rnd() * 0.5, size: 18 + this.rnd() * 34, vx: 0, vy: 0 });
      // Chain of secondaries.
      if (this.rnd() > 0.5) ev.push({ ...base, kind: 'boom', x: ev[ev.length - 1].x + (this.rnd() - 0.5) * 60, y: ev[ev.length - 1].y + (this.rnd() - 0.5) * 40, age: -0.25, life: 0.8, size: 12 + this.rnd() * 18, vx: 0, vy: 0 });
    } else if (r < 0.8) {
      ev.push({ ...base, kind: 'lights', x: this.rnd() * W, y: 30 + this.rnd() * maxY, life: 9 + this.rnd() * 6, size: 18 + this.rnd() * 26, vx: dir * (6 + this.rnd() * 10), vy: 3 });
    } else {
      ev.push({ ...base, kind: 'ship', x: dir > 0 ? -60 : W + 60, y: 40 + this.rnd() * (maxY - 120), life: 26, size: 0.28 + this.rnd() * 0.35, vx: dir * (9 + this.rnd() * 10), vy: 2 });
    }
  }

  draw(ctx: CanvasRenderingContext2D, fx: Fx, alpha = 1): void {
    const w = fx.weather;
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.sky, 0, 0);
    if (this.storm && w > 0.01) {
      ctx.globalAlpha = alpha * w;
      ctx.drawImage(this.storm, 0, 0);
    }
    for (const b of this.built) {
      const l = b.layer;
      const f = wf(l, w);
      switch (l.type) {
        case 'clouds':
        case 'mountains':
          ctx.globalAlpha = alpha * (l.type === 'mountains' ? f : 1);
          drawTile(ctx, b.tile!, fx.dist * l.speed, 0, 0);
          break;
        case 'stormClouds':
          ctx.globalAlpha = alpha * clamp(f);
          drawTile(ctx, b.tile!, fx.dist * l.speed + fx.time * 18 * l.speed, ((l.wobble ?? 0) * (0.35 + 0.65 * w)), fx.time);
          break;
        case 'stars':
          this.drawStars(ctx, b, l, fx, alpha);
          break;
        case 'snow':
          this.drawSnow(ctx, b, l, fx, alpha);
          break;
        case 'streaks':
          this.drawStreaks(ctx, b, l, fx, alpha);
          break;
        case 'rain':
          this.drawRain(ctx, b, l, fx, alpha, f);
          break;
        case 'planet':
          this.drawPlanet(ctx, b.planet!, fx, alpha);
          break;
        case 'fleet':
          this.drawFleet(ctx, b.events!, alpha);
          break;
        case 'shards':
          this.drawShards(ctx, b.shards!, l.alpha ?? 0.5, f, fx, alpha);
          break;
        case 'edgeGlow': {
          const pulse = 0.62 + 0.28 * Math.sin(fx.time * (l.rate ?? 2)) + 0.1 * Math.sin(fx.time * 5.3 + 1) + fx.flash * 0.25;
          const a = (l.base ?? 1) * clamp(f) * (0.18 + 0.82 * w) * clamp(pulse, 0.2, 1.1);
          if (a > 0.01) {
            ctx.globalAlpha = alpha * clamp(a, 0, 1);
            ctx.drawImage(b.glow!, 0, 0);
          }
          break;
        }
        case 'whiteout': {
          const rate = l.rate ?? 0.25;
          const sd = l.seed ?? 1;
          const n = 0.5 + 0.25 * Math.sin(fx.time * rate + sd) + 0.25 * Math.sin(fx.time * rate * 2.7 + sd * 2.1);
          const a = smooth(0.62, 0.95, n) * clamp(l.strength, 0, 0.6) * clamp(f) * (0.3 + 0.7 * w);
          if (a > 0.005) {
            ctx.globalAlpha = alpha * a;
            ctx.fillStyle = l.color;
            ctx.fillRect(0, 0, W, H);
          }
          break;
        }
        case 'lightning':
          this.drawLightning(ctx, l, fx, alpha);
          break;
        case 'custom':
          b.custom!.draw(ctx, fx.dist, fx.speed, fx.time, alpha, w);
          break;
        default:
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawStars(ctx: CanvasRenderingContext2D, b: Built, l: Extract<BackgroundLayer, { type: 'stars' }>, fx: Fx, alpha: number): void {
    const parts = b.parts!;
    const span = H + 200;
    const off = fx.dist * l.speed;
    const tailMax = (l.streak ?? 0) * fx.sp * 1.2;
    ctx.globalAlpha = alpha * (l.alpha ?? 1);
    if (tailMax < 2) {
      ctx.fillStyle = l.color ?? '#aab8e0';
      for (const p of parts) {
        const y = (p.y + off) % span;
        if (y < H) ctx.fillRect(Math.round(p.x), Math.round(y), p.s > 1.1 ? 2 : 1, p.s > 1.1 ? 2 : 1);
      }
      return;
    }
    ctx.strokeStyle = l.color ?? '#aab8e0';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (const p of parts) {
      const y = (p.y + off) % span;
      if (y > H + 4 || y < -2) continue;
      const t = tailMax * (0.5 + 0.5 * p.s);
      ctx.moveTo(Math.round(p.x) + 0.5, y);
      ctx.lineTo(Math.round(p.x) + 0.5, y - t);
    }
    ctx.stroke();
  }

  private drawSnow(ctx: CanvasRenderingContext2D, b: Built, l: Extract<BackgroundLayer, { type: 'snow' }>, fx: Fx, alpha: number): void {
    ctx.fillStyle = l.color ?? '#fff';
    ctx.globalAlpha = alpha * 0.85;
    const off = fx.dist * l.speed;
    for (const p of b.parts!) {
      const y = (p.y + off * p.s + fx.time * 14 * p.s) % H;
      const x = mod(p.x + Math.sin(fx.time * 0.8 + p.p) * l.drift, W);
      ctx.fillRect(Math.round(x), Math.round(y), p.s > 1 ? 3 : 2, p.s > 1 ? 3 : 2);
    }
  }

  private drawStreaks(ctx: CanvasRenderingContext2D, b: Built, l: Extract<BackgroundLayer, { type: 'streaks' }>, fx: Fx, alpha: number): void {
    ctx.fillStyle = l.color;
    ctx.globalAlpha = alpha * l.alpha;
    const off = fx.dist * l.speed;
    for (const p of b.parts!) {
      const y = (p.y + off * p.s) % (H + 120);
      ctx.fillRect(Math.round(p.x), Math.round(y - 120), 1 + (p.s > 1 ? 1 : 0), 40 + Math.round(p.s * 50));
    }
  }

  private drawRain(ctx: CanvasRenderingContext2D, b: Built, l: Extract<BackgroundLayer, { type: 'rain' }>, fx: Fx, alpha: number, f: number): void {
    const parts = b.parts!;
    const n = Math.min(parts.length, Math.floor(parts.length * clamp(f)));
    if (n <= 0) return;
    const span = H + 160;
    // Gusts swing the slant; scroll speed stretches the streaks a little.
    const slant = l.slant * (0.6 + 0.8 * fx.gust) * (0.6 + 0.6 * fx.weather);
    const stretch = 0.8 + fx.sp * 0.6;
    ctx.strokeStyle = l.color;
    ctx.lineWidth = l.width ?? 1;
    ctx.globalAlpha = alpha * l.alpha * (0.5 + 0.5 * fx.gust);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = parts[i];
      const y = (p.y + (fx.dist * l.speed + fx.time * l.fall) * p.s) % span;
      const len = (l.len[0] + (l.len[1] - l.len[0]) * ((p.s - 0.6) / 0.8)) * stretch;
      const x = mod(p.x + y * slant * 0.3 + fx.time * 40 * slant * p.s, W + 200) - 100;
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * slant, y - len);
    }
    ctx.stroke();
  }

  private drawPlanet(ctx: CanvasRenderingContext2D, pl: PlanetParts, fx: Fx, alpha: number): void {
    // The limb drifts slowly up and down as you travel and the surface slides past.
    const shift = Math.sin(fx.dist / 2600) * 26 + Math.sin(fx.dist / 900) * 6;
    const top = pl.top + shift;
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.beginPath();
    ctx.arc(pl.cx, top + pl.r, pl.r - 1, 0, TAU);
    ctx.clip();
    const off = mod(fx.dist * 0.06 + fx.time * 3, PLANET_TEX_H);
    ctx.drawImage(pl.tex, 0, Math.round(top + off - PLANET_TEX_H));
    ctx.drawImage(pl.tex, 0, Math.round(top + off));
    ctx.drawImage(pl.tex, 0, Math.round(top + off + PLANET_TEX_H));
    ctx.restore();
    ctx.drawImage(pl.over, 0, Math.round(top - PLANET_PAD));
  }

  private drawFleet(ctx: CanvasRenderingContext2D, events: FarEvent[], alpha: number): void {
    for (const e of events) {
      if (e.age < 0) continue;
      const k = e.age / e.life;
      if (e.kind === 'boom') {
        // Fast flare, slow fade, an expanding ring.
        const a = k < 0.12 ? k / 0.12 : Math.pow(1 - (k - 0.12) / 0.88, 1.6);
        const s = e.size * (0.5 + k * 1.6);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * clamp(a);
        ctx.drawImage(e.hue ? this.boomBlue : this.boom, e.x - s, e.y - s, s * 2, s * 2);
        ctx.globalAlpha = alpha * clamp(a) * 0.5;
        ctx.strokeStyle = e.hue ? '#9fd0ff' : '#ffc890';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(e.x, e.y, s * 0.9 * (0.4 + k), 0, TAU);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      } else if (e.kind === 'lights') {
        const a = Math.min(k / 0.12, (1 - k) / 0.12, 1);
        const rnd = mulberry32(e.seed);
        for (let i = 0; i < 6; i++) {
          const px = e.x + (rnd() - 0.5) * e.size * 2 + i * e.dir * 3;
          const py = e.y + (rnd() - 0.5) * e.size * 0.8;
          const blink = 0.5 + 0.5 * Math.sin(e.age * (2 + rnd() * 4) + rnd() * 6);
          ctx.globalAlpha = alpha * clamp(a) * (0.35 + 0.65 * blink);
          ctx.fillStyle = rnd() > 0.5 ? '#9fe0ff' : '#ffb070';
          ctx.fillRect(px, py, 2, 2);
        }
      } else {
        const a = Math.min(k / 0.1, (1 - k) / 0.1, 1);
        ctx.globalAlpha = alpha * clamp(a) * 0.9;
        const sp = this.capital[e.seed % 2];
        const w = sp.width * e.size;
        const h = sp.height * e.size;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.scale(e.dir, 1);
        ctx.drawImage(sp, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }
  }

  private drawShards(ctx: CanvasRenderingContext2D, shards: Shard[], a: number, f: number, fx: Fx, alpha: number): void {
    const n = Math.min(shards.length, Math.ceil(shards.length * clamp(f)));
    ctx.globalAlpha = alpha * a * (0.4 + 0.6 * fx.weather);
    for (let i = 0; i < n; i++) {
      const s = shards[i];
      const sp = this.shardSprites[s.sprite];
      const size = sp.width * s.scale;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.drawImage(sp, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }

  private drawLightning(ctx: CanvasRenderingContext2D, l: Extract<BackgroundLayer, { type: 'lightning' }>, fx: Fx, alpha: number): void {
    if (fx.flash <= 0.003 && fx.glow <= 0.003) return;
    const w = fx.weather;
    // Soft, capped: the peak alpha stays under 0.5 and the rise is not instant (see ScrollBackground.update).
    const peak = (0.2 + 0.28 * w) * fx.calm;
    ctx.fillStyle = l.color ?? '#dce6ff';
    ctx.globalAlpha = alpha * clamp(fx.flash * peak + fx.glow * 0.1 * fx.calm, 0, 0.5);
    ctx.fillRect(0, 0, W, H);
    if (fx.flash > 0.25 && fx.calm > 0.5) {
      const pts = this.bolts[fx.boltIdx % this.bolts.length];
      ctx.save();
      ctx.translate(fx.boltX, 0);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#9fb8ff';
      ctx.globalAlpha = alpha * fx.flash * 0.35;
      ctx.lineWidth = 8;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = alpha * fx.flash * 0.9;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }
}

function paintSky(stops: string[]): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  stops.forEach((c, i) => g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  return canvas;
}

/** Draw a vertically wrapping tile scrolled by `off`, as horizontal strips sideways-wobbling by up to `wobble` px (0 = whole tile). */
function drawTile(ctx: CanvasRenderingContext2D, tile: HTMLCanvasElement, off: number, wobble: number, time: number): void {
  const o = mod(Math.round(off), TILE);
  if (wobble < 0.5) {
    ctx.drawImage(tile, 0, o - TILE);
    ctx.drawImage(tile, 0, o);
    return;
  }
  const STRIP = 32;
  for (let sy = 0; sy < H; sy += STRIP) {
    const dx = Math.round(Math.sin(time * 0.9 + sy * 0.004 + off * 0.0023) * wobble + Math.sin(time * 1.9 + sy * 0.009) * wobble * 0.4);
    const h = Math.min(STRIP, H - sy);
    let src = mod(sy - o, TILE);
    let dy = sy;
    let left = h;
    while (left > 0) {
      const part = Math.min(left, TILE - src);
      ctx.drawImage(tile, 0, src, W, part, dx, dy, W, part);
      if (dx > 0) ctx.drawImage(tile, 0, src, W, part, dx - W, dy, W, part);
      else if (dx < 0) ctx.drawImage(tile, 0, src, W, part, dx + W, dy, W, part);
      left -= part;
      dy += part;
      src = (src + part) % TILE;
    }
  }
}

// --- the background of a scroll level ------------------------------------------------------------------------------

/** The background of a scroll level: advance with the scroll distance and speed, cross-fade between themes, ease the weather. */
export class ScrollBackground {
  private cur: ThemeView;
  private prev: ThemeView | null = null;
  private fade = 1;
  private fadeTime = 2;
  private views = new Map<string, ThemeView>();
  private readonly rnd = mulberry32(99);
  private readonly calm = reducedMotion() ? 0.45 : 1;
  /** Called when thunder arrives (strength 0..1). */
  onThunder: ((strength: number) => void) | null = null;

  private weatherFrom = 0;
  private weatherTo = 0;
  private weatherTime = 0;
  private weatherLeft = 0;
  private strikeAge = 99;
  private strikeCd = 3;
  private thunderIn = -1;
  private kick = 0;

  private readonly fx: Fx = {
    dist: 0, time: 0, speed: 0, sp: 0, weather: 0, gust: 0.5, flash: 0, glow: 0, boltIdx: 0, boltX: 270, shakeX: 0, shakeY: 0, calm: 1,
  };

  constructor(theme: string | ScrollTheme, weather = 0) {
    this.cur = this.view(theme);
    this.weatherFrom = this.weatherTo = this.fx.weather = clamp(weather);
    this.fx.calm = this.calm;
  }

  private view(theme: string | ScrollTheme): ThemeView {
    const t = typeof theme === 'string' ? themeById(theme) : theme;
    let v = this.views.get(t.id);
    if (!v) {
      v = new ThemeView(t);
      this.views.set(t.id, v);
    }
    return v;
  }

  get themeId(): string {
    return this.cur.theme.id;
  }

  /** Current (eased) weather intensity 0..1. */
  get weather(): number {
    return this.fx.weather;
  }

  /** Current lightning flash 0..1 (debug / tests). */
  get flash(): number {
    return this.fx.flash;
  }

  setWeather(intensity: number, ease = 3): void {
    this.weatherFrom = this.fx.weather;
    this.weatherTo = clamp(intensity);
    this.weatherTime = this.weatherLeft = Math.max(0, ease);
    if (ease <= 0) this.fx.weather = this.weatherTo;
  }

  setTheme(theme: string | ScrollTheme, fade = 2): void {
    const v = this.view(theme);
    if (v === this.cur) return;
    if (fade <= 0) {
      this.cur = v;
      this.prev = null;
      this.fade = 1;
      return;
    }
    this.prev = this.cur;
    this.cur = v;
    this.fade = 0;
    this.fadeTime = fade;
  }

  /** Debug: strike lightning now (respects the frequency cap). */
  strike(): boolean {
    if (this.strikeAge < 0.4) return false;
    this.doStrike();
    return true;
  }

  private doStrike(): void {
    this.strikeAge = 0;
    this.fx.boltIdx = Math.floor(this.rnd() * 4);
    this.fx.boltX = 60 + this.rnd() * (W - 120);
    this.thunderIn = 0.25 + this.rnd() * 0.5;
  }

  update(dt: number, speed = 0): void {
    const fx = this.fx;
    fx.time += dt;
    fx.speed = speed;
    fx.sp = clamp((speed - 25) / 475, 0, 1.3);
    if (this.weatherLeft > 0) {
      this.weatherLeft = Math.max(0, this.weatherLeft - dt);
      const k = this.weatherTime > 0 ? 1 - this.weatherLeft / this.weatherTime : 1;
      fx.weather = this.weatherFrom + (this.weatherTo - this.weatherFrom) * (k * k * (3 - 2 * k));
    }
    const w = fx.weather;
    const t = fx.time;
    fx.gust = clamp(0.5 + 0.3 * Math.sin(t * 0.6 + Math.sin(t * 0.23) * 2) + 0.2 * Math.sin(t * 1.7 + 1.3), 0, 1);

    // Lightning: strikes at least 0.7 s apart (at most ~1.4 per second; a double flicker is one envelope), soft rise.
    this.strikeAge += dt;
    if (this.cur.hasLightning && w > 0.2) {
      this.strikeCd -= dt;
      if (this.strikeCd <= 0) {
        const mean = 7.5 - 5.5 * w;
        this.strikeCd = Math.max(0.8, mean * (0.6 + this.rnd() * 0.8));
        if (this.strikeAge >= 0.7) this.doStrike();
      }
    }
    const a = this.strikeAge;
    const env = (x: number): number => (x < 0 ? 0 : x < 0.08 ? x / 0.08 : Math.exp(-(x - 0.08) / 0.2));
    fx.flash = Math.max(env(a), 0.55 * env(a - 0.24));
    fx.glow = a > 0.08 ? Math.exp(-(a - 0.08) / 1.1) : a / 0.08;
    if (this.thunderIn >= 0) {
      this.thunderIn -= dt;
      if (this.thunderIn < 0) {
        this.onThunder?.(w);
        this.kick = 1;
      }
    }
    this.kick = Math.max(0, this.kick - dt * 2.2);

    // Camera turbulence (small) + the thunder kick. The shake is applied with a slight zoom so no edges show.
    let amp = 0;
    for (const l of this.cur.theme.layers) if (l.type === 'turbulence') amp = Math.max(amp, l.amp * (0.1 + 0.9 * w));
    amp *= this.calm;
    const kickAmp = this.kick * 3 * w * this.calm;
    fx.shakeX = clamp(((Math.sin(t * 7.3) + Math.sin(t * 12.1 + 1) * 0.6) * 0.55) * amp + Math.sin(t * 41) * kickAmp, -9, 9);
    fx.shakeY = clamp(((Math.sin(t * 8.9 + 2) + Math.sin(t * 15.7) * 0.5) * 0.45) * amp + Math.sin(t * 37 + 1) * kickAmp, -9, 9);

    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt / this.fadeTime);
      if (this.fade >= 1) this.prev = null;
    }
    this.cur.update(dt, fx);
    this.prev?.update(dt, fx);
  }

  draw(ctx: CanvasRenderingContext2D, dist: number, speed?: number): void {
    const fx = this.fx;
    fx.dist = dist;
    if (speed !== undefined && speed !== fx.speed) {
      fx.speed = speed;
      fx.sp = clamp((speed - 25) / 475, 0, 1.3);
    }
    const shaking = Math.abs(fx.shakeX) + Math.abs(fx.shakeY) > 0.3;
    if (shaking) {
      ctx.save();
      ctx.translate(W / 2 + fx.shakeX, H / 2 + fx.shakeY);
      ctx.scale(1.04, 1.04);
      ctx.translate(-W / 2, -H / 2);
    }
    if (this.prev && this.fade < 1) {
      this.prev.draw(ctx, fx);
      this.cur.draw(ctx, fx, this.fade);
    } else this.cur.draw(ctx, fx);
    if (shaking) ctx.restore();
  }
}
