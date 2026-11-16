import type { BossSpec } from '../boss';
import { TUNING } from '../config';
import { aimedShot, bomb, directVolley, lineSweep } from '../attacks';
import { bob, combine, figureEight, named, sequence, still, sway, zip, ZIP_FAST, ZIP_NORMAL } from '../movement';
import type { BossDefinition } from './types';
import { fillRects, makeCanvas as paintCanvas, shade } from './paint';

/**
 * Demo boss built from rectangles that mirror the design mockups. The result is the same shape a
 * PNG-based loader would produce: one painted canvas per layer (alpha > 0 = solid).
 */

const BW = 360;
const BH = 440;
type Rect = [x: number, y: number, w: number, h: number];
const makeCanvas = () => paintCanvas(BW, BH);

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

/**
 * Motion demo, selectable with [B]: a MIRRORED layout (`mirror: true`) whose phases each pick a
 * different movement. Phase 2 (10% damage) zips fast, phase 3 (25%) flies a figure-eight, phase 4
 * (after 10 s) chains sway, zip and bob with `sequence`. [M] overrides the movement live.
 */
export const demoBossMotion: BossDefinition = {
  id: 'demo-motion',
  name: 'Demo boss (mirror + motion)',
  layout: createDemoBoss,
  mirror: true,
  spawn: TUNING.boss,
  phases: [
    { ...demoBoss.phases[0], name: 'Phase 1: sway' },
    {
      name: 'Phase 2: fast zip',
      trigger: { kind: 'damage', percent: 10 },
      movement: zip(ZIP_FAST),
      attacks: [directVolley, bomb, lineSweep].map((pattern) => ({ pattern })),
    },
    {
      name: 'Phase 3: figure-eight',
      trigger: { kind: 'damage', percent: 25 },
      movement: figureEight(70, 35, 6),
      attacks: [aimedShot, directVolley, bomb].map((pattern) => ({ pattern })),
    },
    {
      name: 'Phase 4: sequence',
      trigger: { kind: 'phaseTime', seconds: 10 },
      movement: sequence([
        { movement: combine(sway(55, 4), bob(25, 2)), duration: 4 },
        { movement: named('zip', zip(ZIP_NORMAL)), duration: 4 },
      ]),
      attacks: [lineSweep, bomb, aimedShot].map((pattern) => ({ pattern })),
    },
  ],
};
