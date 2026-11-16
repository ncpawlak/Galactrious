import type { BossSpec } from '../boss';
import { TUNING } from '../config';
import { aimedShot, bomb, directVolley, lineSweep } from '../attacks';
import { still, sway } from '../movement';
import type { BossDefinition } from './types';

/**
 * Demo boss built from rectangles that mirror the design mockups. The result is the same shape a
 * PNG-based loader would produce: one painted canvas per layer (alpha > 0 = solid).
 */

const BW = 360;
const BH = 440;

type Rect = [x: number, y: number, w: number, h: number];

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = BW;
  canvas.height = BH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return { canvas, ctx };
}

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

interface ShadeOpts {
  noise: number;
  /** Brightness multiplier for pixels on the silhouette edge. */
  edge: number;
  seamEvery?: number;
}

/** Adds per-pixel noise, edge highlights/lowlights and optional panel seams to a painted canvas. */
function shade(ctx: CanvasRenderingContext2D, opts: ShadeOpts): void {
  const img = ctx.getImageData(0, 0, BW, BH);
  const d = img.data;
  const solid = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < BW && y < BH && d[(y * BW + x) * 4 + 3] > 0;
  const out = new Uint8ClampedArray(d);

  for (let y = 0; y < BH; y++) {
    for (let x = 0; x < BW; x++) {
      const i = (y * BW + x) * 4;
      if (d[i + 3] === 0) continue;
      let f = 1 - opts.noise / 2 + hash(x, y) * opts.noise;
      const onEdge = !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1);
      if (onEdge) f *= opts.edge;
      if (opts.seamEvery && (x % opts.seamEvery === 0 || y % opts.seamEvery === 0)) f *= 0.78;
      out[i] = d[i] * f;
      out[i + 1] = d[i + 1] * f;
      out[i + 2] = d[i + 2] * f;
    }
  }
  ctx.putImageData(new ImageData(out, BW, BH), 0, 0);
}

function fillRects(ctx: CanvasRenderingContext2D, rects: Rect[], color: string): void {
  ctx.fillStyle = color;
  for (const [x, y, w, h] of rects) ctx.fillRect(x, y, w, h);
}

export function createDemoBoss(): BossSpec {
  // Layer 1: hull slab.
  const hull = makeCanvas();
  fillRects(hull.ctx, [[0, 0, BW, BH]], '#c9383f');
  shade(hull.ctx, { noise: 0.14, edge: 0.7, seamEvery: 72 });

  // Layer 2: frame lattice (solid struts).
  const frame = makeCanvas();
  const struts: Rect[] = [
    [93, 47, 40, 352], // left vertical
    [171, 0, 38, 440], // center vertical (spine)
    [237, 40, 30, 359], // right vertical
    [60, 74, 253, 33], // top horizontal
    [4, 174, 356, 33], // middle horizontal
    [66, 291, 235, 32], // lower horizontal
  ];
  fillRects(frame.ctx, struts, '#c4cddb');
  shade(frame.ctx, { noise: 0.16, edge: 1.3 });

  // Layer 3: rooms.
  const rooms = makeCanvas();
  const roomRects: Rect[] = [
    [153, 0, 68, 160], // core room (top)
    [81, 173, 69, 127], // left tall
    [239, 173, 68, 57], // right upper
    [239, 250, 71, 49], // right lower
    [83, 326, 227, 60], // bottom wide
  ];
  fillRects(rooms.ctx, roomRects, '#2f7f86');
  shade(rooms.ctx, { noise: 0.12, edge: 1.7 });

  return {
    width: BW,
    height: BH,
    layers: [
      { name: 'Hull', density: TUNING.densities.hull, canvas: hull.canvas },
      { name: 'Frame', density: TUNING.densities.frame, canvas: frame.canvas },
      { name: 'Rooms', density: TUNING.densities.rooms, canvas: rooms.canvas },
    ],
    core: { x: 189, y: 71, radius: 16, hp: TUNING.coreHp },
  };
}

/**
 * The default boss: one phase reproducing the original fight (sway from TUNING.sway, all four
 * attack patterns cycled with their own intervals).
 */
export const demoBoss: BossDefinition = {
  id: 'demo',
  name: 'Demo boss',
  layout: createDemoBoss,
  spawn: TUNING.boss,
  phases: [
    {
      name: 'Phase 1',
      movement: sway(TUNING.sway.amplitude, TUNING.sway.period),
      attacks: [aimedShot, directVolley, lineSweep, bomb].map((pattern) => ({ pattern })),
    },
  ],
};

/**
 * Example of a multi-phase definition, selectable in-game with [B]. Phase 2 starts when 15% of the
 * boss pixels are gone (damage trigger), phase 3 after 12 s in phase 2 (timer trigger).
 */
export const demoBossPhased: BossDefinition = {
  id: 'demo-phased',
  name: 'Demo boss (3 phases)',
  layout: createDemoBoss,
  spawn: TUNING.boss,
  phases: [
    demoBoss.phases[0],
    {
      name: 'Phase 2: faster',
      trigger: { kind: 'damage', percent: 15 },
      movement: sway(TUNING.sway.amplitude * 1.6, TUNING.sway.period * 0.5),
      attacks: [directVolley, aimedShot, bomb].map((pattern) => ({ pattern, interval: pattern.interval * 0.7 })),
      attackDelay: 1.5,
    },
    {
      name: 'Phase 3: still',
      trigger: { kind: 'phaseTime', seconds: 12 },
      movement: still,
      attacks: [lineSweep, bomb].map((pattern) => ({ pattern })),
    },
  ],
};
