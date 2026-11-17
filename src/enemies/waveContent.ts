import type { Formation, WaveDefinition, WaveGroup } from '../waves';

/**
 * The v1 waves, as data (see src/waves.ts for the format). Level script: src/flow/defaultRun.ts.
 * Pacing per level: wave 1 mostly small units, wave 2 adds big ones, wave 3 mixes both with more guns.
 * Level 2 doubles up and brings the Mortar; level 3 uses the "+" units (attack pauses x0.75) and dives sooner.
 * Big units sit high (y ~ 110), small rows below them; the bottom of the formation stays above y ~ 380.
 */

const row = (count: number, y: number, spacing: number, x = 270): Formation => ({ kind: 'row', count, x, y, spacing });
const slots = (...pts: [number, number][]): Formation => ({ kind: 'slots', points: pts.map(([x, y]) => ({ x, y })) });

const group = (unit: string, formation: Formation, rest: Partial<WaveGroup> = {}): WaveGroup => ({ unit, formation, ...rest });

export const WAVES: WaveDefinition[] = [
  // --- level 1 ------------------------------------------------------------------------------------------
  {
    id: 'l1w1',
    lower: 60,
    name: 'Scouts',
    groups: [
      group('drone', row(8, 170, 56), { entrance: { kind: 'drop' }, stagger: 0.3, dive: { first: 7, every: 9 } }),
      group('gunner', row(4, 245, 84), { entrance: { kind: 'swoop' }, start: 3, stagger: 0.35 }),
    ],
  },
  {
    id: 'l1w2',
    lower: 60,
    name: 'Escort',
    groups: [
      group('frigate', slots([270, 112]), { entrance: { kind: 'drop', time: 2.4 } }),
      group('gunner', { kind: 'rows', rows: 2, perRow: 4, x: 270, y: 225, spacingX: 62, spacingY: 54 }, { entrance: { kind: 'swoop' }, start: 2, stagger: 0.3 }),
      group('drone', row(5, 345, 70), { entrance: { kind: 'loop' }, start: 5, stagger: 0.35, dive: { first: 6, every: 8 } }),
    ],
  },
  {
    id: 'l1w3',
    lower: 60,
    name: 'Fleet',
    groups: [
      group('frigate', slots([140, 108], [400, 108]), { entrance: { kind: 'drop', time: 2.4 }, stagger: 0.6 }),
      group('spinner', { kind: 'arc', count: 4, x: 270, y: 170, radius: 120, sweepDeg: 90 }, { entrance: { kind: 'loop' }, start: 2, stagger: 0.5 }),
      group('gunner', row(4, 335, 90), { entrance: { kind: 'swoop' }, start: 5, stagger: 0.35 }),
      group('drone', row(6, 290, 60), { entrance: { kind: 'drop' }, start: 6, stagger: 0.25, dive: { first: 6, every: 8 } }),
    ],
  },
  // --- level 2 ------------------------------------------------------------------------------------------
  {
    id: 'l2w1',
    lower: 80,
    name: 'Swarm',
    groups: [
      group('drone', { kind: 'vee', count: 10, x: 270, y: 300, spacingX: 40, spacingY: 34 }, { entrance: { kind: 'swoop' }, stagger: 0.25, dive: { first: 5, every: 7 } }),
      group('gunner', { kind: 'rows', rows: 2, perRow: 4, x: 270, y: 170, spacingX: 64, spacingY: 52 }, { entrance: { kind: 'loop' }, start: 3, stagger: 0.3 }),
      group('spinner', slots([110, 345], [430, 345]), { entrance: { kind: 'drop' }, start: 6, stagger: 0.4 }),
    ],
  },
  {
    id: 'l2w2',
    lower: 80,
    name: 'Bombardment',
    groups: [
      group('mortar', slots([270, 112]), { entrance: { kind: 'drop', time: 2.6 } }),
      group('frigate', slots([105, 118], [435, 118]), { entrance: { kind: 'drop', time: 2.4 }, start: 1.5, stagger: 0.5 }),
      group('gunner', row(6, 245, 70), { entrance: { kind: 'swoop' }, start: 3, stagger: 0.3 }),
      group('drone', row(6, 325, 66), { entrance: { kind: 'loop' }, start: 6, stagger: 0.3, dive: { first: 5, every: 7 } }),
    ],
  },
  {
    id: 'l2w3',
    lower: 80,
    name: 'Armada',
    groups: [
      group('mortar', slots([150, 112], [390, 112]), { entrance: { kind: 'drop', time: 2.6 }, stagger: 0.6 }),
      group('frigate', slots([270, 200]), { entrance: { kind: 'drop', time: 2.8 }, start: 1.5 }),
      group('spinner', { kind: 'arc', count: 5, x: 270, y: 215, radius: 150, sweepDeg: 100 }, { entrance: { kind: 'loop' }, start: 3, stagger: 0.4 }),
      group('gunner', row(6, 345, 76), { entrance: { kind: 'swoop' }, start: 5, stagger: 0.3 }),
      group('drone', row(6, 295, 70), { entrance: { kind: 'drop' }, start: 7, stagger: 0.25, dive: { first: 5, every: 7 } }),
    ],
  },
  // --- level 3 (the "+" units shoot faster) -----------------------------------------------------------------
  {
    id: 'l3w1',
    lower: 100,
    name: 'Onslaught',
    groups: [
      group('drone', { kind: 'rows', rows: 2, perRow: 7, x: 270, y: 290, spacingX: 62, spacingY: 40 }, { entrance: { kind: 'swoop' }, stagger: 0.2, dive: { first: 4, every: 6 } }),
      group('gunner+', { kind: 'rows', rows: 2, perRow: 5, x: 270, y: 160, spacingX: 70, spacingY: 52 }, { entrance: { kind: 'loop' }, start: 3, stagger: 0.25 }),
      group('spinner+', slots([80, 360], [270, 380], [460, 360]), { entrance: { kind: 'drop' }, start: 6, stagger: 0.4 }),
    ],
  },
  {
    id: 'l3w2',
    lower: 100,
    name: 'Dreadnoughts',
    groups: [
      group('frigate+', slots([130, 112], [410, 112]), { entrance: { kind: 'drop', time: 2.4 }, stagger: 0.5 }),
      group('mortar+', slots([270, 120]), { entrance: { kind: 'drop', time: 2.6 }, start: 1.2 }),
      group('tender+', slots([270, 205]), { entrance: { kind: 'drop', time: 2.6 }, start: 2.4 }),
      group('gunner+', row(7, 255, 66), { entrance: { kind: 'swoop' }, start: 3, stagger: 0.25 }),
      group('drone', row(8, 335, 58), { entrance: { kind: 'loop' }, start: 6, stagger: 0.25, dive: { first: 4, every: 6 } }),
    ],
  },
  {
    id: 'l3w3',
    lower: 100,
    name: 'Last Stand',
    groups: [
      group('mortar+', slots([130, 112], [410, 112]), { entrance: { kind: 'drop', time: 2.6 }, stagger: 0.5 }),
      group('frigate+', slots([270, 190]), { entrance: { kind: 'drop', time: 2.8 }, start: 1.2 }),
      group('spinner+', { kind: 'arc', count: 6, x: 270, y: 235, radius: 150, sweepDeg: 110 }, { entrance: { kind: 'loop' }, start: 3, stagger: 0.35 }),
      group('gunner+', row(7, 350, 66), { entrance: { kind: 'swoop' }, start: 5, stagger: 0.25 }),
      group('drone', row(8, 300, 58), { entrance: { kind: 'drop' }, start: 7, stagger: 0.2, dive: { first: 4, every: 6 } }),
    ],
  },
];

export const waveById = (id: string): WaveDefinition => {
  const w = WAVES.find((x) => x.id === id);
  if (!w) throw new Error(`unknown wave "${id}"`);
  return w;
};
