import type { Boss } from './boss';

/**
 * Hull regrowth, a per-boss anti-spam lever (DESIGN.md "Hull regrowth", issue #15). A boss opts in with
 * `BossDefinition.regrowth`; bosses without it never touch any of this.
 */
export interface RegrowthSpec {
  /** Layer index that regrows (default 0, the hull). */
  layer?: number;
  /**
   * 'slow': always regrows at `rate`. 'idle': regrows (at `idleRate`, default `rate`) only once the boss
   * has not been hit for `idleDelay` s. 'both': `rate` all the time, `idleRate` once idle.
   */
  mode: 'slow' | 'idle' | 'both';
  /** Base rate, as a fraction of the layer's ORIGINAL pixel count per second (0.001 = 0.1 %/s). */
  rate: number;
  /** Rate while idle (default: 4 x rate for 'both', `rate` for 'idle'). */
  idleRate?: number;
  /** Seconds since the boss last took player damage before the idle rate applies (default 3). */
  idleDelay?: number;
  /** Cap on the cumulative regrown pixels, as a fraction of the original layer (default 1 = no cap). */
  maxFraction?: number;
}

/** Seconds a regrown pixel glows before settling to its normal shade. */
const GLOW_TIME = 0.9;
/** Regrowth runs in ticks of this many seconds (the scan walks the whole layer). */
const TICK = 0.05;

interface Fresh {
  idx: number;
  age: number;
}

/**
 * Restores previously carved pixels of one layer from the original mask, from the edges of the standing
 * material inward.
 *
 * Rules (a pixel regrows only if ALL hold):
 *  1. It was in the original mask, is empty now, and was never lost "for good". Lost for good = broken off
 *     as a fragment or speck by the anchoring pass, or removed by a radial carve (the crater of a destroyed
 *     component, a blast). Only bullet carving is healed.
 *  2. It touches (4-neighbour) a solid pixel of the same layer. That pixel is the same original region, so a
 *     detached fragment (already removed from the mask) can never be a seed, and a region never grows into
 *     another region. Layers with a pending anchoring pass (`needsCheck`) wait for it, so nothing regrows
 *     off a chunk that is about to be cut loose.
 *  3. Stacking stays consistent: regrowth on layer L only ever fills holes of that layer. Layers above are
 *     untouched; for L > 0 it is the same state the layer had before it was carved. And it never re-buries
 *     something the player has reached: no regrowth over the hit area of a live embedded component in a
 *     deeper layer, nor over the core marker while the core is alive. So an exposed console or the core
 *     stays exposed, and the exposure rule (every layer above empty) is never broken for a live target.
 *  4. The cumulative regrown count stays under `maxFraction` of the layer.
 */
export class Regrowth {
  enabled = true;
  /** Future hook (regrowth nodes): multiplies the rate. 0 = off, 2 = twice as fast. */
  scale = 1;
  readonly layerIndex: number;
  /** Cumulative regrown pixels (a pixel carved and regrown twice counts twice). */
  regrown = 0;
  /** True while pixels regrew in the last tick (for the overlay). */
  active = false;
  private budget = 0;
  private tick = 0;
  private fresh: Fresh[] = [];

  constructor(
    private readonly boss: Boss,
    readonly spec: RegrowthSpec,
    /** True when a layer pixel must stay empty (live parts / core). Provided by the fight. */
    private readonly protectedAt: (layer: number, x: number, y: number) => boolean = () => false,
  ) {
    this.layerIndex = spec.layer ?? 0;
  }

  get idleDelay(): number {
    return this.spec.idleDelay ?? 3;
  }

  /** Seconds since the boss was last hit. */
  get sinceHit(): number {
    return this.boss.sinceHit;
  }

  get idle(): boolean {
    return this.sinceHit >= this.idleDelay;
  }

  /** Current effective rate (fraction of the original layer per second), 0 when nothing regrows. */
  get rate(): number {
    if (!this.enabled) return 0;
    const { mode, rate } = this.spec;
    const idleRate = this.spec.idleRate ?? (mode === 'both' ? rate * 4 : rate);
    let r = 0;
    if (mode === 'slow') r = rate;
    else if (this.idle) r = idleRate;
    else if (mode === 'both') r = rate;
    return r * this.scale;
  }

  /** Share of the original layer regrown so far (cumulative), 0..1. */
  get regrownFraction(): number {
    const l = this.boss.layers[this.layerIndex];
    return l.total === 0 ? 0 : this.regrown / l.total;
  }

  private get cap(): number {
    const l = this.boss.layers[this.layerIndex];
    return Math.floor((this.spec.maxFraction ?? 1) * l.total);
  }

  update(dt: number): void {
    for (const f of this.fresh) f.age += dt;
    if (this.fresh.length && this.fresh[0].age >= GLOW_TIME) this.fresh = this.fresh.filter((f) => f.age < GLOW_TIME);

    const layer = this.boss.layers[this.layerIndex];
    const missing = layer.total - layer.remaining;
    const r = this.rate;
    if (r <= 0 || missing <= 0 || this.regrown >= this.cap || layer.needsCheck) {
      this.active = false;
      this.budget = Math.min(this.budget, 1);
      return;
    }
    const perTick = r * layer.total * TICK;
    this.budget = Math.min(this.budget + r * layer.total * dt, Math.max(2, perTick * 3));
    this.tick += dt;
    if (this.tick < TICK) return;
    this.tick = 0;
    const want = Math.min(Math.floor(this.budget), this.cap - this.regrown);
    this.active = false;
    if (want < 1) return;
    const n = this.grow(want);
    this.budget -= n;
    this.active = n > 0;
  }

  /** Regrow up to `want` pixels of the edge band; returns how many. */
  private grow(want: number): number {
    const layer = this.boss.layers[this.layerIndex];
    const w = this.boss.width;
    const h = this.boss.height;
    const { mask, orig, gone } = layer;
    const frontier: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (mask[i] || !orig[i] || gone[i]) continue;
        const near =
          (x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) || (y > 0 && mask[i - w]) || (y < h - 1 && mask[i + w]);
        if (near && !this.protectedAt(this.layerIndex, x, y)) frontier.push(i);
      }
    }
    // Random pick without replacement: edges advance a pixel or two per tick, so it reads as healing.
    const n = Math.min(want, frontier.length);
    const data = layer.img.data;
    for (let k = 0; k < n; k++) {
      const j = k + ((Math.random() * (frontier.length - k)) | 0);
      const i = frontier[j];
      frontier[j] = frontier[k];
      mask[i] = 1;
      const o = i * 4;
      data[o] = layer.origRgba[o];
      data[o + 1] = layer.origRgba[o + 1];
      data[o + 2] = layer.origRgba[o + 2];
      data[o + 3] = layer.origRgba[o + 3];
      this.fresh.push({ idx: i, age: 0 });
    }
    if (n > 0) {
      layer.remaining += n;
      layer.dirty = true;
      this.regrown += n;
      this.boss.version++;
    }
    return n;
  }

  /** Soft glow over pixels that just regrew, drawn at the layer's depth (right after the layer itself). */
  drawGlow(ctx: CanvasRenderingContext2D, li: number, ox: number, oy: number): void {
    if (li !== this.layerIndex || this.fresh.length === 0) return;
    const w = this.boss.width;
    const layer = this.boss.layers[li];
    ctx.save();
    for (let b = 0; b < 4; b++) {
      ctx.fillStyle = `rgba(255, 236, 190, ${(0.6 * (1 - b / 4)).toFixed(2)})`;
      ctx.beginPath();
      for (const f of this.fresh) {
        const k = Math.min(3, Math.floor((f.age / GLOW_TIME) * 4));
        if (k !== b || !layer.mask[f.idx]) continue;
        ctx.rect(ox + (f.idx % w), oy + ((f.idx / w) | 0), 1, 1);
      }
      ctx.fill();
    }
    ctx.restore();
  }
}
