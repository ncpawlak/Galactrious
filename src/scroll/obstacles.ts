import { H, W } from '../config';
import { crisp, makeCanvas, shade } from '../bosses/paint';
import type { MotionPreset, ObstacleMotion, ObstacleShape, ObstacleSpawn } from './types';

/**
 * Obstacles (debris chunks, mountain peaks): pixel shapes painted once per template with the boss paint helpers, drawn
 * with one `drawImage` each and tested against the player with a pixel mask. They hurt the player on contact (the game
 * applies the damage through `Health.hit`, so i-frames and the dodge work as for enemy bullets) and nothing else: they
 * never touch enemies and never kill outright. `carvable` obstacles lose pixels to the player's base gun.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A painted shape: the canvas and a 0/1 mask of its solid pixels. */
interface Template {
  canvas: HTMLCanvasElement;
  mask: Uint8Array;
  w: number;
  h: number;
}

export const SIZES: Record<ObstacleShape, { w: number; h: number }> = {
  'debris-s': { w: 26, h: 26 },
  'debris-m': { w: 44, h: 44 },
  'debris-l': { w: 76, h: 76 },
  'debris-xl': { w: 120, h: 120 },
  'peak-s': { w: 140, h: 200 },
  'peak-m': { w: 210, h: 290 },
  'peak-l': { w: 310, h: 400 },
  'range-m': { w: 360, h: 270 },
  'range-l': { w: 490, h: 350 },
};

export const isRockShape = (shape: ObstacleShape): boolean => shape.startsWith('peak') || shape.startsWith('range');

/** Contact damage defaults (the player has 5 hull; an enemy bullet is 1, a sweep or bomb 2). */
export const OBSTACLE_DAMAGE: Record<'debris' | 'peak', number> = { debris: 1, peak: 2 };

const TEMPLATE_VARIANTS = 4;
/** Seconds a warning marker shows on the edge before a bottom or side obstacle appears. */
export const WARN_SECONDS = 1.0;
const cache = new Map<string, Template>();

function maskOf(ctx: CanvasRenderingContext2D): Uint8Array {
  const { width: w, height: h } = ctx.canvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  return m;
}

function paintDebris(shape: ObstacleShape, variant: number): Template {
  const { w, h } = SIZES[shape];
  const rnd = mulberry32(1000 + variant * 77 + w);
  const { canvas, ctx } = makeCanvas(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const n = 8 + Math.floor(rnd() * 4);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
    const r = (w / 2 - 1) * (0.55 + rnd() * 0.45);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * (0.75 + rnd() * 0.25)]);
  }
  const path = new Path2D();
  pts.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
  path.closePath();
  // Scrap of armour plate: gunmetal, a scorched burnt edge, panel lines, a few hot spots.
  ctx.fillStyle = '#4a4f5e';
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  ctx.strokeStyle = '#2c303c';
  ctx.lineWidth = Math.max(2, w / 14);
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.5, cy - h * (0.1 + rnd() * 0.2));
  ctx.lineTo(cx + w * 0.5, cy + h * (rnd() * 0.3));
  ctx.moveTo(cx + w * (rnd() - 0.5) * 0.4, cy - h * 0.5);
  ctx.lineTo(cx + w * (rnd() - 0.5) * 0.4, cy + h * 0.5);
  ctx.stroke();
  ctx.fillStyle = '#7d3a2c';
  ctx.fillRect(cx - w * 0.5, cy + h * 0.08, w, Math.max(2, h * 0.08));
  if (w >= 40) {
    ctx.fillStyle = '#ff8a3a';
    for (let i = 0; i < Math.floor(w / 28); i++) ctx.fillRect(cx + (rnd() - 0.5) * w * 0.6, cy + (rnd() - 0.5) * h * 0.6, 3, 3);
  }
  ctx.restore();
  crisp(ctx);
  shade(ctx, { noise: 0.2, edge: 0.55, seamEvery: w >= 70 ? 22 : undefined });
  return { canvas, mask: maskOf(ctx), w, h };
}

/** Pixel row of the cloud line in a rock template: tips above it are solid, everything under it is hidden by the cloud skirt. */
const cloudLineOf = (h: number): number => Math.round(h * 0.74);

/**
 * A mountain range seen from above the clouds: jagged rock tips (lit left face, shaded right face, snow cap, strata cracks) standing
 * on a cloud line, with a soft cloud skirt painted over their base. ONLY the tips above the cloud line are in the collision mask.
 * `peak-*` = one main tip with a smaller neighbour, `range-*` = a cluster of several.
 */
function paintPeak(shape: ObstacleShape, variant: number): Template {
  const { w, h } = SIZES[shape];
  const rnd = mulberry32(5000 + variant * 131 + h * 7 + w);
  const line = cloudLineOf(h);
  const { canvas: rock, ctx: rc } = makeCanvas(w, h);
  // Tips: [centre x, summit y, half width at the cloud line].
  const tips: [number, number, number][] = [];
  if (shape.startsWith('range')) {
    const n = shape === 'range-l' ? 5 : 4;
    for (let i = 0; i < n; i++) {
      const cx = ((i + 0.5) / n) * w + (rnd() - 0.5) * (w / n) * 0.5;
      const mid = 1 - Math.abs((i + 0.5) / n - 0.5) * 1.1;
      const top = 4 + (1 - mid * (0.75 + rnd() * 0.35)) * (line * 0.7);
      tips.push([cx, top, (w / n) * (0.7 + rnd() * 0.35)]);
    }
  } else {
    const cx = w * (0.42 + rnd() * 0.16);
    tips.push([cx, 4, w * 0.36]);
    tips.push([cx + (rnd() < 0.5 ? -1 : 1) * w * (0.26 + rnd() * 0.1), line * (0.38 + rnd() * 0.2), w * 0.2]);
  }
  // Paint tips back to front (the tallest first so lower neighbours overlap the flanks).
  const order = [...tips].sort((a, b) => a[1] - b[1]);
  for (const [cx, top, half] of order) {
    const height = line - top;
    const steps = Math.max(5, Math.round(height / 22));
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const spread = half * Math.pow(t, 0.85);
      // Ragged flanks: steps and notches that grow towards the base.
      left.push([cx - spread * (0.78 + rnd() * 0.44), top + t * height]);
      right.push([cx + spread * (0.78 + rnd() * 0.44), top + t * height]);
    }
    const pathAll = new Path2D();
    pathAll.moveTo(cx, top);
    for (const [x, y] of right) pathAll.lineTo(x, y - (rnd() < 0.4 ? 5 : 0));
    pathAll.lineTo(cx + half * 0.9, line + 12);
    pathAll.lineTo(cx - half * 0.9, line + 12);
    for (const [x, y] of [...left].reverse()) pathAll.lineTo(x, y - (rnd() < 0.4 ? 5 : 0));
    pathAll.closePath();
    rc.save();
    rc.clip(pathAll);
    // Rock body, then the shaded right face and lit left face split along a crooked ridge line.
    rc.fillStyle = '#566174';
    rc.fillRect(0, 0, w, h);
    const ridge: [number, number][] = [[cx, top]];
    for (let i = 1; i <= steps; i++) ridge.push([cx + (rnd() - 0.45) * half * 0.36 * (i / steps), top + (i / steps) * height]);
    rc.fillStyle = '#323a4b';
    rc.beginPath();
    rc.moveTo(ridge[0][0], ridge[0][1]);
    for (const [x, y] of ridge) rc.lineTo(x, y);
    rc.lineTo(cx + half * 1.4, line + 14);
    rc.lineTo(cx + half * 1.4, top);
    rc.closePath();
    rc.fill();
    rc.fillStyle = '#7f8ba0';
    rc.beginPath();
    rc.moveTo(ridge[0][0], ridge[0][1]);
    for (const [x, y] of ridge) rc.lineTo(x, y);
    rc.lineTo(cx - half * 0.3, line + 14);
    rc.lineTo(cx - half * 1.4, line + 14);
    rc.lineTo(cx - half * 1.4, top + height * 0.35);
    rc.closePath();
    rc.fill();
    // Strata and cracks on the dark face.
    rc.strokeStyle = '#232a38';
    rc.lineWidth = 2;
    for (let i = 0; i < Math.round(height / 40); i++) {
      const y = top + height * (0.3 + rnd() * 0.65);
      rc.beginPath();
      rc.moveTo(cx + half * (0.05 + rnd() * 0.3), y);
      rc.lineTo(cx + half * (0.4 + rnd() * 0.5), y + 14 + rnd() * 22);
      rc.stroke();
    }
    // Snow cap: the upper ~45%, ragged lower edge, lit on the left and bluish in shadow on the right.
    const capH = height * (0.42 + rnd() * 0.1);
    const cap = new Path2D();
    cap.moveTo(cx, top - 1);
    cap.lineTo(cx + half * 1.1, top + capH * 0.85);
    for (let x = cx + half * 1.1; x >= cx - half * 1.1; x -= 11) cap.lineTo(x, top + capH * (0.62 + rnd() * 0.5) + (Math.round(x / 11) % 2 ? 9 : 0));
    cap.lineTo(cx - half * 1.1, top + capH * 0.85);
    cap.closePath();
    rc.fillStyle = '#f3f8fd';
    rc.fill(cap);
    rc.save();
    rc.clip(cap);
    rc.fillStyle = '#b9cde2';
    rc.beginPath();
    rc.moveTo(ridge[0][0], ridge[0][1]);
    for (const [x, y] of ridge) rc.lineTo(x, y);
    rc.lineTo(cx + half * 1.4, top + capH + 20);
    rc.lineTo(cx + half * 1.4, top);
    rc.closePath();
    rc.fill();
    rc.restore();
    rc.restore();
  }
  crisp(rc);
  shade(rc, { noise: 0.12, edge: 0.7 });
  // Collision: rock pixels above the cloud line only (taken before the base is faded into the cloud).
  const maskCut = line - 6;
  const rd = rc.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < maskCut; y++) for (let x = 0; x < w; x++) mask[y * w + x] = rd[(y * w + x) * 4 + 3] > 0 ? 1 : 0;
  // The rock's base dissolves into the cloud, so no cut-off edge shows where the skirt thins out at the sides.
  rc.globalCompositeOperation = 'destination-out';
  const fadeG = rc.createLinearGradient(0, line - 14, 0, line + 10);
  fadeG.addColorStop(0, 'rgba(0,0,0,0)');
  fadeG.addColorStop(1, 'rgba(0,0,0,1)');
  rc.fillStyle = fadeG;
  rc.fillRect(0, line - 14, w, h - line + 14);
  rc.globalCompositeOperation = 'source-over';

  // Display canvas = rock, then the cloud skirt over its base. The skirt is painted on its own canvas and masked with a soft ellipse so it
  // fades out into the background cloud deck on every side (no hard sprite edges), while the tips above the line stay crisp.
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.drawImage(rock, 0, 0);
  const { canvas: cloud, ctx: cc } = makeCanvas(w, h);
  const puffs = Math.round(w / 22);
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < puffs; i++) {
      const px = ((i + rnd()) / puffs) * (w + 40) - 20;
      const py = line - 4 + layer * (h - line) * 0.3 + (rnd() - 0.5) * 16;
      const r = 24 + rnd() * 34 + layer * 8;
      const g = cc.createRadialGradient(px, py, r * 0.1, px, py, r);
      g.addColorStop(0, 'rgba(250,252,255,0.95)');
      g.addColorStop(0.55, 'rgba(226,236,248,0.65)');
      g.addColorStop(1, 'rgba(210,224,242,0)');
      cc.fillStyle = g;
      cc.fillRect(px - r, py - r, r * 2, r * 2);
    }
  }
  // Wisps drifting up the flanks of the tips.
  for (let i = 0; i < 5; i++) {
    const px = rnd() * w;
    const py = line - 14 - rnd() * 30;
    const r = 20 + rnd() * 22;
    const g = cc.createRadialGradient(px, py, 1, px, py, r);
    g.addColorStop(0, 'rgba(245,250,255,0.55)');
    g.addColorStop(1, 'rgba(235,243,252,0)');
    cc.fillStyle = g;
    cc.fillRect(px - r, py - r, r * 2, r * 2);
  }
  cc.globalCompositeOperation = 'destination-in';
  cc.save();
  const ry = (h - line) * 1.05;
  cc.translate(w / 2, line + 2);
  cc.scale(1, ry / (w / 2));
  const mg = cc.createRadialGradient(0, 0, w * 0.2, 0, 0, w / 2);
  mg.addColorStop(0, 'rgba(0,0,0,1)');
  mg.addColorStop(0.6, 'rgba(0,0,0,0.85)');
  mg.addColorStop(1, 'rgba(0,0,0,0)');
  cc.fillStyle = mg;
  cc.fillRect(-w, -w * 4, w * 2, w * 8);
  cc.restore();
  ctx.drawImage(cloud, 0, 0);
  return { canvas, mask, w, h };
}

function template(shape: ObstacleShape, variant: number): Template {
  const key = `${shape}:${variant}`;
  let t = cache.get(key);
  if (!t) {
    t = isRockShape(shape) ? paintPeak(shape, variant) : paintDebris(shape, variant);
    cache.set(key, t);
  }
  return t;
}

export const MOTION_PRESETS: Record<MotionPreset, ObstacleMotion> = {
  straight: {},
  'drift-l': { vx: -38 },
  'drift-r': { vx: 38 },
  tumble: { spin: 1.3 },
  fast: { vy: 160, spin: 0.6 },
  weave: { wobble: { amp: 46, period: 3.2 } },
  /** Overtaking from below: moves up the screen at a set speed whatever the scroll does (see `ObstacleMotion.rise`). */
  rise: { rise: 330 },
  'rise-fast': { rise: 470, spin: 0.5 },
  'rise-tumble': { rise: 380, spin: 1.6 },
};

export class Obstacle {
  alive = true;
  t = 0;
  rot = 0;
  readonly spin: number;
  readonly vx: number;
  readonly vy: number;
  readonly wobble: { amp: number; period: number } | null;
  readonly damage: number;
  readonly carvable: boolean;
  readonly scale: number;
  readonly isPeak: boolean;
  /** Screen-space upward speed in px/s (replaces the scroll), or 0. */
  readonly rise: number;
  /** Seconds of warning marker left before the obstacle appears (bottom and side entries). While > 0 it is invisible and harmless. */
  warn = 0;
  /** Entry edge, for the warning marker. */
  edge: 'top' | 'left' | 'right' | 'bottom' = 'top';
  /** Per-instance pixels, made on the first carve (carvable obstacles only). */
  canvas: HTMLCanvasElement;
  mask: Uint8Array;
  private own = false;
  private baseX: number;
  private slideTo: number | null = null;
  private slideV = 0;
  /** Seconds the obstacle flashes after touching the player. */
  flash = 0;

  constructor(
    readonly spawn: ObstacleSpawn,
    readonly tmpl: Template,
    public x: number,
    public y: number,
  ) {
    const m: ObstacleMotion = typeof spawn.motion === 'string' ? MOTION_PRESETS[spawn.motion] : (spawn.motion ?? {});
    this.isPeak = isRockShape(spawn.shape);
    this.rise = m.rise ?? 0;
    this.spin = this.isPeak ? 0 : (m.spin ?? 0);
    this.vx = m.vx ?? 0;
    this.vy = m.vy ?? 0;
    this.wobble = m.wobble ?? null;
    this.scale = spawn.scale ?? 1;
    this.damage = spawn.damage ?? (this.isPeak ? OBSTACLE_DAMAGE.peak : OBSTACLE_DAMAGE.debris);
    this.carvable = !!spawn.carvable;
    this.canvas = tmpl.canvas;
    this.mask = tmpl.mask;
    this.baseX = x;
    this.rot = this.spin !== 0 ? (spawn.seed ?? 0) % 6 : 0;
  }

  /** Slide in from off-screen to screen x `target` (side entries). */
  slideIn(target: number, v: number): void {
    this.slideTo = target;
    this.slideV = v * Math.sign(target - this.x);
  }

  get w(): number {
    return this.tmpl.w * this.scale;
  }

  get h(): number {
    return this.tmpl.h * this.scale;
  }

  update(dt: number, scrollSpeed: number): void {
    if (this.warn > 0) {
      this.warn = Math.max(0, this.warn - dt);
      return;
    }
    this.t += dt;
    if (this.rise > 0) this.y -= this.rise * dt;
    else this.y += (scrollSpeed + this.vy) * dt;
    if (this.slideTo !== null) {
      this.x += this.slideV * dt;
      if ((this.slideV > 0 && this.x >= this.slideTo) || (this.slideV < 0 && this.x <= this.slideTo)) {
        this.x = this.slideTo;
        this.slideTo = null;
        this.baseX = this.x;
      }
    } else {
      this.baseX += this.vx * dt;
      this.x = this.baseX + (this.wobble ? Math.sin((this.t / this.wobble.period) * Math.PI * 2) * this.wobble.amp : 0);
    }
    this.rot += this.spin * dt;
    this.flash = Math.max(0, this.flash - dt);
    const reach = Math.hypot(this.w, this.h) / 2;
    if (this.y - reach > H + 40 || this.x + reach < -200 || this.x - reach > W + 200 || (this.rise > 0 && this.y + reach < -60)) this.alive = false;
    // Moving against the scroll (vy < 0) can never leave the top while it is above it: it is simply culled by the bottom/side tests.
  }

  /** Is screen point (px, py) on a solid pixel? */
  solidAt(px: number, py: number): boolean {
    const dx = px - this.x;
    const dy = py - this.y;
    const c = Math.cos(-this.rot);
    const s = Math.sin(-this.rot);
    const lx = (dx * c - dy * s) / this.scale + this.tmpl.w / 2;
    const ly = (dx * s + dy * c) / this.scale + this.tmpl.h / 2;
    const ix = Math.floor(lx);
    const iy = Math.floor(ly);
    if (ix < 0 || iy < 0 || ix >= this.tmpl.w || iy >= this.tmpl.h) return false;
    return this.mask[iy * this.tmpl.w + ix] === 1;
  }

  /** Does a circle of radius r at (px, py) touch a solid pixel? Samples the centre and a ring of 8 points. */
  touches(px: number, py: number, r: number): boolean {
    if (this.warn > 0) return false;
    const reach = Math.hypot(this.w, this.h) / 2 + r;
    if (Math.abs(px - this.x) > reach || Math.abs(py - this.y) > reach) return false;
    if (this.solidAt(px, py)) return true;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (this.solidAt(px + Math.cos(a) * r, py + Math.sin(a) * r)) return true;
    }
    return false;
  }

  /** Erase a disc (screen px) from this obstacle's own copy of the pixels. */
  carveDisc(px: number, py: number, radius: number): number {
    if (!this.own) {
      const { canvas, ctx } = makeCanvas(this.tmpl.w, this.tmpl.h);
      ctx.drawImage(this.tmpl.canvas, 0, 0);
      this.canvas = canvas;
      this.mask = this.tmpl.mask.slice();
      this.own = true;
    }
    const dx = px - this.x;
    const dy = py - this.y;
    const c = Math.cos(-this.rot);
    const s = Math.sin(-this.rot);
    const lx = (dx * c - dy * s) / this.scale + this.tmpl.w / 2;
    const ly = (dx * s + dy * c) / this.scale + this.tmpl.h / 2;
    const r = radius / this.scale;
    let n = 0;
    const w = this.tmpl.w;
    for (let y = Math.max(0, Math.floor(ly - r)); y <= Math.min(this.tmpl.h - 1, Math.ceil(ly + r)); y++) {
      for (let x = Math.max(0, Math.floor(lx - r)); x <= Math.min(w - 1, Math.ceil(lx + r)); x++) {
        if ((x - lx) ** 2 + (y - ly) ** 2 <= r * r && this.mask[y * w + x]) {
          this.mask[y * w + x] = 0;
          n++;
        }
      }
    }
    if (n > 0) {
      const g = this.canvas.getContext('2d')!;
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.arc(lx, ly, r, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    return n;
  }
}

export class ObstacleSystem {
  list: Obstacle[] = [];
  /** Debug: draw collision circles. */
  debug = false;
  private counter = 0;

  clear(): void {
    this.list = [];
  }

  /**
   * Create an obstacle at its entry position. Top: just above the screen. Left/right: just off that side, sliding in to `x`.
   * Bottom: just below the screen (give it a `rise` motion). Bottom and side entries show a warning marker on the edge for
   * `WARN_SECONDS` first.
   */
  spawn(s: ObstacleSpawn): Obstacle {
    const seed = s.seed ?? this.counter++;
    const t = template(s.shape, Math.abs(Math.floor(seed)) % TEMPLATE_VARIANTS);
    const scale = s.scale ?? 1;
    const edge = s.edge ?? 'top';
    const hh = t.h * scale;
    const startY = edge === 'bottom' ? H + hh / 2 + 4 : -hh / 2 - 2;
    const o = new Obstacle(s, t, edge === 'left' ? -t.w * scale : edge === 'right' ? W + t.w * scale : s.x, startY);
    o.edge = edge;
    if (edge === 'left' || edge === 'right') {
      o.y = s.y ?? (o.rise > 0 ? 520 : -hh * 0.3);
      o.slideIn(s.x, 110);
    }
    if (edge === 'bottom' || edge === 'left' || edge === 'right') o.warn = WARN_SECONDS;
    this.list.push(o);
    return o;
  }

  update(dt: number, scrollSpeed: number): void {
    for (const o of this.list) o.update(dt, scrollSpeed);
    if (this.list.some((o) => !o.alive)) this.list = this.list.filter((o) => o.alive);
  }

  /** The first obstacle touching the player circle, or null. Contact damage is applied by the caller (Health.hit). */
  touch(x: number, y: number, r: number): Obstacle | null {
    for (const o of this.list) if (o.touches(x, y, r)) return o;
    return null;
  }

  /** A player shot at (x, y): erodes the first carvable obstacle under it. Returns true when the shot was used up. */
  shoot(x: number, y: number, energy: number): boolean {
    for (const o of this.list) {
      if (!o.carvable || !o.solidAt(x, y)) continue;
      o.carveDisc(x, y, 5 + Math.min(14, energy / 12));
      return true;
    }
    return false;
  }

  /** A pulsing chevron on the edge an obstacle is about to come in from. */
  private drawWarning(ctx: CanvasRenderingContext2D, o: Obstacle): void {
    const k = 1 - o.warn / WARN_SECONDS;
    const pulse = 0.55 + 0.45 * Math.sin(k * Math.PI * 7);
    const ex = o.edge === 'left' ? 18 : o.edge === 'right' ? W - 18 : Math.min(W - 30, Math.max(30, o.spawn.x));
    const ey = o.edge === 'bottom' ? H - 20 : Math.min(H - 40, Math.max(120, o.y));
    const dx = o.edge === 'left' ? 1 : o.edge === 'right' ? -1 : 0;
    const dy = o.edge === 'bottom' ? -1 : 0;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.globalAlpha = 0.35 + 0.55 * pulse;
    ctx.fillStyle = '#ff6a3a';
    ctx.strokeStyle = '#ffd2a8';
    ctx.lineWidth = 2;
    const sz = Math.min(26, 12 + (o.tmpl.w * o.scale) / 12);
    ctx.beginPath();
    ctx.moveTo(dx * sz, dy * sz);
    ctx.lineTo(-dx * sz * 0.4 - dy * sz * 0.9, -dy * sz * 0.4 + dx * sz * 0.9);
    ctx.lineTo(-dx * sz * 0.4 + dy * sz * 0.9, -dy * sz * 0.4 - dx * sz * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const o of this.list) {
      if (o.warn > 0) {
        this.drawWarning(ctx, o);
        continue;
      }
      ctx.save();
      ctx.translate(Math.round(o.x), Math.round(o.y));
      if (o.rot !== 0) ctx.rotate(o.rot);
      if (o.scale !== 1) ctx.scale(o.scale, o.scale);
      ctx.drawImage(o.canvas, -o.tmpl.w / 2, -o.tmpl.h / 2);
      if (o.flash > 0) {
        ctx.globalAlpha = Math.min(1, o.flash * 3) * 0.55;
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-o.tmpl.w / 2, -o.tmpl.h / 2, o.tmpl.w, o.tmpl.h);
      }
      ctx.restore();
      if (this.debug) {
        ctx.strokeStyle = 'rgba(255,90,90,0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(o.x - o.w / 2) + 0.5, Math.round(o.y - o.h / 2) + 0.5, o.w, o.h);
      }
    }
  }
}
