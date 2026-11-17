import type { Boss } from '../boss';
import { H, W } from '../config';
import { driftSpin, driftVelocity, stepDrift } from '../debris';

/**
 * Core overload sequence (DESIGN.md "As built: finale systems and the empire ship"): what a capital ship does when its core dies.
 * Cosmetic only; the boss keeps no state it needs afterwards. Timeline (seconds, `OVERLOAD_TIMES`):
 *   0 to `chain`: chained explosions walk along the hull, speeding up, while a glow grows at the core;
 *   `chain`: the final flash (white-out), the hull is replaced by drifting debris (the same drift physics as carved chunks);
 *   `chain` + `tail`: `onComplete` fires (the game declares the win; a content session ties its victory cinematic to the
 *   `finale.hooks.onOverloadComplete` hook, see src/finale/system.ts). The debris keeps drifting and fading after that.
 */
export const OVERLOAD_TIMES = { chain: 3.6, tail: 1.6 };

/** What the sequence asks of the game. */
export interface OverloadHost {
  /** A chain explosion at (x, y): particles, shake and sound. `size` is roughly the particle count. */
  blast(x: number, y: number, size: number): void;
  /** The big one: screen flash, hit stop, rumble. */
  bigBlast(): void;
}

interface Shard {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  life: number;
}

const SHARD_LIFE = 7;

export class OverloadSequence {
  t = 0;
  /** True from the final flash on: the hull is gone (the game skips drawing the boss). */
  broken = false;
  /** True once `onComplete` has fired. */
  complete = false;
  private nextBlast = 0;
  private blasts = 0;
  private shards: Shard[] = [];
  private readonly core: { x: number; y: number };

  constructor(
    private readonly host: OverloadHost,
    private readonly boss: Boss,
    private readonly onComplete: () => void,
  ) {
    this.core = { x: boss.x + boss.core.x, y: boss.y + boss.core.y };
  }

  /** A random solid hull point, on screen when possible. */
  private hullPoint(): { x: number; y: number } {
    const b = this.boss;
    for (let tries = 0; tries < 14; tries++) {
      const lx = Math.floor(Math.random() * b.width);
      const ly = Math.floor(Math.random() * b.height);
      const sx = b.x + lx;
      const sy = b.y + ly;
      if (sx < 12 || sx > W - 12 || sy < 12 || sy > H - 12) continue;
      if (b.layers.some((l) => l.mask[ly * b.width + lx])) return { x: sx, y: sy };
    }
    return { x: Math.max(20, Math.min(W - 20, this.core.x)), y: Math.max(20, Math.min(H - 20, this.core.y + 60)) };
  }

  update(dt: number): void {
    this.t += dt;
    if (!this.broken) {
      // Explosions come faster and bigger as the chain builds.
      const k = Math.min(1, this.t / OVERLOAD_TIMES.chain);
      while (this.nextBlast <= this.t && this.t < OVERLOAD_TIMES.chain) {
        const p = this.hullPoint();
        this.host.blast(p.x, p.y, 18 + Math.round(k * 34));
        this.blasts++;
        this.nextBlast += 0.34 - 0.26 * k;
      }
      if (this.t >= OVERLOAD_TIMES.chain) this.breakApart();
    }
    for (const s of this.shards) {
      stepDrift(s, dt);
      s.life -= dt;
    }
    if (this.shards.length > 0 && this.shards.every((s) => s.life <= 0)) this.shards = [];
    if (!this.complete && this.t >= OVERLOAD_TIMES.chain + OVERLOAD_TIMES.tail) {
      this.complete = true;
      this.onComplete();
    }
  }

  /** Slice the current hull into triangular chunks and let them drift away from the core. */
  private breakApart(): void {
    this.broken = true;
    this.host.bigBlast();
    const b = this.boss;
    // Composite of every layer, back to front, as the player last saw it.
    const comp = document.createElement('canvas');
    comp.width = b.width;
    comp.height = b.height;
    const c = comp.getContext('2d')!;
    for (let i = b.layers.length - 1; i >= 0; i--) {
      b.layers[i].flush();
      c.drawImage(b.layers[i].canvas, 0, 0);
    }
    // Jittered grid, two triangles per cell: about 5 x 4 cells over the visible stretch of the hull.
    const x0 = Math.max(0, -b.x);
    const x1 = Math.min(b.width, W - b.x);
    const y0 = Math.max(0, -b.y);
    const y1 = Math.min(b.height, H - b.y);
    const cols = 6;
    const rows = 5;
    const pt = (i: number, j: number): [number, number] => {
      const edge = i === 0 || j === 0 || i === cols || j === rows;
      const jx = edge ? 0 : (Math.random() - 0.5) * 0.7;
      const jy = edge ? 0 : (Math.random() - 0.5) * 0.7;
      return [x0 + ((i + jx) / cols) * (x1 - x0), y0 + ((j + jy) / rows) * (y1 - y0)];
    };
    const grid: [number, number][][] = [];
    for (let i = 0; i <= cols; i++) {
      grid[i] = [];
      for (let j = 0; j <= rows; j++) grid[i][j] = pt(i, j);
    }
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const a = grid[i][j];
        const bb = grid[i + 1][j];
        const cc = grid[i + 1][j + 1];
        const d = grid[i][j + 1];
        for (const tri of [[a, bb, cc], [a, cc, d]] as [number, number][][]) this.addShard(comp, tri);
      }
    }
  }

  private addShard(src: HTMLCanvasElement, tri: [number, number][]): void {
    const minX = Math.floor(Math.min(...tri.map((p) => p[0])));
    const maxX = Math.ceil(Math.max(...tri.map((p) => p[0])));
    const minY = Math.floor(Math.min(...tri.map((p) => p[1])));
    const maxY = Math.ceil(Math.max(...tri.map((p) => p[1])));
    const w = maxX - minX;
    const h = maxY - minY;
    if (w < 2 || h < 2) return;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d')!;
    g.beginPath();
    tri.forEach((p, i) => (i === 0 ? g.moveTo(p[0] - minX, p[1] - minY) : g.lineTo(p[0] - minX, p[1] - minY)));
    g.closePath();
    g.clip();
    g.drawImage(src, -minX, -minY);
    const pos = { x: this.boss.x + minX + w / 2, y: this.boss.y + minY + h / 2 };
    const v = driftVelocity(pos, this.core, 1.8);
    this.shards.push({ canvas: cv, x: pos.x, y: pos.y, vx: v.vx, vy: v.vy, rot: 0, spin: driftSpin(v.vx), life: SHARD_LIFE * (0.7 + Math.random() * 0.3) });
  }

  /** Under the HUD, over the world: the growing core glow and the drifting debris. */
  draw(g: CanvasRenderingContext2D): void {
    if (!this.broken) {
      const k = Math.min(1, this.t / OVERLOAD_TIMES.chain);
      const pulse = 0.8 + 0.2 * Math.sin(this.t * (8 + 24 * k));
      const r = (40 + 520 * k * k) * pulse;
      const grad = g.createRadialGradient(this.core.x, this.core.y, 0, this.core.x, this.core.y, r);
      grad.addColorStop(0, `rgba(255, 250, 230, ${0.95 * (0.35 + 0.65 * k)})`);
      grad.addColorStop(0.35, `rgba(255, 150, 60, ${0.6 * (0.3 + 0.7 * k)})`);
      grad.addColorStop(1, 'rgba(255, 90, 30, 0)');
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      g.restore();
    }
    for (const s of this.shards) {
      if (s.life <= 0) continue;
      g.save();
      g.globalAlpha = Math.min(1, s.life / 1.5);
      g.translate(Math.round(s.x), Math.round(s.y));
      g.rotate(s.rot);
      g.drawImage(s.canvas, -s.canvas.width / 2, -s.canvas.height / 2);
      g.restore();
    }
  }

  /** The final flash, over everything (screen space, after the shake): peaks at the break and fades. */
  drawFlash(g: CanvasRenderingContext2D): void {
    const since = this.t - OVERLOAD_TIMES.chain;
    let a = 0;
    if (since < 0) a = Math.max(0, (this.t - (OVERLOAD_TIMES.chain - 0.5)) / 0.5) * 0.85;
    else a = Math.max(0, 1 - since / 1.1);
    if (a <= 0.01) return;
    g.save();
    g.fillStyle = `rgba(255, 250, 240, ${Math.min(1, a)})`;
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  get shardCount(): number {
    return this.shards.length;
  }

  get blastCount(): number {
    return this.blasts;
  }
}
