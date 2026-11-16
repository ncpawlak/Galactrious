import { TUNING } from './config';

/**
 * Layered, carvable boss.
 *
 * Each layer is a 2D bitmap (mask + RGBA pixels). Layers are stacked in depth: index 0 is the
 * outermost (hull), the last is the innermost (rooms). A bullet hits the topmost layer that is
 * solid at its position. Carving a pixel costs that layer's density; a bullet carves until its
 * energy runs out. A pixel can only be carved if every layer above it is already empty there.
 */

export interface CoreSpec {
  x: number;
  y: number;
  radius: number;
  hp: number;
}

export interface LayerSpec {
  name: string;
  density: number;
  /** Painted canvas: any pixel with alpha > 0 is solid. Not mutated. */
  canvas: HTMLCanvasElement;
}

export interface BossSpec {
  width: number;
  height: number;
  /** Outermost layer first. The last layer holds the core. */
  layers: LayerSpec[];
  core: CoreSpec;
}

export interface HitResult {
  layer: number;
  carved: number;
  spent: number;
  core: boolean;
  r: number;
  g: number;
  b: number;
}

export class Layer {
  readonly mask: Uint8Array;
  readonly img: ImageData;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly total: number;
  remaining: number;
  dirty = false;
  /** Offset silhouette of this layer, drawn beneath it to cast a depth shadow onto lower layers. */
  readonly shadow: HTMLCanvasElement;
  private readonly shadowCtx: CanvasRenderingContext2D;
  /** Set when pixels were carved since the last connectivity pass. */
  needsCheck = false;

  constructor(
    readonly name: string,
    readonly density: number,
    src: HTMLCanvasElement,
  ) {
    const w = src.width;
    const h = src.height;
    const sctx = src.getContext('2d', { willReadFrequently: true })!;
    this.img = sctx.getImageData(0, 0, w, h);
    this.mask = new Uint8Array(w * h);
    let n = 0;
    for (let i = 0; i < w * h; i++) {
      if (this.img.data[i * 4 + 3] > 0) {
        this.mask[i] = 1;
        n++;
      }
    }
    this.total = n;
    this.remaining = n;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.putImageData(this.img, 0, 0);
    this.shadow = document.createElement('canvas');
    this.shadow.width = w;
    this.shadow.height = h;
    this.shadowCtx = this.shadow.getContext('2d')!;
    this.rebuildShadow();
  }

  flush(): void {
    if (!this.dirty) return;
    this.ctx.putImageData(this.img, 0, 0);
    this.rebuildShadow();
    this.dirty = false;
  }

  private rebuildShadow(): void {
    const c = this.shadowCtx;
    const { width: w, height: h } = this.shadow;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, w, h);
    c.drawImage(this.canvas, SHADOW_DX, SHADOW_DY);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = 'rgba(0, 0, 0, 0.6)';
    c.fillRect(0, 0, w, h);
  }
}

/** Pixel offsets around an impact point, sorted by (jittered) distance so holes get ragged edges. */
interface Offset {
  dx: number;
  dy: number;
  d: number;
}

/** Depth shadow offset: light comes from the upper left, so shadows fall down and right. */
const SHADOW_DX = 3;
const SHADOW_DY = 4;

const TABLE_COUNT = 8;
const { lateralPenalty, backPenalty, reach } = TUNING.carve;
const REACH_X = Math.ceil(reach / lateralPenalty);

/**
 * Carve order is an ellipse elongated along the bullet's direction (straight up): lateral and
 * backward offsets cost more, so energy digs a tunnel forward instead of widening a crater.
 */
function buildTable(): Offset[] {
  const items: (Offset & { k: number })[] = [];
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -REACH_X; dx <= REACH_X; dx++) {
      const back = dy > 0 ? backPenalty : 1;
      const d = Math.hypot(dx * lateralPenalty, dy * back);
      if (d <= reach) items.push({ dx, dy, d, k: d + Math.random() * 2.5 });
    }
  }
  items.sort((a, b) => a.k - b.k);
  return items;
}

const TABLES: Offset[][] = Array.from({ length: TABLE_COUNT }, buildTable);

/** A chunk cut off from its layer's main mass; it tumbles away and fades out. */
interface Fragment {
  canvas: HTMLCanvasElement;
  /** Screen-space center of the chunk (the boss's own sway is not applied to it). */
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  age: number;
}

/** Orphans at or below this many pixels are simply dusted away instead of becoming fragments. */
const SPECK_PIXELS = 14;
const FRAGMENT_GRAVITY = 520;
const FRAGMENT_LIFE = 2.4;
const CONNECTIVITY_INTERVAL = 0.08;

/** 8-connected component labelling of a mask; labels start at 1. */
function labelMask(mask: Uint8Array, w: number, h: number): { label: Int32Array; sizes: number[]; count: number } {
  const label = new Int32Array(w * h);
  const sizes: number[] = [0];
  const stack: number[] = [];
  let count = 0;
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || label[start]) continue;
    count++;
    let size = 0;
    label[start] = count;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const px = p % w;
      const py = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          if (nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (mask[q] && !label[q]) {
            label[q] = count;
            stack.push(q);
          }
        }
      }
    }
    sizes.push(size);
  }
  return { label, sizes, count };
}

export class Boss {
  readonly width: number;
  readonly height: number;
  readonly layers: Layer[];
  readonly core: CoreSpec;
  /** Top-left of the boss in screen space. */
  x: number;
  y: number;
  baseX: number;
  swayEnabled = true;
  private time = 0;
  private coreFlash = 0;
  private fragments: Fragment[] = [];
  private checkTimer = 0;
  /** Per layer: original connected region id of each pixel (0 = empty). Regions anchor independently. */
  private regions: Int32Array[];
  /** Dust from vanished specks and break-aways, in screen space; the game may drain this for particles. */
  readonly dustEvents: { x: number; y: number; r: number; g: number; b: number }[] = [];

  constructor(
    spec: BossSpec,
    centerX: number,
    topY: number,
  ) {
    this.width = spec.width;
    this.height = spec.height;
    this.layers = spec.layers.map((l) => new Layer(l.name, l.density, l.canvas));
    this.core = { ...spec.core };
    this.regions = this.layers.map((l) => labelMask(l.mask, spec.width, spec.height).label);
    this.baseX = centerX - spec.width / 2;
    this.x = this.baseX;
    this.y = topY;
  }

  get defeated(): boolean {
    return this.core.hp <= 0;
  }

  update(dt: number, sway: { amplitude: number; period: number }): void {
    this.time += dt;
    this.coreFlash = Math.max(0, this.coreFlash - dt);
    this.x = this.baseX;
    if (this.swayEnabled) {
      this.x += Math.sin((this.time / sway.period) * Math.PI * 2) * sway.amplitude;
    }

    this.checkTimer -= dt;
    if (this.checkTimer <= 0 && this.layers.some((l) => l.needsCheck)) {
      this.checkTimer = CONNECTIVITY_INTERVAL;
      for (let i = 0; i < this.layers.length; i++) {
        if (this.layers[i].needsCheck) this.detachOrphans(i);
      }
    }

    for (const f of this.fragments) {
      f.age += dt;
      f.vy += FRAGMENT_GRAVITY * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.spin * dt;
    }
    this.fragments = this.fragments.filter((f) => f.age < FRAGMENT_LIFE);
  }

  /**
   * Anchoring rule: a pixel is attached if it is 8-connected to the main mass of its original region (a layer may hold several separate regions, e.g. rooms). The main mass
   * is the component holding the core (innermost layer, when the core is still buried in it) or else
   * the largest component. Everything else is cut loose: specks vanish, bigger chunks break away.
   */
  private detachOrphans(li: number): void {
    const layer = this.layers[li];
    layer.needsCheck = false;
    const w = this.width;
    const h = this.height;
    const mask = layer.mask;
    const { label, sizes, count } = labelMask(mask, w, h);
    if (count === 0) return;

    // Each component belongs to one original region (current mask is a subset of the initial one).
    // Every region is anchored independently by its own largest component, or by the one holding
    // the core when the core is still buried in this (innermost) layer.
    const region = this.regions[li];
    const regionOfComp = new Int32Array(count + 1);
    for (let i = 0; i < w * h; i++) if (label[i]) regionOfComp[label[i]] = region[i];
    const bestOf = new Map<number, number>();
    for (let c = 1; c <= count; c++) {
      const r = regionOfComp[c];
      const cur = bestOf.get(r);
      if (cur === undefined || sizes[c] > sizes[cur]) bestOf.set(r, c);
    }
    if (li === this.layers.length - 1 && this.core.hp > 0) {
      const cx = Math.round(this.core.x);
      const cy = Math.round(this.core.y);
      let coreComp = 0;
      for (let dy = -2; dy <= 2 && !coreComp; dy++) {
        for (let dx = -2; dx <= 2 && !coreComp; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && y >= 0 && x < w && y < h) coreComp = label[y * w + x];
        }
      }
      if (coreComp) bestOf.set(regionOfComp[coreComp], coreComp);
    }
    const anchored = new Uint8Array(count + 1);
    for (const c of bestOf.values()) anchored[c] = 1;
    if (anchored.reduce((n, v) => n + v, 0) === count) return;

    // Bounding box per orphan component.
    const minX = new Int32Array(count + 1).fill(w);
    const minY = new Int32Array(count + 1).fill(h);
    const maxX = new Int32Array(count + 1).fill(-1);
    const maxY = new Int32Array(count + 1).fill(-1);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = label[y * w + x];
        if (!c || anchored[c]) continue;
        if (x < minX[c]) minX[c] = x;
        if (x > maxX[c]) maxX[c] = x;
        if (y < minY[c]) minY[c] = y;
        if (y > maxY[c]) maxY[c] = y;
      }
    }

    const data = layer.img.data;
    let removed = 0;
    for (let c = 1; c <= count; c++) {
      if (anchored[c]) continue;
      const bw = maxX[c] - minX[c] + 1;
      const bh = maxY[c] - minY[c] + 1;
      const speck = sizes[c] <= SPECK_PIXELS;
      let cv: HTMLCanvasElement | null = null;
      let fd: ImageData | null = null;
      if (!speck) {
        cv = document.createElement('canvas');
        cv.width = bw;
        cv.height = bh;
        fd = cv.getContext('2d')!.createImageData(bw, bh);
      }
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let y = minY[c]; y <= maxY[c]; y++) {
        for (let x = minX[c]; x <= maxX[c]; x++) {
          const i = y * w + x;
          if (label[i] !== c) continue;
          if (fd) {
            const o = ((y - minY[c]) * bw + (x - minX[c])) * 4;
            fd.data[o] = data[i * 4];
            fd.data[o + 1] = data[i * 4 + 1];
            fd.data[o + 2] = data[i * 4 + 2];
            fd.data[o + 3] = data[i * 4 + 3];
          }
          sr = data[i * 4];
          sg = data[i * 4 + 1];
          sb = data[i * 4 + 2];
          mask[i] = 0;
          data[i * 4 + 3] = 0;
          removed++;
        }
      }
      const wx = this.x + minX[c] + bw / 2;
      const wy = this.y + minY[c] + bh / 2;
      if (cv && fd) {
        cv.getContext('2d')!.putImageData(fd, 0, 0);
        const dir = wx < this.x + this.core.x ? -1 : 1;
        this.fragments.push({
          canvas: cv,
          x: wx,
          y: wy,
          vx: dir * (20 + Math.random() * 50),
          vy: -30 + Math.random() * 40,
          rot: 0,
          spin: dir * (0.6 + Math.random() * 1.6),
          age: 0,
        });
      }
      if (this.dustEvents.length < 200) this.dustEvents.push({ x: wx, y: wy, r: sr, g: sg, b: sb });
    }
    if (removed > 0) {
      layer.remaining -= removed;
      layer.dirty = true;
      // Removing an outer chunk can expose inner-layer pixels, but those are already connected
      // by definition of their own layer; deeper layers get their own pass when carved.
    }
  }

  /** Returns the fraction (0..1) of a layer still solid. */
  layerRemaining(i: number): number {
    const l = this.layers[i];
    return l.total === 0 ? 0 : l.remaining / l.total;
  }

  /**
   * Resolve a bullet at screen position (px, py) with the given energy.
   * Returns null if it is not inside any solid pixel.
   */
  hit(px: number, py: number, energy: number): HitResult | null {
    const lx = Math.floor(px - this.x);
    const ly = Math.floor(py - this.y);
    if (lx < 0 || ly < 0 || lx >= this.width || ly >= this.height) return null;
    const idx = ly * this.width + lx;

    let li = -1;
    for (let i = 0; i < this.layers.length; i++) {
      if (this.layers[i].mask[idx]) {
        li = i;
        break;
      }
    }
    if (li < 0) return null;

    const layer = this.layers[li];
    const r = layer.img.data[idx * 4];
    const g = layer.img.data[idx * 4 + 1];
    const b = layer.img.data[idx * 4 + 2];

    // The core absorbs bullets without carving.
    const innermost = li === this.layers.length - 1;
    if (
      innermost &&
      this.core.hp > 0 &&
      Math.hypot(lx - this.core.x, ly - this.core.y) <= this.core.radius
    ) {
      this.core.hp = Math.max(0, this.core.hp - energy);
      this.coreFlash = 0.08;
      return { layer: li, carved: 0, spent: energy, core: true, r: 255, g: 230, b: 80 };
    }

    const { carved, spent } = this.carve(li, lx, ly, energy);
    return { layer: li, carved, spent, core: false, r, g, b };
  }

  private exposed(layerIndex: number, idx: number): boolean {
    for (let i = 0; i < layerIndex; i++) {
      if (this.layers[i].mask[idx]) return false;
    }
    return true;
  }

  private carve(
    li: number,
    lx: number,
    ly: number,
    energy: number,
  ): { carved: number; spent: number } {
    const layer = this.layers[li];
    const table = TABLES[(Math.random() * TABLE_COUNT) | 0];
    const w = this.width;
    const h = this.height;
    const data = layer.img.data;
    let e = energy;
    let carved = 0;
    let maxD = 0;

    for (const o of table) {
      const x = lx + o.dx;
      const y = ly + o.dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const idx = y * w + x;
      if (!layer.mask[idx] || !this.exposed(li, idx)) continue;
      if (e < layer.density) break;
      e -= layer.density;
      layer.mask[idx] = 0;
      data[idx * 4 + 3] = 0;
      carved++;
      maxD = o.d;
    }

    if (carved > 0) {
      layer.remaining -= carved;
      // Scorch the rim around the new hole.
      for (const o of table) {
        if (o.d <= maxD || o.d > maxD + 2.2) continue;
        const x = lx + o.dx;
        const y = ly + o.dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const idx = y * w + x;
        if (!layer.mask[idx] || !this.exposed(li, idx)) continue;
        data[idx * 4] *= 0.72;
        data[idx * 4 + 1] *= 0.72;
        data[idx * 4 + 2] *= 0.72;
      }
      layer.dirty = true;
      layer.needsCheck = true;
    }
    return { carved, spent: energy - e };
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const l of this.layers) l.flush();
    const ox = Math.round(this.x);
    const oy = Math.round(this.y);
    const last = this.layers.length - 1;

    // Back to front; each layer casts a shadow onto everything beneath it.
    ctx.drawImage(this.layers[last].canvas, ox, oy);
    if (!this.defeated) this.drawCore(ctx, ox, oy);
    for (let i = last - 1; i >= 0; i--) {
      ctx.drawImage(this.layers[i].shadow, ox, oy);
      ctx.drawImage(this.layers[i].canvas, ox, oy);
    }

    for (const f of this.fragments) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (FRAGMENT_LIFE - f.age) / 0.8);
      ctx.translate(Math.round(f.x), Math.round(f.y));
      ctx.rotate(f.rot);
      ctx.drawImage(f.canvas, -f.canvas.width / 2, -f.canvas.height / 2);
      ctx.restore();
    }
  }

  private drawCore(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const cx = ox + this.core.x;
    const cy = oy + this.core.y;
    const flashing = this.coreFlash > 0;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = flashing ? '#ffffff' : '#ffd21f';
    ctx.strokeStyle = flashing ? '#ffe9a0' : '#a8741a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? this.core.radius : this.core.radius * 0.45;
      const px = Math.cos(a) * rad;
      const py = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
