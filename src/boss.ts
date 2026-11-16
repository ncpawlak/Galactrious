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

  constructor(
    spec: BossSpec,
    centerX: number,
    topY: number,
  ) {
    this.width = spec.width;
    this.height = spec.height;
    this.layers = spec.layers.map((l) => new Layer(l.name, l.density, l.canvas));
    this.core = { ...spec.core };
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
