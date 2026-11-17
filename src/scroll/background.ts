import { H, W } from '../config';
import { makeCanvas } from '../bosses/paint';
import { mulberry32 } from './obstacles';
import type { BackgroundLayer, ScrollTheme } from './types';

/**
 * Scrolling background as data (`ScrollTheme`): a sky gradient and parallax layers. Heavy layers (clouds, mountains) are
 * painted once into a tile that wraps vertically; stars, snow and streaks are drawn from small particle arrays. A theme
 * switch cross-fades. Cost per frame: a handful of `drawImage`s and a few hundred `fillRect`s.
 */

const TILE = 1280;

export const SCROLL_THEMES: Record<string, ScrollTheme> = {
  /** Deep space above the planet (the first dogfights). */
  space: {
    id: 'space',
    sky: ['#03040a', '#080b1c'],
    layers: [
      { type: 'stars', speed: 0.12, count: 70, color: '#6c7aa6' },
      { type: 'stars', speed: 0.3, count: 40, color: '#a9b8e0' },
      { type: 'stars', speed: 0.6, count: 18, color: '#e8efff' },
    ],
  },
  /** Upper atmosphere: deep blue sky warming to orange, long cloud wisps and wind streaks. */
  atmosphere: {
    id: 'atmosphere',
    sky: ['#0a1640', '#1d4488', '#7aa6d8', '#f1b27a'],
    layers: [
      { type: 'clouds', speed: 0.25, count: 7, color: '#dfe9f7', alpha: 0.35, size: [140, 260] },
      { type: 'clouds', speed: 0.55, count: 6, color: '#ffffff', alpha: 0.5, size: [120, 220] },
      { type: 'streaks', speed: 1.4, count: 26, color: '#ffffff', alpha: 0.22 },
    ],
  },
  /** Arctic: pale sky, far mountain ranges, drifting cloud and snow. */
  arctic: {
    id: 'arctic',
    sky: ['#8fb6dc', '#cfe4f3', '#f3f9fd'],
    layers: [
      { type: 'mountains', speed: 0.18, color: '#9fb4cc', snow: '#eef4fa', alpha: 0.4, count: 7, height: [220, 380] },
      { type: 'clouds', speed: 0.3, count: 6, color: '#ffffff', alpha: 0.55, size: [150, 280] },
      { type: 'mountains', speed: 0.4, color: '#8aa0bb', snow: '#ffffff', alpha: 0.5, count: 5, height: [260, 460] },
      { type: 'clouds', speed: 0.7, count: 5, color: '#ffffff', alpha: 0.6, size: [120, 220] },
      { type: 'snow', speed: 1.0, count: 90, drift: 22, color: '#ffffff' },
    ],
  },
};

export function themeById(id: string): ScrollTheme {
  const t = SCROLL_THEMES[id];
  if (!t) throw new Error(`unknown scroll theme "${id}" (known: ${Object.keys(SCROLL_THEMES).join(', ')})`);
  return t;
}

interface Particle {
  x: number;
  y: number;
  s: number;
  p: number;
}

interface Built {
  layer: BackgroundLayer;
  tile?: HTMLCanvasElement;
  parts?: Particle[];
}

function buildClouds(l: Extract<BackgroundLayer, { type: 'clouds' }>, seed: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(W, TILE);
  const rnd = mulberry32(seed);
  ctx.fillStyle = l.color;
  ctx.globalAlpha = l.alpha;
  for (let i = 0; i < l.count; i++) {
    const cx = rnd() * W;
    const cy = rnd() * TILE;
    const size = l.size[0] + rnd() * (l.size[1] - l.size[0]);
    const puffs = 5 + Math.floor(rnd() * 4);
    for (let k = 0; k < puffs; k++) {
      const px = cx + (rnd() - 0.5) * size;
      const py = cy + (rnd() - 0.5) * size * 0.35;
      const r = size * (0.14 + rnd() * 0.16);
      for (const wrapY of [-TILE, 0, TILE]) {
        for (const wrapX of [-W, 0, W]) {
          ctx.beginPath();
          ctx.ellipse(px + wrapX, py + wrapY, r * 1.6, r, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  return canvas;
}

function buildMountains(l: Extract<BackgroundLayer, { type: 'mountains' }>, seed: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(W, TILE);
  const rnd = mulberry32(seed);
  const [hmin, hmax] = l.height ?? [200, 360];
  ctx.globalAlpha = l.alpha ?? 1;
  const count = l.count ?? 6;
  for (let i = 0; i < count; i++) {
    const bx = rnd() * W;
    const by = (i / count) * TILE + rnd() * (TILE / count) * 0.6;
    const hh = hmin + rnd() * (hmax - hmin);
    const ww = hh * (0.55 + rnd() * 0.35);
    for (const wrapY of [-TILE, 0]) {
      const y0 = by + wrapY;
      // Spire pointing up, ragged flanks, light left / dark right, snow tip.
      const pts: [number, number][] = [[bx, y0]];
      const steps = 7;
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        pts.push([bx + ww * 0.5 * t * (0.85 + rnd() * 0.3), y0 + hh * t]);
      }
      const back: [number, number][] = [];
      for (let k = steps; k >= 1; k--) {
        const t = k / steps;
        back.push([bx - ww * 0.5 * t * (0.85 + rnd() * 0.3), y0 + hh * t]);
      }
      const all = [...pts, ...back];
      ctx.fillStyle = l.color;
      ctx.beginPath();
      all.forEach(([x, y], k) => (k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.moveTo(bx, y0);
      for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
      ctx.lineTo(bx, y0 + hh);
      ctx.closePath();
      ctx.fill();
      if (l.snow) {
        ctx.fillStyle = l.snow;
        ctx.beginPath();
        ctx.moveTo(bx, y0);
        ctx.lineTo(bx + ww * 0.17, y0 + hh * 0.32);
        ctx.lineTo(bx + ww * 0.07, y0 + hh * 0.26);
        ctx.lineTo(bx, y0 + hh * 0.36);
        ctx.lineTo(bx - ww * 0.08, y0 + hh * 0.27);
        ctx.lineTo(bx - ww * 0.17, y0 + hh * 0.32);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  return canvas;
}

function particles(count: number, seed: number, w: number, h: number): Particle[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => ({ x: rnd() * w, y: rnd() * h, s: 0.6 + rnd() * 0.8, p: rnd() * Math.PI * 2 }));
}

/** One painted sky + layers. */
class ThemeView {
  private readonly sky: HTMLCanvasElement;
  private readonly built: Built[];

  constructor(readonly theme: ScrollTheme) {
    const { canvas, ctx } = makeCanvas(W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    theme.sky.forEach((c, i) => g.addColorStop(theme.sky.length === 1 ? 0 : i / (theme.sky.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    this.sky = canvas;
    this.built = theme.layers.map((layer, i): Built => {
      switch (layer.type) {
        case 'clouds':
          return { layer, tile: buildClouds(layer, 11 + i * 7) };
        case 'mountains':
          return { layer, tile: buildMountains(layer, 31 + i * 5) };
        case 'stars':
          return { layer, parts: particles(layer.count, 71 + i, W, TILE) };
        case 'snow':
          return { layer, parts: particles(layer.count, 91 + i, W, H) };
        case 'streaks':
          return { layer, parts: particles(layer.count, 51 + i, W, H) };
      }
    });
  }

  draw(ctx: CanvasRenderingContext2D, dist: number, time: number, alpha = 1): void {
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.sky, 0, 0);
    for (const b of this.built) {
      const l = b.layer;
      if (b.tile) {
        const off = (dist * l.speed) % TILE;
        ctx.globalAlpha = alpha;
        ctx.drawImage(b.tile, 0, Math.round(off - TILE));
        ctx.drawImage(b.tile, 0, Math.round(off));
        continue;
      }
      const parts = b.parts!;
      if (l.type === 'stars') {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = l.color ?? '#aab8e0';
        const off = dist * l.speed;
        for (const p of parts) {
          const y = (p.y + off) % TILE;
          if (y < H) ctx.fillRect(Math.round(p.x), Math.round(y), p.s > 1 ? 2 : 1, p.s > 1 ? 2 : 1);
        }
      } else if (l.type === 'snow') {
        ctx.fillStyle = l.color ?? '#fff';
        ctx.globalAlpha = alpha * 0.85;
        const off = dist * l.speed;
        for (const p of parts) {
          const y = (p.y + off * p.s + time * 14 * p.s) % H;
          const x = (((p.x + Math.sin(time * 0.8 + p.p) * l.drift) % W) + W) % W;
          ctx.fillRect(Math.round(x), Math.round(y), p.s > 1 ? 3 : 2, p.s > 1 ? 3 : 2);
        }
        ctx.globalAlpha = 1;
      } else if (l.type === 'streaks') {
        ctx.fillStyle = l.color;
        ctx.globalAlpha = alpha * l.alpha;
        const off = dist * l.speed;
        for (const p of parts) {
          const y = (p.y * 1.0 + off * p.s) % (H + 120);
          ctx.fillRect(Math.round(p.x), Math.round(y - 120), 1 + (p.s > 1 ? 1 : 0), 40 + Math.round(p.s * 50));
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = 1;
  }
}

/** The background of a scroll level: advance with the scroll distance, cross-fade between themes. */
export class ScrollBackground {
  private cur: ThemeView;
  private prev: ThemeView | null = null;
  private fade = 1;
  private fadeTime = 2;
  private time = 0;
  private views = new Map<string, ThemeView>();

  constructor(theme: string | ScrollTheme) {
    this.cur = this.view(theme);
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

  update(dt: number): void {
    this.time += dt;
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt / this.fadeTime);
      if (this.fade >= 1) this.prev = null;
    }
  }

  draw(ctx: CanvasRenderingContext2D, dist: number): void {
    if (this.prev && this.fade < 1) {
      this.prev.draw(ctx, dist, this.time);
      this.cur.draw(ctx, dist, this.time, this.fade);
    } else this.cur.draw(ctx, dist, this.time);
  }
}
