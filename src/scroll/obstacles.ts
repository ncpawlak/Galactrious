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
  'peak-s': { w: 90, h: 240 },
  'peak-m': { w: 150, h: 380 },
  'peak-l': { w: 230, h: 560 },
};

/** Contact damage defaults (the player has 5 hull; an enemy bullet is 1, a sweep or bomb 2). */
export const OBSTACLE_DAMAGE: Record<'debris' | 'peak', number> = { debris: 1, peak: 2 };

const TEMPLATE_VARIANTS = 4;
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

function paintPeak(shape: ObstacleShape, variant: number): Template {
  const { w, h } = SIZES[shape];
  const rnd = mulberry32(5000 + variant * 131 + h);
  const { canvas, ctx } = makeCanvas(w, h);
  const cx = w / 2 + (rnd() - 0.5) * w * 0.12;
  // A tall jagged spire: summit near the top, ragged flanks stepping outwards to a broad base.
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  const steps = Math.round(h / 34);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const half = (w / 2 - 2) * Math.pow(t, 0.8);
    left.push([cx - half * (0.8 + rnd() * 0.4), 2 + t * (h - 4)]);
    right.push([cx + half * (0.8 + rnd() * 0.4), 2 + t * (h - 4)]);
  }
  const path = new Path2D();
  path.moveTo(cx, 0);
  for (const [x, y] of right) path.lineTo(x + (rnd() - 0.5) * 8, y + (i2(y) ? 6 : 0));
  for (const [x, y] of [...left].reverse()) path.lineTo(x + (rnd() - 0.5) * 8, y + (i2(y) ? 6 : 0));
  path.closePath();
  ctx.fillStyle = '#5b6070';
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  // Shadowed right flank, lit left flank.
  ctx.fillStyle = '#3d4150';
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(w, h);
  ctx.lineTo(cx + w * 0.08, h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#7a8094';
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx - w * 0.5, h);
  ctx.lineTo(cx - w * 0.2, h);
  ctx.closePath();
  ctx.fill();
  // Cracks.
  ctx.strokeStyle = '#2b2e3a';
  ctx.lineWidth = 2;
  for (let i = 0; i < Math.round(h / 90); i++) {
    const y = h * (0.2 + rnd() * 0.75);
    ctx.beginPath();
    ctx.moveTo(cx + (rnd() - 0.5) * w * 0.5, y);
    ctx.lineTo(cx + (rnd() - 0.5) * w * 0.6, y + 24 + rnd() * 30);
    ctx.stroke();
  }
  // Snow cap on the upper third, ragged lower edge.
  ctx.fillStyle = '#eef4fb';
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  const capH = h * 0.32;
  ctx.lineTo(w, capH * 0.9);
  for (let x = w; x >= 0; x -= 14) ctx.lineTo(x, capH * (0.7 + rnd() * 0.5) + (x % 28 === 0 ? 10 : 0));
  ctx.lineTo(0, capH * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c9d8ea';
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(w, capH * 0.9);
  ctx.lineTo(cx + 6, capH);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  crisp(ctx);
  shade(ctx, { noise: 0.14, edge: 0.7 });
  return { canvas, mask: maskOf(ctx), w, h };
}

const i2 = (y: number): boolean => Math.floor(y / 17) % 2 === 0;

function template(shape: ObstacleShape, variant: number): Template {
  const key = `${shape}:${variant}`;
  let t = cache.get(key);
  if (!t) {
    t = shape.startsWith('peak') ? paintPeak(shape, variant) : paintDebris(shape, variant);
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
    this.isPeak = spawn.shape.startsWith('peak');
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
    this.t += dt;
    this.y += (scrollSpeed + this.vy) * dt;
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
    if (this.y - reach > H + 40 || this.x + reach < -200 || this.x - reach > W + 200) this.alive = false;
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

  /** Create an obstacle at its entry position. Top: just above the screen. Left/right: just off that side, sliding in to `x`. */
  spawn(s: ObstacleSpawn): Obstacle {
    const seed = s.seed ?? this.counter++;
    const t = template(s.shape, Math.abs(Math.floor(seed)) % TEMPLATE_VARIANTS);
    const scale = s.scale ?? 1;
    const edge = s.edge ?? 'top';
    const o = new Obstacle(s, t, edge === 'left' ? -t.w * scale : edge === 'right' ? W + t.w * scale : s.x, -(t.h * scale) / 2 - 2);
    if (edge !== 'top') {
      o.y = -(t.h * scale) * 0.3;
      o.slideIn(s.x, 110);
    }
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

  draw(ctx: CanvasRenderingContext2D): void {
    for (const o of this.list) {
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
