import { H, W } from '../../config';
import { makeCanvas } from '../../bosses/paint';
import { GROUND } from '../../terrain/shadows';
import { mulberry32 } from '../obstacles';
import type { CustomBackgroundLayer, ScrollTheme } from '../types';

/**
 * Theme `surface`: the planet's arctic surface seen from straight above, for the chapter 5 surface run (DESIGN.md "As built: carvable
 * terrain and ground defences"). Built from `custom` layers (a layer that paints itself) plus the stock `snow` and `clouds` layers:
 *   1. the GROUND tile (speed 1.0, the same as walls and obstacles, so walls look fixed to it): snow drifts, ice sheets, rock outcrops,
 *      tank tracks, a road with dashed markings, and a few base installations (pale concrete pads, tanks, hangars, pipes, light posts);
 *   2. SHADOWS: the walls' plating shadows, the ship's and every flyer's silhouette thrown down-right;
 *   3. the TALL tile (speed 1.14, a parallax step above the ground): rock ridges, radar masts and towers with long shadows and blinking lights;
 *   4. high thin cloud wisps (speed 1.7), speed streaks that lengthen with the scroll speed, and a gust of snow.
 * Palette: bright snow and cold blue ice so the dark slate, bronze and red of the empire's walls and turrets stand out as the only
 * hard, saturated shapes on the screen. Decorative base buildings are pale concrete blue-grey on purpose (never slate, never red).
 */

const TH = 1280;
const TAU = Math.PI * 2;

type Ctx = CanvasRenderingContext2D;

/** Draw `fn` at y, y - TH and y + TH when it is near the tile edge, so features wrap without a seam. */
function wrapped(_ctx: Ctx, y: number, reach: number, fn: (dy: number) => void): void {
  fn(0);
  if (y < reach) fn(TH);
  if (y > TH - reach) fn(-TH);
}

function blob(ctx: Ctx, x: number, y: number, rx: number, ry: number, color: string, alpha: number, rot = 0): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  ctx.fill();
}

function jaggedPoly(ctx: Ctx, cx: number, cy: number, r: number, rnd: () => number, n = 9, squash = 1): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd() * 0.3;
    const rr = r * (0.65 + rnd() * 0.45);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * squash]);
  }
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  return pts;
}

interface Light {
  x: number;
  y: number;
  phase: number;
  rate: number;
  color: string;
}

/** The periodic x of a road or track at tile y (so it wraps). */
const roadX = (y: number, x0: number, amp: number, turns: number, ph: number): number => x0 + amp * Math.sin((y / TH) * TAU * turns + ph) + amp * 0.35 * Math.sin((y / TH) * TAU * turns * 2 + ph * 2);

function paintGround(lights: Light[]): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(W, TH);
  const rnd = mulberry32(5150);
  // Base snow and soft tonal drifts.
  ctx.fillStyle = '#e4edf3';
  ctx.fillRect(0, 0, W, TH);
  const tones = ['#d3e3ef', '#eef4f8', '#c8dcec', '#f6f9fb', '#dbe6ee'];
  for (let i = 0; i < 300; i++) {
    const x = rnd() * W;
    const y = rnd() * TH;
    const rx = 30 + rnd() * 90;
    const ry = 18 + rnd() * 60;
    const c = tones[Math.floor(rnd() * tones.length)];
    const rot = (rnd() - 0.5) * 0.7;
    wrapped(ctx, y, ry, (dy) => blob(ctx, x, y + dy, rx, ry, c, 0.3, rot));
  }
  ctx.globalAlpha = 1;
  // Wind-sculpted ripples (sastrugi): short bright and shadowed strokes lying across the wind.
  for (let i = 0; i < 220; i++) {
    const x = rnd() * W;
    const y = rnd() * TH;
    const len = 14 + rnd() * 40;
    ctx.strokeStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.7)' : 'rgba(150,175,200,0.35)';
    ctx.lineWidth = 1 + (rnd() > 0.7 ? 1 : 0);
    wrapped(ctx, y, 20, (dy) => {
      ctx.beginPath();
      ctx.moveTo(x, y + dy);
      ctx.quadraticCurveTo(x + len / 2, y + dy - 4 + rnd() * 3, x + len, y + dy + 2);
      ctx.stroke();
    });
  }
  // Ice sheets: glassy blue patches with a pale crack or two.
  for (let i = 0; i < 12; i++) {
    const x = rnd() * W;
    const y = rnd() * TH;
    const r = 28 + rnd() * 60;
    wrapped(ctx, y, r, (dy) => {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#aecbe0';
      jaggedPoly(ctx, x, y + dy, r, mulberry32(i * 31 + 7), 10, 0.7);
      ctx.fill();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#c9e0f0';
      jaggedPoly(ctx, x - 4, y + dy - 3, r * 0.7, mulberry32(i * 31 + 8), 8, 0.65);
      ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = '#f4fafe';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.5, y + dy - 2);
      ctx.lineTo(x + r * 0.1, y + dy + 5);
      ctx.lineTo(x + r * 0.6, y + dy - 6);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
  // Flat rock outcrops with a snow dusting.
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W;
    const y = rnd() * TH;
    const r = 7 + rnd() * 16;
    wrapped(ctx, y, r, (dy) => {
      ctx.fillStyle = 'rgba(70,90,115,0.28)';
      jaggedPoly(ctx, x + 3, y + dy + 4, r, mulberry32(i * 17 + 1), 8, 0.8);
      ctx.fill();
      ctx.fillStyle = i % 3 === 0 ? '#7d7770' : '#8f8981';
      jaggedPoly(ctx, x, y + dy, r, mulberry32(i * 17 + 1), 8, 0.8);
      ctx.fill();
      ctx.fillStyle = '#eef3f7';
      jaggedPoly(ctx, x - 2, y + dy - 3, r * 0.5, mulberry32(i * 17 + 2), 6, 0.7);
      ctx.fill();
    });
  }
  // Tank and boot tracks: pairs of dark furrows meandering down the tile.
  for (let t = 0; t < 4; t++) {
    const x0 = 60 + t * 130 + rnd() * 60;
    const amp = 18 + rnd() * 30;
    const ph = rnd() * TAU;
    for (const side of [-4, 4]) {
      ctx.strokeStyle = 'rgba(120,145,170,0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 2]);
      ctx.beginPath();
      for (let y = -10; y <= TH + 10; y += 8) {
        const x = roadX(y, x0, amp, 2, ph) + side;
        if (y === -10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // The road: dark asphalt with pale edge lines and a dashed centre line.
  const rx = 150;
  const ramp = 52;
  ctx.strokeStyle = 'rgba(80,100,125,0.35)';
  ctx.lineWidth = 56;
  ctx.beginPath();
  for (let y = -10; y <= TH + 10; y += 8) (y === -10 ? ctx.moveTo : ctx.lineTo).call(ctx, roadX(y, rx, ramp, 1, 0.6) + 5, y + 4);
  ctx.stroke();
  ctx.strokeStyle = '#4b505c';
  ctx.lineWidth = 46;
  ctx.beginPath();
  for (let y = -10; y <= TH + 10; y += 8) (y === -10 ? ctx.moveTo : ctx.lineTo).call(ctx, roadX(y, rx, ramp, 1, 0.6), y);
  ctx.stroke();
  for (const [off, col, dash] of [[-20, '#cfd6de', []], [20, '#cfd6de', []], [0, '#e9dfae', [14, 12]]] as const) {
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.setLineDash(dash as unknown as number[]);
    ctx.beginPath();
    for (let y = -10; y <= TH + 10; y += 8) (y === -10 ? ctx.moveTo : ctx.lineTo).call(ctx, roadX(y, rx, ramp, 1, 0.6) + off, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Base installations: pale concrete pads, tanks, hangars, pipes and light posts, in three clusters (kept off the middle lane).
  const cluster = (cy: number, side: 'left' | 'right'): void => {
    const bx = side === 'left' ? 40 : 360;
    const pad = (x: number, y: number, w: number, h: number): void => {
      wrapped(ctx, y, h, (dy) => {
        ctx.fillStyle = 'rgba(70,90,115,0.3)';
        ctx.fillRect(x + 4, y + dy + 5, w, h);
        ctx.fillStyle = '#9aa6b5';
        ctx.fillRect(x, y + dy, w, h);
        ctx.fillStyle = '#b5c0cd';
        ctx.fillRect(x, y + dy, w, 2);
        ctx.fillRect(x, y + dy, 2, h);
        ctx.strokeStyle = '#6f7a8a';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 3.5, y + dy + 3.5, w - 7, h - 7);
        for (const [lx, ly] of [[x + 1, y + dy + 1], [x + w - 4, y + dy + 1], [x + 1, y + dy + h - 4], [x + w - 4, y + dy + h - 4]]) {
          ctx.fillStyle = '#ff9a55';
          ctx.fillRect(lx, ly, 3, 3);
          if (dy === 0) lights.push({ x: lx + 1.5, y: ly + 1.5, phase: rnd() * TAU, rate: 1.6 + rnd() * 2, color: '#ffb36a' });
        }
      });
    };
    pad(bx, cy, 120, 74);
    // Landing mark.
    ctx.fillStyle = '#d6dde6';
    ctx.fillRect(bx + 40, cy + 22, 40, 4);
    ctx.fillRect(bx + 40, cy + 48, 40, 4);
    ctx.fillRect(bx + 58, cy + 22, 4, 30);
    // Tanks.
    for (let k = 0; k < 3; k++) {
      const tx = bx + 20 + k * 38;
      const ty = cy + 110;
      wrapped(ctx, ty, 20, (dy) => {
        ctx.fillStyle = 'rgba(70,90,115,0.3)';
        ctx.beginPath();
        ctx.arc(tx + 4, ty + dy + 5, 15, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#aeb9c6';
        ctx.beginPath();
        ctx.arc(tx, ty + dy, 15, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#d3dce6';
        ctx.beginPath();
        ctx.arc(tx - 4, ty + dy - 4, 7, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#7d8898';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(tx, ty + dy, 15, 0, TAU);
        ctx.stroke();
      });
    }
    // Pipes between tanks and the pad.
    ctx.strokeStyle = '#7d8898';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bx + 20, cy + 94);
    ctx.lineTo(bx + 20, cy + 74);
    ctx.moveTo(bx + 96, cy + 94);
    ctx.lineTo(bx + 96, cy + 74);
    ctx.stroke();
    // A hangar roof.
    wrapped(ctx, cy + 170, 40, (dy) => {
      ctx.fillStyle = 'rgba(70,90,115,0.3)';
      ctx.fillRect(bx + 4, cy + 170 + dy + 5, 100, 40);
      ctx.fillStyle = '#8693a4';
      ctx.fillRect(bx, cy + 170 + dy, 100, 40);
      ctx.fillStyle = '#a5b1c0';
      for (let r = 0; r < 100; r += 10) ctx.fillRect(bx + r, cy + 170 + dy, 6, 40);
      ctx.fillStyle = '#6f7a8a';
      ctx.fillRect(bx, cy + 170 + dy + 36, 100, 4);
    });
    // Light posts along a service path to the road.
    for (let k = 0; k < 6; k++) {
      const lx = side === 'left' ? bx + 128 + k * 6 : bx - 8 - k * 6;
      const ly = cy + 20 + k * 22;
      wrapped(ctx, ly, 6, (dy) => {
        ctx.fillStyle = '#5c6676';
        ctx.fillRect(lx, ly + dy, 3, 3);
        if (dy === 0) lights.push({ x: lx + 1.5, y: ly + 1.5, phase: rnd() * TAU, rate: 1 + rnd() * 1.5, color: '#ffd29a' });
      });
    }
  };
  cluster(100, 'right');
  cluster(560, 'left');
  cluster(960, 'right');
  ctx.globalAlpha = 1;
  return canvas;
}

/** Tall features: ridges, radar masts and towers with long shadows. `lights` blink on top of them. */
function paintTall(lights: Light[]): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(W, TH);
  const rnd = mulberry32(7771);
  const SX = 16;
  const SY = 26;
  const feature = (kind: 'ridge' | 'mast' | 'dish', x: number, y: number, s: number): void => {
    wrapped(ctx, y, 60 * s, (dy) => {
      const yy = y + dy;
      if (kind === 'ridge') {
        ctx.fillStyle = 'rgba(60,85,115,0.3)';
        jaggedPoly(ctx, x + SX * s, yy + SY * s, 30 * s, mulberry32(Math.floor(x * 7 + y)), 9, 1.5);
        ctx.fill();
        ctx.fillStyle = '#7a746d';
        const pts = jaggedPoly(ctx, x, yy, 30 * s, mulberry32(Math.floor(x * 7 + y)), 9, 1.5);
        ctx.fill();
        ctx.fillStyle = '#a79f95';
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        ctx.lineTo(x, yy - 8 * s);
        ctx.lineTo(pts[1][0], pts[1][1]);
        ctx.lineTo(x, yy);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f4f8fb';
        jaggedPoly(ctx, x - 3 * s, yy - 6 * s, 12 * s, mulberry32(Math.floor(x + y * 3)), 7, 1.2);
        ctx.fill();
      } else if (kind === 'mast') {
        ctx.strokeStyle = 'rgba(60,85,115,0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 2, yy + 2);
        ctx.lineTo(x + SX * 2.2 * s, yy + SY * 2.2 * s);
        ctx.stroke();
        ctx.fillStyle = '#7d8898';
        ctx.fillRect(x - 5, yy - 5, 10, 10);
        ctx.fillStyle = '#b5c0cd';
        ctx.fillRect(x - 5, yy - 5, 10, 2);
        ctx.fillStyle = '#4e5766';
        ctx.fillRect(x - 2, yy - 2, 4, 4);
        if (dy === 0) lights.push({ x, y: yy, phase: rnd() * TAU, rate: 1.4 + rnd(), color: '#ff7a3d' });
      } else {
        ctx.fillStyle = 'rgba(60,85,115,0.3)';
        ctx.beginPath();
        ctx.ellipse(x + SX * s, yy + SY * s, 20 * s, 14 * s, 0.4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#9aa6b5';
        ctx.beginPath();
        ctx.ellipse(x, yy, 18 * s, 18 * s, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#c4cfdb';
        ctx.beginPath();
        ctx.ellipse(x - 3 * s, yy - 3 * s, 12 * s, 12 * s, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#6f7a8a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, yy, 18 * s, 0, TAU);
        ctx.moveTo(x - 18 * s, yy);
        ctx.lineTo(x + 18 * s, yy);
        ctx.moveTo(x, yy - 18 * s);
        ctx.lineTo(x, yy + 18 * s);
        ctx.stroke();
        ctx.fillStyle = '#4e5766';
        ctx.fillRect(x - 2, yy - 2, 4, 4);
      }
    });
  };
  // Ridges hug the sides; masts and dishes sit near the base clusters.
  for (let i = 0; i < 9; i++) {
    const left = i % 2 === 0;
    feature('ridge', left ? 20 + rnd() * 70 : W - 20 - rnd() * 70, (i / 9) * TH + rnd() * 60, 0.9 + rnd() * 0.9);
  }
  for (let i = 0; i < 7; i++) feature('mast', 30 + rnd() * (W - 60), rnd() * TH, 1);
  for (let i = 0; i < 4; i++) feature('dish', rnd() > 0.5 ? 150 + rnd() * 60 : 400 + rnd() * 100, rnd() * TH, 0.8 + rnd() * 0.5);
  ctx.globalAlpha = 1;
  return canvas;
}

function tileLayer(paint: (lights: Light[]) => HTMLCanvasElement, share: number): () => CustomBackgroundLayer {
  return () => {
    const lights: Light[] = [];
    let tile: HTMLCanvasElement | null = null;
    return {
      draw(ctx, dist, _speed, time, alpha) {
        if (!tile) tile = paint(lights);
        const off = ((dist * share) % TH + TH) % TH;
        ctx.globalAlpha = alpha;
        ctx.drawImage(tile, 0, off - TH);
        ctx.drawImage(tile, 0, off);
        // Blinking lights (additive dots; dist-locked to the tile).
        ctx.globalCompositeOperation = 'lighter';
        for (const l of lights) {
          const k = 0.5 + 0.5 * Math.sin(time * l.rate + l.phase);
          if (k < 0.35) continue;
          for (const y of [l.y + off - TH, l.y + off, l.y + off + TH]) {
            if (y < -8 || y > H + 8) continue;
            ctx.globalAlpha = alpha * (0.25 + 0.5 * k);
            ctx.fillStyle = l.color;
            ctx.beginPath();
            ctx.arc(l.x, y, 4, 0, TAU);
            ctx.fill();
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      },
    };
  };
}

/** Shadows of the walls, the ship and the flyers on the snow (soft, offset down-right like a low sun at the upper left). */
function shadowLayer(): CustomBackgroundLayer {
  const ship = makeCanvas(56, 56);
  const flyer = makeCanvas(56, 56);
  const sx = ship.ctx;
  sx.fillStyle = '#16233a';
  sx.beginPath();
  sx.moveTo(28, 4);
  sx.lineTo(36, 20);
  sx.lineTo(54, 40);
  sx.lineTo(54, 46);
  sx.lineTo(34, 38);
  sx.lineTo(28, 52);
  sx.lineTo(22, 38);
  sx.lineTo(2, 46);
  sx.lineTo(2, 40);
  sx.lineTo(20, 20);
  sx.closePath();
  sx.fill();
  const fx = flyer.ctx;
  fx.fillStyle = '#16233a';
  fx.beginPath();
  fx.moveTo(28, 52);
  fx.lineTo(34, 36);
  fx.lineTo(54, 14);
  fx.lineTo(54, 20);
  fx.lineTo(34, 26);
  fx.lineTo(28, 6);
  fx.lineTo(22, 26);
  fx.lineTo(2, 20);
  fx.lineTo(2, 14);
  fx.lineTo(22, 36);
  fx.closePath();
  fx.fill();
  return {
    draw(ctx, _d, _s, _t, alpha) {
      for (const p of GROUND.pieces) {
        ctx.globalAlpha = alpha * 0.85;
        ctx.drawImage(p.canvas, Math.round(p.x) + 5, Math.round(p.y) + 7);
      }
      for (const c of GROUND.casters) {
        const spr = c.kind === 'ship' ? ship.canvas : flyer.canvas;
        const k = Math.max(0.5, c.size / 22);
        // Flyers are higher than the ship, so their shadow is thrown farther.
        const dx = c.kind === 'ship' ? 26 : 34;
        const dy = c.kind === 'ship' ? 38 : 50;
        ctx.globalAlpha = alpha * (c.kind === 'ship' ? 0.26 : 0.2);
        ctx.drawImage(spr, Math.round(c.x + dx - 28 * k), Math.round(c.y + dy - 28 * k), 56 * k, 56 * k);
      }
      ctx.globalAlpha = 1;
    },
  };
}

/** High wisps (speed 1.7) and speed streaks (long at speed, nothing standing still) and a haze that grows with the weather. */
function airLayer(): CustomBackgroundLayer {
  const rnd = mulberry32(31337);
  const wisps = Array.from({ length: 5 }, () => ({ x: rnd() * W, y: rnd() * (H + 300), w: 160 + rnd() * 200, h: 30 + rnd() * 40, a: 0.1 + rnd() * 0.12 }));
  const streaks = Array.from({ length: 34 }, () => ({ x: rnd() * W, y: rnd() * (H + 200), s: 0.7 + rnd() * 0.9 }));
  return {
    draw(ctx, dist, speed, time, alpha, weather) {
      const span = H + 300;
      ctx.fillStyle = '#ffffff';
      for (const w of wisps) {
        const y = (((w.y + dist * 1.7) % span) + span) % span - 150;
        ctx.globalAlpha = alpha * w.a * (1 + weather);
        ctx.beginPath();
        ctx.ellipse(w.x + Math.sin(time * 0.2 + w.y) * 14, y, w.w / 2, w.h / 2, 0.15, 0, TAU);
        ctx.fill();
      }
      const len = Math.min(150, Math.max(0, (speed - 60) * 0.5));
      if (len > 4) {
        ctx.fillStyle = '#f2f9ff';
        ctx.globalAlpha = alpha * 0.45;
        const sp2 = H + 200;
        for (const s of streaks) {
          const y = (((s.y + dist * 1.9 * s.s) % sp2) + sp2) % sp2 - 100;
          ctx.fillRect(Math.round(s.x), Math.round(y - len * s.s), 1 + (s.s > 1.2 ? 1 : 0), Math.round(len * s.s));
        }
      }
      if (weather > 0.02) {
        ctx.globalAlpha = alpha * 0.22 * weather;
        ctx.fillStyle = '#eef5fb';
        ctx.fillRect(0, 0, W, H);
      }
      ctx.globalAlpha = 1;
    },
  };
}

export const SURFACE_THEME: ScrollTheme = {
  id: 'surface',
  sky: ['#dfe9f1', '#e6eef4', '#edf3f7'],
  layers: [
    { type: 'custom', make: tileLayer(paintGround, 1) },
    { type: 'custom', make: shadowLayer },
    { type: 'custom', make: tileLayer(paintTall, 1.14) },
    { type: 'custom', make: airLayer },
    { type: 'snow', speed: 1.4, count: 40, drift: 18, color: '#ffffff', weather: [0.4, 1] },
  ],
};
